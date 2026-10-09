# Encounter Ground API

Express 5 + TypeScript API for the Encounter Ground ministry platform. Data and auth live in Supabase (Postgres + Supabase Auth).

## Setup

```bash
pnpm install
cp .env.example .env   # fill in the Supabase values
pnpm dev               # http://localhost:4000
```

## Database

Migrations are in `supabase/migrations`, managed with the Supabase CLI.

| Command | What it does |
|---|---|
| `pnpm db:start` | Run Supabase locally (needs Docker) |
| `pnpm db:reset` | Rebuild the local database from migrations + `supabase/seed.sql` |
| `pnpm db:new <name>` | Create a new migration file |
| `pnpm db:push` | Apply pending migrations to the linked Supabase project |

Money is stored in kobo (integer). Every table has row-level security; the API connects as the database owner and enforces access in code as well.

## Endpoints so far

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | public |
| GET | `/events`, `/events/:slug` | public |
| GET | `/books`, `/books/:slug` | public |
| GET | `/self-tests`, `/self-tests/:slug` | public |
| POST | `/self-tests/:slug/attempts` | public (linked to the member if signed in) |
| POST | `/contact` | public (linked to the member if signed in) |
| GET / PATCH | `/me` | signed in |
| GET | `/me/books`, `/me/courses` | signed in |

Send the Supabase access token as `Authorization: Bearer <token>`.

## Making someone an admin

In the Supabase SQL editor: `update profiles set role = 'admin' where email = 'person@example.com';`
