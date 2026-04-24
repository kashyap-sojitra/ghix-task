# Career Relocation Advisor

A full-stack web app that generates personalised, data-backed career relocation
plans for professionals considering an international move. Given an origin,
destination, target role, salary expectation, timeline, and work-authorisation
situation, the system runs deterministic feasibility checks against curated
country/role data, then uses an LLM to produce a narrative summary and ranked
action plan.

This is a **single Next.js 16 application** — API routes (under
`src/app/api/v1/`) and the UI live in the same project and run on the same
port.

---

## Tech Stack

| Layer            | Technology                                         |
| ---------------- | -------------------------------------------------- |
| Framework        | Next.js 16 (App Router) + React 19                 |
| Language         | TypeScript 5                                       |
| API              | Next.js Route Handlers under `/api/v1/*`           |
| Database         | PostgreSQL (tested with Supabase)                  |
| ORM              | Prisma 6                                           |
| Auth             | `jsonwebtoken` + `bcrypt` (JWT via `Authorization: Bearer`) |
| LLM              | Google Gemini (`@google/generative-ai`)            |
| State management | Zustand                                            |
| Forms            | React Hook Form + Zod                              |
| Styling          | Tailwind CSS v4                                    |
| HTTP client      | Axios                                              |

---

## Prerequisites

