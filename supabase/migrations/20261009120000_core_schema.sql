-- Encounter Ground: core schema
-- Covers accounts and roles, the Ministry School, the bookstore and reader,
-- the teaching/video library, digital resources, site content, orders and
-- payments.
--
-- Conventions
--   * Money is stored as integer kobo (₦1 = 100 kobo) with a currency column,
--     so we never round naira in floating point.
--   * Every content table has a `status` so the admin can draft before publishing.
--   * Row-level security is on for every table. The Express API connects with
--     the database owner role and bypasses RLS; the policies here protect any
--     direct access through Supabase's public API (anon / authenticated keys).
--   * Books are digital for now. If the ministry also sells printed books, a
--     follow-up migration adds stock and shipping without changing these tables.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role      as enum ('member', 'editor', 'admin');
create type public.publish_status as enum ('draft', 'published', 'archived');
create type public.book_format    as enum ('digital', 'physical', 'both');
create type public.order_status   as enum ('pending', 'paid', 'failed', 'cancelled', 'refunded');
create type public.payment_status as enum ('initialized', 'success', 'failed', 'abandoned', 'reversed');
create type public.order_item_type as enum ('book', 'course');
create type public.lesson_kind    as enum ('video', 'text', 'pdf', 'audio');
create type public.video_provider as enum ('bunny', 'mux', 'cloudflare', 'youtube');
create type public.resource_access as enum ('public', 'members', 'students');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       citext,
  full_name   text,
  phone       text,
  avatar_url  text,
  role        public.user_role not null default 'member',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Role lookup used inside policies. SECURITY DEFINER so it can read profiles
-- without recursing into the profiles policies.
create or replace function public.current_role_is(wanted public.user_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = any (wanted)
  );
$$;

create or replace function public.is_staff()
returns boolean language sql stable as $$
  select public.current_role_is(array['editor', 'admin']::public.user_role[]);
$$;

-- New sign-ups get a profile automatically.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Members may edit their own name/phone/avatar but never their role.
create or replace function public.protect_profile_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), 'service_role') = 'authenticated'
     and not public.current_role_is(array['admin']::public.user_role[]) then
    raise exception 'Only an admin can change roles';
  end if;
  return new;
end $$;

