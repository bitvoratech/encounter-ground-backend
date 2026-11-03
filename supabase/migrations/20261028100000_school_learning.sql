-- Beth-El Institute learning: written checkpoints after each module and a short final
-- check per class, on top of the courses / modules / lessons / enrollments /
-- lesson_progress tables from the core schema.
--
-- The new lesson kinds are added here and first used in the next migration, because
-- Postgres can't use an enum value in the same transaction that adds it.

alter type public.lesson_kind add value if not exists 'checkpoint';
alter type public.lesson_kind add value if not exists 'quiz';

-- How a class presents itself on its page.
alter table public.courses
  add column meaning  text,                              -- e.g. 'Hebrew for “to walk”'
  add column badge    text,                              -- e.g. 'Start here'
  add column outcomes text[] not null default '{}';      -- "In Halak you will…"

-- For checkpoint lessons: what the student is asked to write about.
alter table public.lessons
  add column prompt text;

-- The final check for a class. Answers stay on the server: the API serves questions
-- without them and marks submissions.
create table public.course_quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  position      integer not null,
  question      text not null,
  options       text[] not null check (cardinality(options) >= 2),
  answer_index  integer not null check (answer_index >= 0),
  explanation   text,
  unique (course_id, position),
  check (answer_index < cardinality(options))
);

-- A student's written reflection for a checkpoint lesson. One per student per
-- checkpoint: writing it again replaces the earlier text. A teacher reviews it.
create table public.checkpoint_submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  lesson_id     uuid not null references public.lessons (id) on delete cascade,
  body          text not null check (char_length(body) between 20 and 5000),
  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  feedback      text,
  unique (user_id, lesson_id)
);
create index on public.checkpoint_submissions (lesson_id, submitted_at desc);

-- Every final-check attempt, so a teacher can see how a class is going.
create table public.quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  course_id   uuid not null references public.courses (id) on delete cascade,
  answers     integer[] not null,
  score       integer not null check (score >= 0),
  total       integer not null check (total > 0),
  passed      boolean not null,
  created_at  timestamptz not null default now()
);
create index on public.quiz_attempts (user_id, course_id, created_at desc);

alter table public.course_quiz_questions  enable row level security;
alter table public.checkpoint_submissions enable row level security;
alter table public.quiz_attempts          enable row level security;

-- Questions carry their answers, so only staff read them directly; students get them
-- through the API, without answers.
create policy "quiz questions: staff" on public.course_quiz_questions for all
  using (public.is_staff()) with check (public.is_staff());
-- Students read their own work; the API writes it; staff review it.
create policy "checkpoints: own read" on public.checkpoint_submissions for select
  using (user_id = auth.uid() or public.is_staff());
create policy "checkpoints: staff" on public.checkpoint_submissions for all
  using (public.is_staff()) with check (public.is_staff());
create policy "quiz attempts: own read" on public.quiz_attempts for select
  using (user_id = auth.uid() or public.is_staff());
