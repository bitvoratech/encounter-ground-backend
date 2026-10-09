-- Self-tests: the "Self Test" section carried over from the old WordPress site
-- (7 Mountains of Influence, Fivefold Ministry Calling).
--
-- Each test has a rating scale and a set of categories (the five gifts, the
-- seven mountains). Every question belongs to one category. A result is the
-- share of the maximum possible rating a person gave each category, so
-- categories with different numbers of questions still compare fairly.
--
-- Questions are served without their category and scored by the API, so the
-- page does not show which gift or mountain each statement points to.

create table public.self_tests (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  summary      text,
  intro        text,
  -- Rating labels, lowest first. An answer is the 1-based index into this list.
  scale        jsonb not null check (jsonb_typeof(scale) = 'array' and jsonb_array_length(scale) >= 2),
  legacy_url   text,                    -- old WordPress URL, for 301 redirects
  position     integer not null default 0,
  status       public.publish_status not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger self_tests_updated_at before update on public.self_tests
  for each row execute function public.set_updated_at();

create table public.self_test_categories (
  id           uuid primary key default gen_random_uuid(),
  test_id      uuid not null references public.self_tests (id) on delete cascade,
  key          text not null,           -- stable id, e.g. 'apostle', 'family'
  name         text not null,
  description  text,
  position     integer not null default 0,
  unique (test_id, key)
);

create table public.self_test_questions (
  id           uuid primary key default gen_random_uuid(),
  test_id      uuid not null references public.self_tests (id) on delete cascade,
  category_id  uuid not null references public.self_test_categories (id) on delete cascade,
  prompt       text not null,
  position     integer not null,
  unique (test_id, position)
);
create index on public.self_test_questions (category_id);

-- One row per completed test. Anonymous attempts are kept (no personal data)
-- so the ministry can see overall patterns; signed-in attempts are linked to
-- the member so they can look back at their results.
create table public.self_test_attempts (
  id           uuid primary key default gen_random_uuid(),
  test_id      uuid not null references public.self_tests (id) on delete cascade,
  user_id      uuid references public.profiles (id) on delete set null,
  answers      jsonb not null,          -- { "<question id>": <rating> }
  scores       jsonb not null,          -- [{ key, name, score, max, percent }]
  created_at   timestamptz not null default now()
);
create index on public.self_test_attempts (test_id, created_at desc);
create index on public.self_test_attempts (user_id) where user_id is not null;

alter table public.self_tests           enable row level security;
alter table public.self_test_categories enable row level security;
alter table public.self_test_questions  enable row level security;
alter table public.self_test_attempts   enable row level security;

create policy "self_tests: public read" on public.self_tests for select
  using (status = 'published' or public.is_staff());
create policy "self_tests: staff" on public.self_tests for all
  using (public.is_staff()) with check (public.is_staff());

create policy "self_test_categories: public read" on public.self_test_categories for select using (
  public.is_staff() or exists (select 1 from public.self_tests t where t.id = test_id and t.status = 'published')
);
create policy "self_test_categories: staff" on public.self_test_categories for all
  using (public.is_staff()) with check (public.is_staff());

create policy "self_test_questions: public read" on public.self_test_questions for select using (
  public.is_staff() or exists (select 1 from public.self_tests t where t.id = test_id and t.status = 'published')
);
create policy "self_test_questions: staff" on public.self_test_questions for all
  using (public.is_staff()) with check (public.is_staff());

-- Attempts are written through the API, which scores them.
create policy "self_test_attempts: own read" on public.self_test_attempts for select
  using (user_id = auth.uid() or public.is_staff());
create policy "self_test_attempts: staff" on public.self_test_attempts for all
  using (public.is_staff()) with check (public.is_staff());
