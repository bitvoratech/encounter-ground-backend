-- Admin for books and classes: what the ministry team needs to add and edit books, classes,
-- modules, lessons and their content without a developer.
--
-- * Books are sold worldwide with a price set per currency (CAD, USD, NGN), not converted,
--   so prices move from books.price_kobo / books.currency to book_prices. Amounts are in
--   minor units (cents, kobo).
-- * Books gain the fields the website already shows: who a book is for, and its paperback
--   link on Amazon.
-- * Lessons gain a video link (YouTube or Vimeo for now; protected hosting is a later phase).
-- * Two storage buckets: public book covers, and private lesson files (PDF study guides,
--   audio) that the API hands to enrolled students as short-lived signed links. Staff
--   upload straight from the browser, so large files never pass through the API.
-- * The seven books from the website move into the database.

-- ---------------------------------------------------------------------------
-- Books
-- ---------------------------------------------------------------------------
alter table public.books
  add column audience    text,                    -- e.g. 'Adults', 'Teenage girls'
  add column amazon_url  text,                    -- paperback on Amazon
  add column sort_order  integer not null default 0;

create table public.book_prices (
  book_id   uuid not null references public.books (id) on delete cascade,
  currency  char(3) not null check (currency in ('CAD', 'USD', 'NGN')),
  amount    integer not null check (amount >= 0),  -- minor units: cents, kobo
  primary key (book_id, currency)
);

alter table public.book_prices enable row level security;
create policy "book prices: public read" on public.book_prices for select using (
  exists (select 1 from public.books b where b.id = book_id and (b.status = 'published' or public.is_staff()))
);
create policy "book prices: staff" on public.book_prices for all
  using (public.is_staff()) with check (public.is_staff());

-- Nothing has been sold yet, so the single NGN price column can go.
alter table public.books
  drop column price_kobo,
  drop column currency;

-- ---------------------------------------------------------------------------
-- Lessons
-- ---------------------------------------------------------------------------
alter table public.lessons
  add column video_url text;   -- YouTube or Vimeo link for video lessons

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('covers', 'covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('lesson-files', 'lesson-files', false, 104857600,
   array['application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/ogg'])
on conflict (id) do nothing;

-- Anyone can see covers (the bucket is public); only staff add, replace or remove them.
create policy "covers: staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and public.is_staff());
create policy "covers: staff update" on storage.objects for update to authenticated
  using (bucket_id = 'covers' and public.is_staff());
create policy "covers: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and public.is_staff());

-- Lesson files are private: staff manage them, students get signed links from the API.
create policy "lesson files: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'lesson-files' and public.is_staff());
create policy "lesson files: staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'lesson-files' and public.is_staff());
create policy "lesson files: staff update" on storage.objects for update to authenticated
  using (bucket_id = 'lesson-files' and public.is_staff());
create policy "lesson files: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'lesson-files' and public.is_staff());

-- ---------------------------------------------------------------------------
-- The website's books, with the sample prices it shows today. The ministry replaces the
-- prices (and adds descriptions) in the admin.
-- ---------------------------------------------------------------------------
insert into public.books (slug, title, subtitle, author, audience, cover_image_url, amazon_url, format, sort_order, status) values
  ('from-servant-to-bride', 'From Servant to Bride', null, 'Toyin Bello', 'Adults',
   '/images/books/from-servant-to-bride.jpg', 'https://amzn.eu/d/0bostYPQ', 'digital', 1, 'published'),
  ('from-bride-to-warrior-bride', 'From Bride to Warrior Bride', null, 'Toyin Bello', 'Adults',
   '/images/books/from-bride-to-warrior-bride.jpg', 'https://www.amazon.com/Bride-Warrior-TOYIN-BELLO/dp/1738231100', 'digital', 2, 'published'),
  ('from-bride-to-beloved', 'From Bride to Beloved', null, 'Toyin Bello', 'Adults',
   '/images/books/from-bride-to-beloved-cover.jpg', 'https://www.amazon.com/stores/Toyin-Bello/author/B0C7VPYKPW/allbooks', 'digital', 3, 'published'),
  ('whispers-the-journal', 'Whispers: The Journal', 'Living out my scroll each day guided by His gentle whispers', 'Toyin Bello', 'Journal',
   '/images/books/whispers-the-journal.jpg', 'https://www.amazon.com/stores/Toyin-Bello/author/B0C7VPYKPW/allbooks', 'digital', 4, 'published'),
  ('burn', 'Burn', 'A Devotional Journal to Guide Pre-Teens and Teenagers on How to Pray', 'Toyin Bello', 'Pre-teens and teens',
   '/images/books/burn.jpg', 'https://amzn.eu/d/05IBNF9F', 'digital', 5, 'published'),
  ('who-i-am-becoming-girls', 'Who I Am Becoming', 'A Devo-Journal on Identity for Teenage Girls: Building a Daily Connection with God', 'Toyin Bello', 'Teenage girls',
   '/images/books/who-i-am-becoming-girls.jpg', 'https://amzn.eu/d/0dxXTtJ2', 'digital', 6, 'published'),
  ('who-i-am-becoming-guys', 'Who I Am Becoming', 'A Devo-Journal on Identity for Teenage Guys: Building a Daily Connection with God', 'Toyin Bello', 'Teenage guys',
   '/images/books/who-i-am-becoming-guys.jpg', 'https://amzn.eu/d/04uPCtq4', 'digital', 7, 'published')
on conflict (slug) do nothing;

insert into public.book_prices (book_id, currency, amount)
select b.id, p.currency, case when b.audience = 'Adults' then p.adult else p.journal end
  from public.books b
 cross join (values ('CAD', 1299, 999), ('USD', 999, 799), ('NGN', 750000, 500000)) as p (currency, adult, journal)
on conflict do nothing;
