-- The online book reader. When the team uploads a book's PDF in the admin, the browser turns
-- each page into an image and uploads it here; the PDF itself is never stored or served.
-- Owners read the pages through short-lived signed links from the API (book_pages rows).
--
-- Site content (contact details, YADA conference, home page links) needs no change: the
-- core schema's site_content table and its policies already fit.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('book-pages', 'book-pages', false, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "book pages: staff read" on storage.objects for select to authenticated
  using (bucket_id = 'book-pages' and public.is_staff());
create policy "book pages: staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'book-pages' and public.is_staff());
create policy "book pages: staff update" on storage.objects for update to authenticated
  using (bucket_id = 'book-pages' and public.is_staff());
create policy "book pages: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'book-pages' and public.is_staff());