create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Site content: events, blog, announcements, editable page blocks
-- ---------------------------------------------------------------------------
create table public.events (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  summary          text,
  body             text,
  theme            text,
  venue            text,
  starts_at        timestamptz,           -- null while the date/time is unconfirmed
  ends_at          timestamptz,
  time_tbc         boolean not null default false,
  is_recurring     boolean not null default false,
  recurrence_note  text,                  -- e.g. 'Every Friday on YouTube'
  dress_code       text,
  cover_image_url  text,
  registration_open boolean not null default false,
  status           public.publish_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create table public.event_registrations (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events (id) on delete cascade,
  user_id            uuid references public.profiles (id) on delete set null,
  full_name          text not null,
  email              citext not null,
  phone              text,
  needs_transport    boolean not null default false,
  -- e.g. 'Ikeja', 'Ajah', 'Yaba', 'Ikorodu', or 'Other' with location_other filled
  location_area      text,
  location_other     text,
  answers            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  unique (event_id, email)
);
create index on public.event_registrations (event_id);

create table public.posts (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  excerpt          text,
  body             text,
  cover_image_url  text,
  author_name      text,
  legacy_url       text,                  -- old WordPress URL, for 301 redirects
  status           public.publish_status not null default 'draft',
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.posts (status, published_at desc);
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  link_url    text,
  audience    public.resource_access not null default 'public',
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  status      public.publish_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

-- Small editable blocks of page copy (home hero, about story, contact details)
-- so the team can update wording without a developer.
create table public.site_content (
  key         text primary key,           -- e.g. 'home.hero', 'about.story', 'contact'
  value       jsonb not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);
create trigger site_content_updated_at before update on public.site_content
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ministry School
-- ---------------------------------------------------------------------------
create table public.courses (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  summary          text,
  description      text,
  cover_image_url  text,
  price_kobo       integer not null default 0 check (price_kobo >= 0),  -- 0 = free
  currency         char(3) not null default 'NGN',
  sort_order       integer not null default 0,
  status           public.publish_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();

create table public.course_modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  title       text not null,
  summary     text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.course_modules (course_id, position);
create trigger course_modules_updated_at before update on public.course_modules
  for each row execute function public.set_updated_at();

create table public.lessons (
  id                 uuid primary key default gen_random_uuid(),
  module_id          uuid not null references public.course_modules (id) on delete cascade,
  slug               text not null,
  title              text not null,
  kind               public.lesson_kind not null default 'video',
  body               text,
  video_id           uuid,               -- FK added after videos table exists
  attachment_path    text,               -- storage path for PDF/audio
  duration_seconds   integer,
  is_preview         boolean not null default false,  -- watchable without enrolling
  position           integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (module_id, slug)
);
create index on public.lessons (module_id, position);
create trigger lessons_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();

create table public.enrollments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  course_id      uuid not null references public.courses (id) on delete cascade,
  order_id       uuid,                    -- FK added after orders table exists
  enrolled_at    timestamptz not null default now(),
  completed_at   timestamptz,
  unique (user_id, course_id)
);
create index on public.enrollments (course_id);

create table public.lesson_progress (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  lesson_id         uuid not null references public.lessons (id) on delete cascade,
  position_seconds  integer not null default 0,
  completed_at      timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create trigger lesson_progress_updated_at before update on public.lesson_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Bookstore and reader
-- ---------------------------------------------------------------------------
create table public.books (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  subtitle         text,
  author           text,
  description      text,
  cover_image_url  text,
  format           public.book_format not null default 'digital',
  price_kobo       integer not null default 0 check (price_kobo >= 0),
  currency         char(3) not null default 'NGN',
  page_count       integer,
  source_pdf_path  text,                  -- private storage; never served directly
  pages_ready      boolean not null default false,  -- page images generated
  status           public.publish_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger books_updated_at before update on public.books
  for each row execute function public.set_updated_at();

-- One row per rendered page image. The API hands out short-lived signed URLs
-- for these to owners only, watermarked with the buyer's email.
create table public.book_pages (
  book_id       uuid not null references public.books (id) on delete cascade,
  page_number   integer not null check (page_number > 0),
  storage_path  text not null,
  width         integer,
  height        integer,
  primary key (book_id, page_number)
);

create table public.user_books (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  book_id       uuid not null references public.books (id) on delete cascade,
  order_id      uuid,                     -- FK added after orders table exists
  granted_at    timestamptz not null default now(),
  last_page     integer not null default 1,
  last_read_at  timestamptz,
  primary key (user_id, book_id)
);
create index on public.user_books (book_id);

-- ---------------------------------------------------------------------------
-- Orders and payments (Paystack first; Flutterwave can be added as a provider)
-- ---------------------------------------------------------------------------
create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete restrict,
  status         public.order_status not null default 'pending',
  total_kobo     integer not null check (total_kobo >= 0),
  currency       char(3) not null default 'NGN',
  email          citext not null,         -- receipt address at time of purchase
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.orders (user_id, created_at desc);
create index on public.orders (status);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  item_type       public.order_item_type not null,
  book_id         uuid references public.books (id) on delete restrict,
  course_id       uuid references public.courses (id) on delete restrict,
  title_snapshot  text not null,          -- title/price as sold, even if later edited
  unit_price_kobo integer not null check (unit_price_kobo >= 0),
  quantity        integer not null default 1 check (quantity > 0),
  check (
    (item_type = 'book'   and book_id   is not null and course_id is null) or
    (item_type = 'course' and course_id is not null and book_id   is null)
  )
);
create index on public.order_items (order_id);

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete restrict,
  provider           text not null default 'paystack',
  reference          text not null unique, -- our reference sent to the provider
  provider_txn_id    text,
  status             public.payment_status not null default 'initialized',
  amount_kobo        integer not null check (amount_kobo >= 0),
  currency           char(3) not null default 'NGN',
  channel            text,
  verified_at        timestamptz,          -- set only after server-side verification
  raw_response       jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on public.payments (order_id);
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Every webhook we receive, keyed by provider event id, so a duplicate
-- delivery is ignored instead of granting access twice.
create table public.payment_events (
  id            bigint generated always as identity primary key,
  provider      text not null,
  event_id      text not null,
  event_type    text not null,
  reference     text,
  payload       jsonb not null,
  processed_at  timestamptz,
  error         text,
  received_at   timestamptz not null default now(),
  unique (provider, event_id)
);

alter table public.enrollments
  add constraint enrollments_order_fk foreign key (order_id)
  references public.orders (id) on delete set null;
alter table public.user_books
  add constraint user_books_order_fk foreign key (order_id)
  references public.orders (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Teaching and video library
-- ---------------------------------------------------------------------------
create table public.categories (
  id     uuid primary key default gen_random_uuid(),
  slug   text not null unique,
  name   text not null
);

create table public.video_series (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null,
  description      text,
  cover_image_url  text,
  category_id      uuid references public.categories (id) on delete set null,
  status           public.publish_status not null default 'draft',
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger video_series_updated_at before update on public.video_series
  for each row execute function public.set_updated_at();

create table public.videos (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  title               text not null,
  description         text,
  speaker             text,
  series_id           uuid references public.video_series (id) on delete set null,
  category_id         uuid references public.categories (id) on delete set null,
  position_in_series  integer,
  provider            public.video_provider not null default 'bunny',
  provider_asset_id   text,               -- id at Bunny/Mux/Cloudflare
  thumbnail_url       text,
  duration_seconds    integer,
  recorded_on         date,
  access              public.resource_access not null default 'public',
  status              public.publish_status not null default 'draft',
  search              tsvector generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(speaker, '') || ' ' || coalesce(description, ''))
  ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.videos using gin (search);
create index on public.videos (series_id, position_in_series);
create trigger videos_updated_at before update on public.videos
  for each row execute function public.set_updated_at();

alter table public.lessons
  add constraint lessons_video_fk foreign key (video_id)
  references public.videos (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Digital resources (PDFs, teaching materials, free e-books)
-- ---------------------------------------------------------------------------
create table public.resources (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  title          text not null,
  description    text,
  category_id    uuid references public.categories (id) on delete set null,
  file_path      text not null,           -- private storage; downloads use signed URLs
  file_size      bigint,
  mime_type      text,
  access         public.resource_access not null default 'members',
  download_count integer not null default 0,
  status         public.publish_status not null default 'draft',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger resources_updated_at before update on public.resources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_enrolled(course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    where e.course_id = course and e.user_id = auth.uid()
  );
$$;

create or replace function public.owns_book(book uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_books ub
    where ub.book_id = book and ub.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.events              enable row level security;
alter table public.event_registrations enable row level security;
alter table public.posts               enable row level security;
alter table public.announcements       enable row level security;
alter table public.site_content        enable row level security;
alter table public.courses             enable row level security;
alter table public.course_modules      enable row level security;
alter table public.lessons             enable row level security;
alter table public.enrollments         enable row level security;
alter table public.lesson_progress     enable row level security;
alter table public.books               enable row level security;
alter table public.book_pages          enable row level security;
alter table public.user_books          enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.payments            enable row level security;
alter table public.payment_events      enable row level security;
alter table public.categories          enable row level security;
alter table public.video_series        enable row level security;
alter table public.videos              enable row level security;
alter table public.resources           enable row level security;

-- Profiles: you see and edit yourself; staff see everyone.
create policy "profiles: self read"   on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy "profiles: self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admin all"   on public.profiles for all
  using (public.current_role_is(array['admin']::public.user_role[]))
  with check (public.current_role_is(array['admin']::public.user_role[]));

-- Published public content is readable by anyone; staff manage all of it.
create policy "events: public read"  on public.events  for select using (status = 'published' or public.is_staff());
create policy "events: staff write"  on public.events  for all using (public.is_staff()) with check (public.is_staff());
create policy "posts: public read"   on public.posts   for select using (status = 'published' or public.is_staff());
create policy "posts: staff write"   on public.posts   for all using (public.is_staff()) with check (public.is_staff());
create policy "site_content: read"   on public.site_content for select using (true);
create policy "site_content: staff"  on public.site_content for all using (public.is_staff()) with check (public.is_staff());
create policy "categories: read"     on public.categories for select using (true);
create policy "categories: staff"    on public.categories for all using (public.is_staff()) with check (public.is_staff());

create policy "announcements: read" on public.announcements for select using (
  public.is_staff() or (
    status = 'published' and starts_at <= now() and (ends_at is null or ends_at > now())
    and (audience = 'public' or auth.uid() is not null)
  )
);
create policy "announcements: staff" on public.announcements for all using (public.is_staff()) with check (public.is_staff());

-- Registrations are created through the API (which validates input), so the
-- public API only lets a signed-in person see their own.
create policy "registrations: own read" on public.event_registrations for select
  using (user_id = auth.uid() or public.is_staff());
create policy "registrations: staff" on public.event_registrations for all
  using (public.is_staff()) with check (public.is_staff());

-- School: catalogue is public; lesson content needs enrollment (or a preview).
create policy "courses: public read" on public.courses for select using (status = 'published' or public.is_staff());
create policy "courses: staff"       on public.courses for all using (public.is_staff()) with check (public.is_staff());
create policy "modules: public read" on public.course_modules for select using (
  public.is_staff() or exists (select 1 from public.courses c where c.id = course_id and c.status = 'published')
);
create policy "modules: staff" on public.course_modules for all using (public.is_staff()) with check (public.is_staff());
create policy "lessons: enrolled read" on public.lessons for select using (
  public.is_staff() or exists (
    select 1 from public.course_modules m
    join public.courses c on c.id = m.course_id
    where m.id = module_id and c.status = 'published'
      and (is_preview or public.is_enrolled(c.id))
  )
);
create policy "lessons: staff" on public.lessons for all using (public.is_staff()) with check (public.is_staff());
create policy "enrollments: own read" on public.enrollments for select using (user_id = auth.uid() or public.is_staff());
create policy "enrollments: staff"    on public.enrollments for all using (public.is_staff()) with check (public.is_staff());
create policy "progress: own" on public.lesson_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "progress: staff read" on public.lesson_progress for select using (public.is_staff());

-- Store: catalogue public; pages only via the API (signed URLs), owners see their library.
create policy "books: public read" on public.books for select using (status = 'published' or public.is_staff());
create policy "books: staff"       on public.books for all using (public.is_staff()) with check (public.is_staff());
create policy "book_pages: staff"  on public.book_pages for all using (public.is_staff()) with check (public.is_staff());
create policy "user_books: own read" on public.user_books for select using (user_id = auth.uid() or public.is_staff());
create policy "user_books: staff"    on public.user_books for all using (public.is_staff()) with check (public.is_staff());

-- Orders/payments: owners can read their own; only the API (service role) writes.
create policy "orders: own read" on public.orders for select using (user_id = auth.uid() or public.is_staff());
create policy "order_items: own read" on public.order_items for select using (
  public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy "payments: own read" on public.payments for select using (
  public.is_staff() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy "payment_events: admin read" on public.payment_events for select
  using (public.current_role_is(array['admin']::public.user_role[]));

-- Media and resources
create policy "series: public read" on public.video_series for select using (status = 'published' or public.is_staff());
create policy "series: staff"       on public.video_series for all using (public.is_staff()) with check (public.is_staff());
create policy "videos: read" on public.videos for select using (
  public.is_staff() or (
    status = 'published' and (access = 'public' or auth.uid() is not null)
  )
);
create policy "videos: staff" on public.videos for all using (public.is_staff()) with check (public.is_staff());
create policy "resources: read" on public.resources for select using (
  public.is_staff() or (
    status = 'published' and (access = 'public' or auth.uid() is not null)
  )
);
create policy "resources: staff" on public.resources for all using (public.is_staff()) with check (public.is_staff());