- **Node.js 20+**
- A **PostgreSQL** database — a free Supabase project works out of the box
- A **Gemini API key** (optional but recommended) — get one at
  [aistudio.google.com](https://aistudio.google.com). Without a key the app
  still runs; plan generation falls back to a deterministic action plan and
  the narrative summary will be `null`.

---

## Quick Start

```bash
# 1. Clone and install
git clone <this-repo> ghix-task
cd ghix-task
npm install   # runs `prisma generate` automatically via postinstall

# 2. Configure environment
cp .env.example .env
#   → open .env and fill in DATABASE_URL, JWT_SECRET, LLM_API_KEY

# 3. Run database migrations
npx prisma migrate deploy

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The API is served from the same process at
[http://localhost:3000/api/v1](http://localhost:3000/api/v1).

---

## Environment Variables

All variables live in a single `.env` file at the repo root. A template is
provided in `.env.example`.

| Variable              | Required      | Default                           | Description                                                                                                          |
| --------------------- | ------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | **yes**       | —                                 | Postgres connection string used by Prisma at runtime. For Supabase, use the **pooled** (port 6543) connection string. |
| `DIRECT_URL`          | recommended   | —                                 | Direct (non-pooled) Postgres URL used by Prisma for migrations. For Supabase, use the direct (port 5432) URL. Can be set equal to `DATABASE_URL` for non-pooled setups. |
| `JWT_SECRET`          | **yes**       | —                                 | Secret used to sign JWTs. Use a long random string (e.g. `openssl rand -hex 48`).                                     |
| `JWT_EXPIRES_IN`      | no            | `7d`                              | JWT lifetime. Accepts [ms](https://github.com/vercel/ms) format, e.g. `15m`, `24h`, `7d`.                              |
| `LLM_API_KEY`         | no            | _(unset)_                         | Google Gemini API key. If missing, the LLM step is skipped and a deterministic fallback action plan is returned.      |
| `LLM_MODEL`           | no            | `gemini-3.1-flash-lite-preview`   | Gemini model name.                                                                                                   |
| `NEXT_PUBLIC_API_URL` | no            | `/api/v1`                         | Base URL the frontend uses to call the API. Only override this if you proxy the API to a different host.             |

---

## Database Setup

The schema (`prisma/schema.prisma`) defines two tables:

- `users` — email + bcrypt password hash
- `plans` — saved plans, each owned by a user, storing the request (`input_snapshot`) and the full generated response (`output_snapshot`) as JSON

An initial migration is already committed under `prisma/migrations/`. To apply
it to a fresh database:

```bash
npx prisma migrate deploy
```

When developing and changing the schema:

```bash
npx prisma migrate dev --name <change-name>
```

Handy extras:

```bash
npx prisma studio    # GUI for browsing rows
npx prisma generate  # regenerate the Prisma client (runs automatically on install)
```

---

## Scripts

Defined in `package.json`:

| Command              | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Start Next.js in development mode on port 3000. |
| `npm run build`      | Production build.                               |
| `npm run start`      | Run the production build.                       |
| `npm run lint`       | Run ESLint.                                     |

---

## API Reference

All endpoints are prefixed with **`/api/v1`**. Success responses are shaped as:

```json
{ "success": true, "data": { ... }, "meta": { "generated_at": "..." } }
```

Errors are shaped as:

```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

Protected endpoints require `Authorization: Bearer <access_token>`.

### Authentication

| Method | Path             | Auth    | Description                                        |
| ------ | ---------------- | ------- | -------------------------------------------------- |
| POST   | `/auth/register` | public  | Create an account. Returns `{ user, access_token }`. Password must be ≥ 8 chars. |
| POST   | `/auth/login`    | public  | Log in. Returns `{ user, access_token }`.          |
| POST   | `/auth/logout`   | public  | Stateless stub — clients simply drop their token.  |
| GET    | `/auth/me`       | **JWT** | Return the authenticated user's profile.           |

### Destinations (reference data)

| Method | Path            | Auth   | Description                                                    |
| ------ | --------------- | ------ | -------------------------------------------------------------- |
| GET    | `/destinations` | public | Returns the full index of supported destinations and roles.     |

### Plans

| Method | Path              | Auth    | Description                                                                                     |
| ------ | ----------------- | ------- | ----------------------------------------------------------------------------------------------- |
| POST   | `/plans/generate` | **JWT** | Generate a relocation plan. **Does not persist** — returns the result only.                      |
| POST   | `/plans`          | **JWT** | Save a generated plan (`{ title?, input_snapshot, output_snapshot }`).                           |
| GET    | `/plans`          | **JWT** | List the current user's saved plans. Supports `?page=` and `?limit=` (default 1 / 20, max 100). |
| GET    | `/plans/:id`      | **JWT** | Fetch a specific saved plan. 403 if you do not own it.                                          |
| DELETE | `/plans/:id`      | **JWT** | Delete a saved plan.                                                                            |

### `POST /plans/generate` — request body

```json
{
  "origin_country": "india",
  "destination_country": "germany",
  "current_role": "Backend Engineer",
  "target_role": "senior-backend-engineer",
  "salary_expectation": 75000,
  "salary_currency": "EUR",
  "timeline_months": 9,
  "work_authorisation_constraint": "needs_employer_sponsorship"
}
```

`destination_country` and `target_role` must be slugs from
`GET /destinations`. `work_authorisation_constraint` must be one of
`needs_employer_sponsorship`, `no_constraint`, `already_has_right_to_work`.

### Domain error codes

The relocation engine returns structured errors for known edge cases:

| HTTP | `code`              | Meaning                                                                                         |
| ---- | ------------------- | ----------------------------------------------------------------------------------------------- |
| 404  | `DATA_NOT_COVERED`  | The requested `destination_country` + `target_role` combination has no data file.               |
| 409  | `TIMELINE_CONFLICT` | `timeline_months` is shorter than the fastest realistic hiring + visa processing time.           |
| 422  | `SALARY_SHORTFALL`  | `salary_expectation` is below the minimum salary threshold for every available visa route.      |
| 401  | `UNAUTHORIZED`      | Missing or invalid JWT.                                                                         |
| 400  | `VALIDATION_ERROR`  | Malformed request body.                                                                         |
| 409  | `CONFLICT`          | Email already registered (on `/auth/register`).                                                 |

---

## Adding a New Destination or Role

All relocation data is static JSON — no code changes needed to add new
destination/role combinations.

1. Create a data file at
   `data/destinations/<destination-slug>/<role-slug>.json`, following the
   schema used by
   [`data/destinations/germany/senior-backend-engineer.json`](data/destinations/germany/senior-backend-engineer.json).
2. Register it in [`data/destinations/index.json`](data/destinations/index.json)
   under `supported_combinations`.
3. Restart the dev server (the index is cached in-memory at load).

The `DATA_NOT_COVERED` error is raised whenever a user requests a combination
that is not present in `index.json` or whose JSON file is missing.

---

## Project Structure

```
ghix-task/
├── src/
│   ├── app/
│   │   ├── api/v1/                  ← Route handlers (the "backend")
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts
│   │   │   │   ├── logout/route.ts
│   │   │   │   ├── me/route.ts
│   │   │   │   └── register/route.ts
│   │   │   ├── destinations/route.ts
│   │   │   └── plans/
│   │   │       ├── route.ts         ← GET (list) + POST (save)
│   │   │       ├── generate/route.ts
│   │   │       └── [id]/route.ts    ← GET + DELETE
│   │   ├── register/                ← /register page
│   │   ├── login/                   ← /login page
│   │   ├── generate/                ← /generate page (plan form)
│   │   ├── plans/                   ← /plans list + /plans/[id] detail
│   │   ├── layout.tsx
│   │   ├── page.tsx                 ← Landing page
│   │   └── globals.css
│   ├── components/
│   │   ├── AuthProvider.tsx
│   │   ├── Navbar.tsx
│   │   └── PlanResult.tsx
│   ├── lib/
│   │   ├── api.ts                   ← Axios client used by the frontend
│   │   ├── api-response.ts          ← `ok` / `err` / `ApiError` helpers
│   │   ├── auth.ts                  ← `requireUser` / `extractUser`
│   │   ├── jwt.ts                   ← sign / verify
│   │   ├── prisma.ts                ← Prisma client singleton
│   │   ├── data-service.ts          ← Loads destination/role JSON
│   │   ├── relocation-engine.ts     ← Deterministic feasibility checks + orchestration
│   │   ├── llm-service.ts           ← Gemini integration
│   │   └── error.ts
│   └── store/
│       └── auth.store.ts            ← Zustand auth store
├── data/destinations/               ← Static relocation data
│   ├── index.json
│   ├── germany/
│   │   ├── senior-backend-engineer.json
│   │   └── product-manager.json
│   └── united-kingdom/
│       ├── senior-backend-engineer.json
│       └── product-manager.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/
├── .env.example
├── DECISIONS.md                     ← Architecture decisions
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## How Plan Generation Works

`POST /api/v1/plans/generate` runs the following pipeline
(`src/lib/relocation-engine.ts`):

1. **Load data** — look up `<destination>/<role>.json`. If missing →
   `404 DATA_NOT_COVERED`.
2. **Filter visa routes** by `work_authorisation_constraint`.
3. **Salary check** — reject applicants whose expectation is below every
   available route's minimum → `422 SALARY_SHORTFALL`.
4. **Timeline check** — reject timelines shorter than fastest hiring + visa
   processing → `409 TIMELINE_CONFLICT`.
5. **Build deterministic output** — feasibility score, eligible routes,
   timeline breakdown, salary assessment, market demand, data confidence.
6. **Call the LLM** (Gemini) for the narrative summary and ranked action steps.
   If the call fails or no API key is set, a deterministic fallback action
   plan is used and `narrative_summary` is `null`.

All structured numbers (salaries, processing times, thresholds) come from the
JSON data — the LLM is never allowed to invent them.

---

## Troubleshooting

- **`P1001: Can't reach database server`** — check `DATABASE_URL` and that
  your Postgres instance is reachable. For Supabase, ensure you're using the
  pooled connection string for `DATABASE_URL`.
- **`prisma migrate deploy` complains about shadow database** — set
  `DIRECT_URL` to a non-pooled Postgres URL.
- **`narrative_summary` is `null` and `action_steps` look generic** — no
  `LLM_API_KEY` is configured, or the Gemini call failed. Check the server
  logs for `[LLM] …` entries. The response still contains the deterministic
  plan.
- **`VALIDATION_ERROR: password must be at least 8 characters`** on register —
  your password must be at least 8 characters long.
- **UI shows `Network Error`** — the `NEXT_PUBLIC_API_URL` default is
  `/api/v1` (same origin). Only override it if you intentionally run the API
  elsewhere.

---

## Further Reading

- [`DECISIONS.md`](DECISIONS.md) — architecture decisions and trade-offs.
