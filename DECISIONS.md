# Architecture & Design Decisions

---

## 1. Scope

### What I built

- User registration, login, and session management (JWT, stateless)
- Plan generation from a career profile input — deterministic eligibility + LLM narrative
- Three hard-fail deterministic checks: data coverage, salary shortfall, timeline conflict
- Structured `data_confidence` ratings on every API response field
- Saved plans persisted per user (Supabase PostgreSQL via Prisma)
- Reference data endpoint (`/api/v1/destinations`) — roles are bundled in the list response so the frontend needs only one request
- Full Next.js frontend: register, login, generate, plans list, plan detail

### What I skipped and why

| Skipped | Reason |
|---|---|
| BullMQ / Redis queue | Adds ops complexity; LLM calls are fast enough at prototype scale. Documented how to add it. |
| Redis response caching | Same — would cache on `hash(input)`, straightforward to retrofit. |
| PDF export | UI polish, not core to the plan quality signal. |
| Email verification / password reset | Out of scope for a take-home; JWT auth works end-to-end. |
| Dockerized deployment | Added setup instructions instead; Docker would just wrap the same env vars. |
| Per-destination lazy role loading | Built `/api/v1/destinations/[slug]/roles` but removed it as dead code — bundling roles in the destinations list response is one fewer round trip with no downside at this data size. |

**The core trade-off:** I chose depth on the eligibility engine (three distinct failure modes with typed error codes, structured salary/timeline breakdowns, confidence ratings) over breadth (more destinations, more roles, more UI screens). A plan that gives honest, sourced answers for two destinations is more useful than optimistic answers for ten.

---

## 2. AI vs. Deterministic Logic

**All eligibility, salary, and timeline decisions are deterministic. The LLM never touches these.**

The pipeline is strictly ordered:

```
1. Data lookup          → 404 DATA_NOT_COVERED if destination+role not in data layer
2. Work auth filter     → prune routes by user's sponsorship constraint
3. Salary check         → 422 SALARY_SHORTFALL if salary falls below every eligible route
4. Timeline check       → 409 TIMELINE_CONFLICT if user timeline < fastest route + hiring minimum
5. Build structured plan (feasibility, salary assessment, timeline breakdown)
6. LLM call             → narrative summary + action steps (prose only)
```

### Why this line

LLMs hallucinate. Telling a user they qualify for a Skilled Worker Visa when they don't is actively harmful — it could cost them visa application fees, legal advice time, or a job offer. The deterministic layer uses JSON data sourced from government publications and job boards; it is correct by construction.

The LLM's job is to take the already-correct structured output and write a readable summary. It never makes a binary decision.

### Options I considered

**Option A (chosen):** Deterministic first, LLM for prose only.
- Gives up: richer, context-aware eligibility reasoning the LLM could theoretically provide.
- Gains: zero hallucination risk on eligibility, instant failure feedback with typed error codes, full plan still usable if LLM is down.

**Option B:** LLM makes all decisions, prompted with data.
- Gives up: correctness guarantees. Even with a strong system prompt, a model can confidently return wrong salary thresholds or invent visa routes.
- Gains: potentially richer narrative. Not worth the risk for anything touching legal/financial decisions.

### LLM failure mode

If the LLM times out or returns malformed JSON, `narrative_summary` is `null` and `llm_status` is `"timeout"` or `"error"`. The plan is still complete and fully usable. No 500. The frontend degrades gracefully by hiding the summary section.

---

## 3. Data Confidence

### The problem

Salary data for "Senior Backend Engineer in Germany" from a job board survey is not the same quality as a visa salary threshold sourced directly from the German Federal Employment Agency. Both are useful, but a user should know which to rely on.

### How it flows

Data confidence is set at the field level inside each destination/role JSON file:

```json
"salary": {
  "median": 85000,
  "data_confidence": "estimated"
},
"work_authorisation_routes": [
  {
    "name": "EU Blue Card",
    "salary_minimum_eur": 45300,
    "data_confidence": "verified"
  }
]
```

At plan generation time, the engine reads each field's confidence and aggregates to an `overall` using the most conservative level present:

```
verified → estimated → placeholder   (trust descending)
```

The API response carries both `overall` and per-field breakdowns:

```json
"data_confidence": {
  "overall": "estimated",
  "fields": {
    "salary": "estimated",
    "work_authorisation": "verified",
    "timeline": "estimated",
    "market_demand": "estimated",
    "credentials": "estimated"
  }
}
```

