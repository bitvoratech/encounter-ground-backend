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
| GET | `/courses`, `/courses/:slug` | public (final-check answers never sent) |
| GET / PATCH | `/me` | signed in |
| GET | `/me/books` | signed in |
| GET | `/me/courses` | signed in: enrolled classes, finished lessons, teachers' replies |
| POST | `/me/courses/:slug/enrol` | signed in (free classes only until payments) |
| PUT | `/me/courses/:slug/lessons/:lesson/complete` | signed in, enrolled: video, audio, reading, study guide |
| POST | `/me/courses/:slug/lessons/:lesson/checkpoint` | signed in, enrolled: saves the reflection for a teacher |
| POST | `/me/courses/:slug/lessons/:lesson/quiz` | signed in, enrolled: marks the final check |
| GET | `/admin/overview` | staff (editor or admin): counts and what is waiting |
| GET | `/admin/checkpoints?status=reviewed` | staff: waiting (default) or replied checkpoints |
| PUT | `/admin/checkpoints/:id` | staff: reply to a checkpoint |
| GET | `/admin/messages?status=handled` | staff: contact messages to answer (default) or handled |
| PUT | `/admin/messages/:id` | staff: mark handled or reopen |
| GET | `/admin/members?q=` | admin: members, newest first, searchable |
| PUT | `/admin/members/:id` | admin: change someone else's role |

Send the Supabase access token as `Authorization: Bearer <token>`.

## Making someone an admin

Admins can change roles in the admin dashboard (`/admin/members`). For the very first admin, in the Supabase SQL editor: `update profiles set role = 'admin' where email = 'person@example.com';`
