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
| GET | `/books`, `/books/:slug` | public: prices per currency in minor units, e.g. `{ "NGN": 750000, "USD": 999 }` |
| GET | `/site-content` | public: the website wording saved in the admin (`contact`, `yada`, `home`) |
| GET | `/self-tests`, `/self-tests/:slug` | public |
| POST | `/self-tests/:slug/attempts` | public (linked to the member if signed in) |
| POST | `/contact` | public (linked to the member if signed in) |
| GET | `/courses`, `/courses/:slug` | public (final-check answers never sent) |
| GET | `/courses/:slug/lessons/:lesson` | preview lessons public, others enrolled: written teaching, video link, signed file link |
| GET / PATCH | `/me` | signed in |
| GET | `/me/books` | signed in: owned e-books with reading progress |
| GET | `/me/books/:slug` | owner (or staff): the reader's page list and where they stopped |
| GET | `/me/books/:slug/pages?from=&to=` | owner (or staff): up to 8 page images, as links that last 10 minutes |
| PUT | `/me/books/:slug/progress` | owner: saves the page they're on |
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
| GET / POST | `/admin/books` | staff: every book (any status) with prices; add a book |
| GET / PUT / DELETE | `/admin/books/:id` | staff: one book; edit; delete (only if nobody has bought it) |
| PUT | `/admin/books/:id/pages` | staff: replace the reader's page images (rendered from the PDF in the browser) |
| GET / POST | `/admin/books/:id/owners` | staff: who has the e-book; give it to someone by email |
| DELETE | `/admin/books/:id/owners/:userId` | staff: take back a copy that was given (not a bought one) |
| GET | `/admin/site-content` | staff: saved website wording |
| PUT | `/admin/site-content/:key` | staff: save `contact`, `yada` or `home` |
| GET / POST | `/admin/courses` | staff: every class; add a class |
| GET / PUT / DELETE | `/admin/courses/:id` | staff: a class with modules, lessons, content and final check; edit; delete (only with no enrolments) |
| PUT | `/admin/courses/:id/order` | staff: reorder modules and lessons (lessons can move between modules) |
| PUT | `/admin/courses/:id/quiz` | staff: replace the final-check questions |
| POST | `/admin/courses/:id/modules` | staff: add a module |
| PUT / DELETE | `/admin/modules/:id` | staff: edit; delete (only when empty) |
| POST | `/admin/modules/:id/lessons` | staff: add a lesson (its web address is made from the title) |
| PUT / DELETE | `/admin/lessons/:id` | staff: edit; delete |

Book covers and lesson files (PDF, audio) are uploaded by the admin page straight to Supabase Storage (`covers` is public, `lesson-files` is private and served through signed links); storage policies allow only staff to upload.

Send the Supabase access token as `Authorization: Bearer <token>`.

## Making someone an admin

Admins can change roles in the admin dashboard (`/admin/members`). For the very first admin, in the Supabase SQL editor: `update profiles set role = 'admin' where email = 'person@example.com';`