The frontend renders a confidence badge per section so users know exactly which parts of the plan to stress-test before acting on them.

### Confidence levels

| Level | Meaning |
|---|---|
| `verified` | Sourced from official government publications (e.g., UK Home Office, German BAMF) |
| `estimated` | Derived from job boards, salary surveys — directionally correct, not authoritative |
| `placeholder` | Synthetic data — must be replaced with real sourcing before production use |

### What I gave up

Setting confidence at the field level requires discipline when adding new destination data. A simpler approach (one confidence level per destination file) would be easier to maintain but loses the nuance — a file can have verified visa thresholds and estimated salary data at the same time.

---

## 4. LLM Choice

### Options considered

| Model | Reason considered | Reason rejected |
|---|---|---|
| GPT-4o | Best narrative quality | Requires paid OpenAI account — reviewers couldn't run it |
| Groq (Llama 3 70B) | Fast, free tier | Free tier rate limits are tight; context window smaller |
| Gemini Flash (chosen) | Generous free tier, 1M token context, fast | Occasionally verbose JSON output needs post-processing |
| Ollama (local fallback) | Zero cost, fully private | Requires local install; not portable for reviewers |

### What I chose and why

**Primary: Gemini** (`gemini-3.1-flash-lite-preview` via Google AI Studio free tier)

- Context window is large enough to pass the full plan JSON as input without chunking
- Reliable JSON output mode — the prompt asks for structured JSON, Gemini follows it consistently
- Free tier is generous enough for repeated reviewer runs without hitting rate limits
- Configured via `LLM_PROVIDER=gemini` + `LLM_API_KEY`

**Fallback: Ollama (local Llama 3)**

- Configured via `LLM_PROVIDER=ollama` — requires `ollama pull llama3` locally
- Zero API cost, fully private, no rate limits
- Narrative quality is lower than Gemini but the structured data is unaffected

### Limitations I worked around

- Gemini sometimes wraps JSON output in markdown code fences — the service strips these before parsing
- The model name is intentionally not surfaced in the UI; it is implementation detail
- If the LLM returns invalid JSON after stripping, the engine falls back to deterministic action steps built from the data layer — the plan is never empty

---

## 5. Scale Assumption

**The single assumption that breaks first under real load: unbounded concurrent LLM calls.**

Every `/api/v1/plans/generate` request makes a live LLM API call synchronously. Under concurrent load:

- 50 simultaneous users → 50 simultaneous Gemini API calls
- Gemini free tier rate-limits at ~15 RPM → queue backs up, timeouts cascade
- Each request holds an open Next.js serverless function for up to 15 seconds

### What breaks and when

| Load level | Behaviour |
|---|---|
| 1–5 concurrent users | Works fine, ~3–8s response |
| 10–20 concurrent users | Gemini rate limit hit, LLM calls start timing out, plans degrade to no narrative |
| 50+ concurrent users | Function timeout backpressure, DB connection pool exhaustion likely |

### The fix (not implemented)

```
Request → BullMQ queue (Redis) → Worker pool (concurrency: 5) → Gemini API
```

The deterministic checks run instantly outside the queue. Only the LLM call is queued. Users get a job ID back immediately and poll for completion. The JWT-based auth is already stateless, so horizontal scaling of the web layer is architecturally possible without further changes.

---

## 6. Hindsight

**The one decision I would make differently: seed destination data into the database, not JSON files.**

Currently, the data layer is a folder of JSON files read from disk at runtime (`data/destinations/{slug}/{role}.json`). This was the right call to move fast — no schema design, no seed scripts, easy to edit. But it has a compounding maintenance cost:

- Adding a new destination requires a file system change and a deploy
- There is no way to query "which destinations support role X" without reading every file
- The frontend destination list is a manually maintained `index.json` that can drift from the actual files
- An admin interface to update salary data or add routes is impossible without direct file system access

The correct architecture is to seed this data into PostgreSQL on first boot (or via a seed script) with a proper schema: `destinations`, `roles`, `work_auth_routes`, `salary_data` tables. Prisma already manages the DB — adding these tables is a small migration. This would make the destination list queryable, the data editable via an admin UI, and the confidence ratings filterable (e.g., "show only verified data").

I didn't do this because the JSON approach unblocked everything else immediately. But it is the decision that creates the most friction as the product scales.
