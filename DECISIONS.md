# Architecture & Design Decisions

This document captures the non-trivial decisions behind the Career Relocation
Advisor MVP — what was built, what was consciously skipped, and where the
obvious future enhancements sit. It is deliberately written against what the
code actually does today, not what I'd like it to do.

Each of the six sections required by the task brief is covered below.

---

## 1. Scope

### What's built

- **Auth** — Email + password registration, login, JWT-based session
  (`jsonwebtoken` + `bcrypt`, 12 rounds). Stateless, short setup.
- **Plan generation pipeline** — Deterministic eligibility + salary + timeline
  checks, then an LLM call for narrative and ranked action steps.
- **Three hard-fail deterministic edge cases** — `DATA_NOT_COVERED` (404),
  `SALARY_SHORTFALL` (422), `TIMELINE_CONFLICT` (409). All return structured
  JSON with typed `code` and a contextual `*_details` payload.
- **Per-field `data_confidence` ratings** aggregated to an `overall` verdict
  on every plan response.
- **User persistence** — Plans are saved per user in PostgreSQL via Prisma,
  listed with pagination, retrievable by id (403 on other users' plans),
  deletable. Fulfils the "save and return to it later" requirement.
- **Reference data endpoint** — `GET /api/v1/destinations` returns the full
  destination + role index in one payload so the frontend needs only one
  round trip.
- **Frontend** — Next.js pages for register, login, generate, plans list,
  and plan detail. Functional, not visually polished (the task brief
  explicitly deprioritises this).
- **Versioned API under `/api/v1/*`** with a consistent envelope shape
  (`{success, data, meta}` / `{success, error: {code, message, ...extra}}`).

### What's consciously skipped

| Skipped | Reason |
| --- | --- |
| Async queue (BullMQ / Redis) for LLM calls | Ops overhead outweighs the benefit at prototype scale. See §5 for the plan. |
| Response caching for repeated identical inputs | Same reasoning. Caching on `hash(input)` is straightforward to retrofit. |
| Explicit `AbortController` timeout on the Gemini call | Relying on the runtime's function timeout is sufficient for an MVP. See Future Enhancements. |
| `httpOnly` auth cookie + refresh token rotation | The MVP stores the JWT in a client-readable cookie. Fast, good enough for a take-home; production would flip this. See §4. |
| Rate limiting on auth / plan endpoints | Not required by the brief; would add a middleware + Redis for a real deployment. |
| Password complexity rules, email verification, password reset | Out of scope for a 7-day MVP. Login/register works end-to-end. |
| Role / destination admin UI | Data is edited directly in JSON files. New destinations are data-only, which the brief explicitly requires. |
| PDF / email export of saved plans | UI polish, not a signal the brief cares about. |
| Dockerfile / deployed URL | Optional per the brief. Setup instructions in the README are enough to run locally in under two minutes. |

### The core trade-off

I chose **depth on the correctness engine** (three distinct typed failure
modes, structured salary/timeline breakdowns, per-field confidence) over
**breadth** (more destinations, more roles, more UI polish). For a product
whose value is "honest feasibility", shipping optimistic answers for ten
countries would be a worse outcome than sharp, sourced answers for two.

---

## 2. AI vs. Deterministic Logic

**All eligibility, salary, and timeline decisions are deterministic. The LLM
never makes a correctness call.**

The pipeline in `src/lib/relocation-engine.ts::generatePlan` is strictly
ordered:

```
1. Data lookup      → 404 DATA_NOT_COVERED    if (destination, role) not in data layer
2. Work auth filter → narrow routes by sponsorship constraint
3. Salary check     → 422 SALARY_SHORTFALL    if no route's minimum is met
4. Timeline check   → 409 TIMELINE_CONFLICT   if timeline < fastest route + hiring min
5. Build structured output
   (feasibility, salary assessment, eligible routes, timeline breakdown,
    market demand, data confidence)
6. LLM call         → narrative summary + action steps (prose only)
7. If the LLM fails or returns nothing, fall back to a deterministic action
   plan built from the data layer. Plan is never empty, response is never 500.
```

### Why this boundary

LLMs hallucinate. Telling a user they qualify for a Skilled Worker Visa when
they don't is actively harmful — it can cost them application fees, legal
advice, and a job offer. Correctness-critical outputs must come from a layer
that is correct by construction.

The deterministic layer takes JSON data and runs plain arithmetic comparisons
and filters. The LLM's job is purely stylistic: take the already-correct
structured output and write readable prose around it.

### Options considered

**Option A (chosen):** Deterministic first, LLM for prose only.

- Gives up: richer, context-aware eligibility reasoning an LLM could
  theoretically provide.
- Gains: zero hallucination risk on anything touching legal/financial
  decisions, instant typed failures, plan still usable if the LLM is down.

**Option B (rejected):** LLM makes decisions, prompted with the data.

- Gives up: correctness guarantees. Even with a strong system prompt and
  structured output mode, a model will occasionally return wrong salary
  thresholds or invent visa routes.
- Gains: potentially richer narrative. Not worth the correctness risk.

### LLM failure modes observed in code

`src/lib/llm-service.ts` returns `llm_status` of `"success"`, `"error"`, or
`"skipped"`:

- `"success"` — Gemini returned valid JSON matching the response schema.
- `"error"` — Gemini call threw, or JSON.parse failed after schema-mode
  output. `llm_error` carries the message.
- `"skipped"` — No `LLM_API_KEY` configured. The system still runs; the
  deterministic fallback action steps are used and `narrative_summary` is
  `null`.

The frontend degrades gracefully by hiding the narrative section when it is
`null`.

---

## 3. Data Confidence

### The problem

"Salary for Senior Backend Engineer in Germany from a job-board survey" is
not the same quality as "visa salary threshold pulled from the Federal
Employment Agency". Both are useful, but the user must know which to rely on
before putting money on the table.

### How it flows

Confidence is declared at the **field level** inside each destination/role
JSON file:

```json
"salary": {
  "median": 85000,
  "data_confidence": "estimated"
},
"work_authorisation_routes": [
  {
    "name": "EU Blue Card",
    "salary_minimum_eur": 58400,
    "data_confidence": "estimated"
  }
]
```

At plan generation time, `aggregateConfidence` in
`src/lib/relocation-engine.ts` reads each section's flag and computes an
`overall` verdict using the **most conservative level present**:

```
verified  ⇐  estimated  ⇐  placeholder     (trust descending)
```

If any field is `placeholder`, `overall` is `placeholder`. If any field is
`estimated` and none is `placeholder`, `overall` is `estimated`. Only if
every field is `verified` is the overall response `verified`.

### What the API returns

Every plan response carries both the overall verdict and the per-field
breakdown, so the frontend can render badges section by section:

```json
"data_confidence": {
  "overall": "estimated",
  "fields": {
    "salary": "estimated",
    "work_authorisation": "estimated",
    "timeline": "estimated",
    "market_demand": "estimated",
    "credentials": "estimated"
  }
}
```

### Confidence levels

| Level | Meaning |
| --- | --- |
| `verified` | Sourced from official government publications (UK Home Office, BAMF, Bundesagentur für Arbeit, etc.). |
| `estimated` | Derived from job boards, salary surveys, market commentary — directionally correct, not authoritative. |
| `placeholder` | Synthetic value — must be replaced before production use. |

### What I gave up

Per-field confidence requires discipline when adding new data. A simpler
one-flag-per-file approach would be easier to maintain but loses the nuance
— a file can legitimately have verified visa thresholds and estimated salary
data at the same time. Per the brief's emphasis on data quality signalling,
that nuance is worth the maintenance cost.

### Known shortcut

`aggregateConfidence` currently reads only the first element of
`work_authorisation_routes` when computing the `work_authorisation` field
flag. If a future data file mixes `verified` and `estimated` routes, this
would under-report risk. Replacing it with the same "most conservative wins"
reducer used for `overall` is a future enhancement noted below.

---

## 4. LLM Choice

### Options considered

| Model | Reason considered | Reason rejected (for now) |
| --- | --- | --- |
| GPT-4 / GPT-4o | Best narrative quality | Requires paid OpenAI account — reviewers couldn't run it without keys |
| Groq (Llama 3 70B) | Fast, generous free tier | Tighter rate limits under concurrent load; smaller context |
| **Gemini Flash (chosen)** | Large free tier, big context, native JSON schema output | Occasionally verbose output; no Ollama-style portability |
| Ollama local (Llama 3, Mistral) | Zero cost, fully private, no rate limits | Requires local install — not portable for a reviewer with only an API key |

### What's implemented

Gemini only. Configured via:

- `LLM_API_KEY` — Google AI Studio key (empty → LLM step is skipped, plan
  still generates with deterministic fallback action steps).
- `LLM_MODEL` — optional, defaults to `gemini-3.1-flash-lite-preview`.

`src/lib/llm-service.ts` uses the SDK's response-schema JSON mode so the
output is structurally predictable. It still defensively strips code fences
in case a future model or prompt regression returns fenced output.

### Limitations worked around

- **Verbose / fenced JSON** — stripped with a small post-processor before
  `JSON.parse`. Harmless if the model already honours the schema.
- **Occasional empty `action_steps`** — when the model returns an empty
  array, the engine falls back to `buildActionSteps`, a deterministic step
  generator that cites the real data-layer facts. The plan is never empty.
- **No explicit timeout** — the call awaits `model.generateContent` without
  an `AbortController`. The runtime's function timeout is the backstop.
  Adding a client-side 10–15s abort is flagged in Future Enhancements.

### Future enhancements (LLM layer)

These are deliberately deferred for the MVP but they're the obvious next
moves:

- **Ollama provider** — a local, offline fallback for private / air-gapped
  deployments. Introduces an `LLM_PROVIDER` env var (`gemini` | `ollama`) and
  a provider interface so `llm-service.ts` can dispatch based on it. Value:
  zero-cost local dev, no rate limits, no data egress. Estimated size: under
  a day.
- **AbortController + 10–15s timeout** around `model.generateContent`, with
  a new `llm_status: "timeout"` code returned to the client. Value: bounds
  the worst-case request latency; gives the frontend a clearer signal.
- **Response caching keyed on `hash(input + destination_role_file_hash)`**
  so the same input doesn't pay the LLM cost twice. Pairs well with queueing
  (see §5).
- **Model A/B routing** — keep a cheap fast model as default, escalate to a
  larger model if the narrative is short or fails quality checks.

---

## 5. Scale Assumption

**The assumption that breaks first under real load: unbounded concurrent
synchronous LLM calls inside the request path.**

Every `POST /api/v1/plans/generate` runs the Gemini call in-line inside the
route handler. Under concurrency:

| Load | Observed / expected behaviour |
| --- | --- |
| 1–5 concurrent users | Works fine, 3–8s end-to-end response. |
| 10–20 concurrent users | Gemini free-tier rate limit (~15 RPM) hits, LLM calls start erroring. The plan still returns — `llm_status: "error"`, `narrative_summary: null`, deterministic action steps. |
| 50+ concurrent users | Function / runtime timeout backpressure, Prisma connection pool pressure, user-visible latency degrades. |

### Planned fix (not implemented)

```
Client → POST /plans/generate
         ├─ Run deterministic checks immediately (fast, can return an
         │  early 4xx without waiting for the LLM)
         └─ Enqueue LLM job (BullMQ on Redis) → respond 202 with a job id
            Worker pool (concurrency 5) pulls from the queue, calls Gemini,
            writes the narrative into the plan row in Postgres.
Client → GET /plans/:id (poll)  OR  subscribe to SSE/WebSocket for completion
```

Key properties of this design that the current code already supports:

- **Stateless JWT auth** — the web layer can be horizontally scaled today.
- **Deterministic output is the critical path** — even without a queue, the
  correctness-critical part of the plan is available long before the LLM
  narrative. The queue just moves the LLM off the request path; it does not
  change any semantics.
- **LLM output already optional** — because the engine already returns a
  usable plan when the LLM fails, moving the LLM to async is a mechanical
  refactor, not a redesign.

### Future enhancements (scale)

- **BullMQ + Redis worker** for the LLM call, returning 202 + job id.
- **Response cache** on `hash(input)` so repeated identical inputs serve
  instantly.
- **Per-IP and per-user rate limits** on `/auth/*` and `/plans/generate` to
  blunt abuse.
- **Structured logging + tracing** (request id through every log line) so
  queue-stage debugging is tractable.
- **Connection pooling strategy** explicitly sized for Supabase's limits if
  deployed there — PgBouncer on the direct URL, pooled URL for runtime.

---

## 6. Hindsight

**The one decision I'd make differently: seed destination data into the
database, not JSON files.**

Today, `src/lib/data-service.ts` reads JSON files from disk at runtime
(`data/destinations/{slug}/{role}.json`) and caches `index.json` in-memory.
This was the right call for a 7-day MVP — no schema design, no seed scripts,
no admin UI, and the brief explicitly required "new destinations without
code changes", which JSON files satisfy trivially.

But the maintenance cost compounds:

- **No query layer.** "Which destinations support role X?" has no
  database-level answer — you'd iterate files.
- **`index.json` can drift** from the actual file set. Adding a role file
  without registering it silently returns `DATA_NOT_COVERED`.
- **No admin interface** — editing salary data or adding a new visa route
  requires a deploy because the file is baked into the build.
- **No audit trail** on data changes — who changed the Skilled Worker
  threshold, when, and why? A DB row with timestamps and author is easier
  to defend to a user who acts on the plan.

The better architecture is to seed this data into Postgres on first boot
with a proper schema — `destinations`, `roles`, `work_auth_routes`,
`salary_data`, `credentials`, `market_demand` — and keep the JSON files only
as the **seed source of truth** in Git. Prisma already manages the DB, so
this is a small migration and a seed script, not a rewrite. It would make
the destination list queryable, the data editable via an admin UI, the
confidence ratings filterable (e.g., "only show verified data"), and would
open the door to per-destination versioning.

I didn't do it because the JSON approach unblocked the rest of the system
immediately. It is, however, the decision that would create the most
friction as the product scales past ~20 destinations.

---

## Appendix: Consolidated future enhancements

Grouped for easy reviewing. Each of these is a conscious next step, not an
oversight.

**Correctness & robustness**

- `AbortController` timeout on the LLM call; add `llm_status: "timeout"`.
- Fix `aggregateConfidence` to use the "most conservative wins" rule across
  all work-auth routes, not just the first.
- Password complexity requirements + account lockout after repeated failures.

**Security hardening**

- Move JWT to an `httpOnly`, `SameSite=Lax`, `Secure` cookie. Introduce a
  refresh token rotation flow. Current MVP stores the token in a
  client-readable cookie — trades a small XSS-exfiltration risk for setup
  speed.
- Per-IP and per-user rate limits on `/auth/*` and `/plans/generate`.
- CSRF protection once the cookie becomes `httpOnly`.

**LLM & narrative quality**

- **Ollama provider** — offline fallback for private deployments, zero cost,
  no rate limits. Sketched in §4.
- Response caching keyed on `hash(input)` to avoid paying for identical LLM
  calls twice.
- Model A/B routing (cheap-fast by default, larger model on quality
  regression).

**Scale**

- BullMQ + Redis worker pool for the LLM call. Respond `202` with a job id,
  let the client poll `GET /plans/:id` or subscribe via SSE. Sketched in §5.
- Structured logging with a request id propagated through every log.
- Explicit Prisma connection pool sizing for the target Postgres host.

**Data layer**

- Seed destination data into Postgres (see §6). Keep JSON in Git as the
  seed source of truth.
- Admin UI for editing data + viewing which plans reference each route.
- Per-field data sources (URL + as-of date) on each value, not just a
  confidence flag.
