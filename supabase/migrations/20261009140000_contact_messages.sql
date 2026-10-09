-- Messages sent through the website's contact form (replaces the old
-- WordPress/Elementor form). Staff read them in the admin dashboard.

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null,
  full_name   text not null,
  email       citext not null,
  phone       text,
  subject     text not null,
  message     text not null,
  handled_at  timestamptz,                -- set when a staff member has replied
  created_at  timestamptz not null default now()
);
create index on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

-- Written only through the API (which validates input); staff read and manage.
create policy "contact_messages: staff" on public.contact_messages for all
  using (public.is_staff()) with check (public.is_staff());
