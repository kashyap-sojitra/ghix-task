# Career Relocation Advisor

A full-stack web application that generates personalised, data-backed career relocation plans for professionals seeking to work internationally.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | NestJS 11, TypeScript |
| Database | PostgreSQL (Supabase), Prisma 7 |
| Auth | JWT (passport-jwt), bcrypt |
| LLM | Gemini 1.5 Flash (free tier) or Ollama |
| Frontend | Next.js 16, React 19, Tailwind CSS |
| Validation | class-validator, Zod |

## Prerequisites

- Node.js 20+
- PostgreSQL database (Supabase free tier works)
- Gemini API key (free — get one at [aistudio.google.com](https://aistudio.google.com))

## Setup Instructions

### 1. Clone and install dependencies

```bash
# Backend
cd api
npm install

# Frontend
cd ../web
npm install
```

### 2. Configure backend environment

```bash
cd api
cp .env.example .env
```

Edit `api/.env`:
```env
DATABASE_URL="your-postgresql-connection-url"
JWT_SECRET="a-long-random-string"
JWT_EXPIRES_IN="7d"
LLM_PROVIDER="gemini"
LLM_API_KEY="your-gemini-api-key"
PORT=3001
```

### 3. Run database migration

```bash
cd api
npx prisma migrate dev --name init
```

This creates the `users` and `plans` tables.

### 4. Configure frontend environment

Create `web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

### 5. Start both servers

```bash
# Terminal 1 — backend
cd api
npm run start:dev

# Terminal 2 — frontend
cd web
npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:3000

## Using Ollama (no API key required)

If you'd prefer not to use a Gemini API key:

```bash
# Install Ollama: https://ollama.ai
ollama pull llama3

# In api/.env:
LLM_PROVIDER="ollama"
OLLAMA_BASE_URL="http://localhost:11434"
# Leave LLM_API_KEY empty
```

Note: Without any LLM configured, the plan still generates fully — only the narrative summary will be `null`.

## API Overview

All endpoints are prefixed with `/api/v1`.

### Authentication
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Register with email + password |
| POST | `/auth/login` | Login, returns JWT |
| GET | `/auth/me` | Get current user |

### Plans (JWT required)
| Method | Path | Description |
|---|---|---|
| POST | `/plans/generate` | Generate a plan (not saved) |
| POST | `/plans` | Save a generated plan |
| GET | `/plans` | List saved plans |
| GET | `/plans/:id` | Get a saved plan |
| DELETE | `/plans/:id` | Delete a plan |

### Reference Data (public)
| Method | Path | Description |
|---|---|---|
| GET | `/destinations` | List supported destinations + roles |
| GET | `/destinations/:slug/roles` | List roles for a destination |


### Edge Case: Timeline Conflict (1 month)

```bash
# Change timeline_months to 1 in Scenario A → 409 TIMELINE_CONFLICT
```

### Edge Case: Salary Shortfall

```bash
# Change salary_expectation to 35000 in Scenario A → 422 SALARY_SHORTFALL
# (below Skilled Worker min of €39,000)
```

### Edge Case: Missing Data

```bash
# Change destination_country to "canada" → 404 DATA_NOT_COVERED
```

## Adding New Destinations

Create a JSON file at `api/data/destinations/{destination}/{role-slug}.json` following the schema in `api/data/destinations/germany/senior-backend-engineer.json`, then register it in `api/data/destinations/index.json`.

**No code changes required.**

## Project Structure

```
career-relocation-advisor/
├── api/                        ← NestJS backend
│   ├── src/
│   │   ├── auth/               ← JWT auth (register, login, guards)
│   │   ├── users/              ← User service + Prisma queries
│   │   ├── plans/              ← Plan CRUD + generate endpoint
│   │   ├── relocation-engine/  ← Deterministic checks + orchestrator
│   │   │   └── deterministic/  ← Timeline, salary, eligibility checkers
│   │   ├── llm/                ← LLM facade (Gemini, Ollama providers)
│   │   ├── data/               ← JSON data loader + destinations API
│   │   ├── prisma/             ← Prisma client service
│   │   └── common/             ← Exceptions, filters, interceptors
│   ├── data/destinations/      ← JSON destination/role data files
│   └── prisma/schema.prisma
├── web/                        ← Next.js frontend
│   └── src/app/
│       ├── register/           ← Registration page
│       ├── login/              ← Login page
│       ├── generate/           ← Plan generation form
│       └── plans/              ← Plans list + detail view
└── DECISIONS.md                ← Architecture decisions
```
