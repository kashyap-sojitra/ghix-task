# Architecture & Design Decisions

## 1. Scope

**Built:**
- User registration, login, session management (JWT)
- Plan generation from career profile input (deterministic + LLM)
- Saved plans persisted per user (Supabase PostgreSQL via Prisma)
- Three deterministic edge case checks (timeline conflict, salary shortfall, missing data)
- LLM narrative generation (Gemini 1.5 Flash, graceful fallback to `null`)
- Structured `data_confidence` on all API responses
- Reference data endpoint (`/api/v1/destinations`) — `/api/v1/destinations/[slug]/roles` was removed as dead code; roles are bundled in the destinations list response
- Full React/Next.js frontend (register, login, generate, plans list, plan detail)

**Explicitly skipped:**
- BullMQ / Redis queue for LLM calls
- Redis response caching
- PDF export
- Email verification / password reset
- Dockerized deployment (documented how to run manually)

---

## 1a. Database

**Supabase (PostgreSQL)** is used as the database, connected via Prisma.

- Transaction mode pooler URL (`port 6543`) is used for the application (`DATABASE_URL`) to support serverless/Next.js connection limits
- Direct connection URL (`port 5432`) is used only for migrations (`DIRECT_URL`)
- Schema managed via `prisma migrate dev` — `migration_lock.toml` is committed to version control as required by Prisma

---

## 2. AI vs Deterministic — The Most Important Decision

**All eligibility, salary, and timeline decisions are deterministic.** The LLM is never consulted before these checks run. The flow is:

```
1. Data lookup → 404 if destination+role not in data layer
2. Eligibility filter (work auth constraint)
3. Salary check (per route) → 422 if all routes fail
4. Timeline check → 409 if minimum required > user timeline
5. Build structured plan
6. LLM call (async, non-blocking)
```

**Why:** LLMs hallucinate. Telling a user they're eligible for a visa route they don't qualify for is actively harmful. The deterministic checks use verified/estimated JSON data — they are correct by construction. The LLM only writes prose, never makes eligibility decisions.

**LLM failure mode:** If the LLM times out or returns invalid JSON, `narrative_summary` is `null` and `llm_status` is `"timeout"` or `"error"`. The plan is still complete and usable. This is tested implicitly — any LLM key misconfiguration produces a graceful degraded response, not a 500.

---

## 3. Data Confidence

Data confidence is set at the individual JSON field level within each destination/role file:

```json
"salary": { "data_confidence": "estimated" }
"work_authorisation_routes[0]": { "data_confidence": "verified" }
```

At API response time, the engine aggregates these into an `overall` field using the most conservative (lowest trust) level present:

```
verified < estimated < placeholder
```

The frontend displays per-section confidence badges so users know which parts of their plan to trust most. This matters — "visa route X requires €47,000" being `"verified"` from government sources is very different from `"placeholder"` salary data.

**Data confidence levels:**
- `verified`: Sourced from official government publications
- `estimated`: Derived from job boards, surveys — directionally correct
- `placeholder`: Synthetic — requires real data before production

---

## 4. LLM Choice

**Primary: Gemini** (free tier, model: `gemini-3.1-flash-lite-preview`)
- Reasons: generous free tier, large context window (supports full plan JSON input), fast inference, good instruction-following
- Configured via `LLM_PROVIDER=gemini` + `LLM_API_KEY`
- Model name is intentionally not surfaced in the UI

**Fallback: Ollama (local Llama 3)**
- Reasons: zero API cost, fully private, no rate limits
- Requires local Ollama install: `ollama pull llama3`
- Configured via `LLM_PROVIDER=ollama`

**Why not GPT-4:** Requires paid OpenAI account. Not appropriate for a take-home where reviewers need to run it.
**Why not Groq:** Groq was initially planned but dropped — Gemini's free tier is more generous and the context window is better. Groq can be added as a provider trivially (same interface).

---

## 5. Scale Assumption

**This implementation is single-instance and does not scale horizontally under real load.**

Known gaps (with documented fixes):

| Gap | Current State | Production Fix |
|---|---|---|
| LLM rate limiting | No per-user throttle | Rate limiter middleware + Redis token bucket |
| Concurrent LLM calls | All go through simultaneously | BullMQ queue (Redis-backed) with concurrency: 5 |
| Identical input caching | Each request re-calls LLM | Redis cache on `hash(input)` with TTL |
| Horizontal scaling | Single instance | Stateless JWT + load balancer already possible |

The JWT-based auth is stateless by design, so horizontal scaling is architecturally possible — just not implemented.

---

## 6. Hindsight / Genuine Reflection

**What I'd do differently:**

1. **Seed the data layer into PostgreSQL on first boot** rather than reading JSON files at runtime. This would allow: querying `SELECT DISTINCT destination FROM route_data`, better indexing, and admin-side data editing without deploy cycles. JSON files are fine for a prototype but create a maintenance burden as destinations scale.

2. **Add a `prisma migrate deploy` health check at startup** so the app fails fast with a clear message if the DB schema is behind, rather than failing mysteriously at the first DB query. Currently migrations must be run manually via `npx prisma migrate deploy` before deploying.

3. **Set up BullMQ from day one.** Adding a queue after the fact requires refactoring the `PlansController → PlansService → RelocationEngineService` call chain. It's a small refactor but easier to build queue-aware from the start.

4. **The LLM prompt could be much better.** The current prompt asks for JSON output from Gemini which works reliably, but a few-shot example would dramatically improve narrative quality. I'd add 2–3 high-quality example plan narratives as few-shot prompts.

5. **Tests on the deterministic checkers only** (as scoped). The `TimelineCheckerService`, `SalaryCheckerService`, and `EligibilityCheckerService` are pure functions that are trivial to unit test exhaustively. I'd add 15–20 parameterized tests covering all the edge cases (exact threshold, 1 below threshold, timeline exactly at minimum, etc.).
