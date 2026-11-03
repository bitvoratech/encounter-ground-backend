import { Router, type Response } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { supabaseAdmin } from "../db/supabase.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get("/", async (req: AuthedRequest, res) => {
  const [profile] = await query(
    `select id, email, full_name, phone, avatar_url, role, created_at
       from profiles where id = $1`,
    [req.user!.id],
  );
  if (!profile) return res.status(404).json({ error: "Profile not found" });
  res.json(profile);
});

const updateSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
});

meRouter.patch("/", async (req: AuthedRequest, res) => {
  const body = updateSchema.safeParse(req.body);
  if (!body.success)
    return res.status(400).json({ error: z.prettifyError(body.error) });

  const [profile] = await query(
    `update profiles
        set full_name = coalesce($2, full_name),
            phone     = coalesce($3, phone)
      where id = $1
  returning id, email, full_name, phone, avatar_url, role, created_at`,
    [req.user!.id, body.data.full_name ?? null, body.data.phone ?? null],
  );
  res.json(profile);
});

/** Books the signed-in member owns ("My Books"), most recently read first. */
meRouter.get("/books", async (req: AuthedRequest, res) => {
  const rows = await query(
    `select b.slug, b.title, b.subtitle, b.author, b.audience, b.cover_image_url, b.page_count, b.pages_ready,
            ub.last_page, ub.last_read_at, ub.granted_at
       from user_books ub join books b on b.id = ub.book_id
      where ub.user_id = $1
      order by coalesce(ub.last_read_at, ub.granted_at) desc`,
    [req.user!.id],
  );
  res.json(rows);
});

// ---------------------------------------------------------------------------
// The reader. Owners (and staff, to check a book) read page images through short-lived
// signed links; the book's PDF is never served.
// ---------------------------------------------------------------------------

type ReadableBook = { id: string; slug: string; title: string; page_count: number | null; last_page: number | null };

/** A book the member may read, or null after sending 403/404. */
async function readableBook(req: AuthedRequest, res: Response) {
  const [book] = await query<ReadableBook & { owned: boolean }>(
    `select b.id, b.slug, b.title, b.page_count, ub.last_page, ub.user_id is not null as owned
       from books b left join user_books ub on ub.book_id = b.id and ub.user_id = $2
      where b.slug = $1 and (b.status <> 'draft' or $3)`,
    [req.params.slug, req.user!.id, req.user!.role !== "member"],
  );
  if (!book) {
    res.status(404).json({ error: "Book not found" });
    return null;
  }
  if (!book.owned && req.user!.role === "member") {
    res.status(403).json({ error: "Buy this book to read it." });
    return null;
  }
  return book;
}

/** What the reader needs to open a book: its pages' sizes and where the member stopped. */
meRouter.get("/books/:slug", async (req: AuthedRequest, res) => {
  const book = await readableBook(req, res);
  if (!book) return;
  const pages = await query<{ page_number: number; width: number | null; height: number | null }>(
    `select page_number, width, height from book_pages where book_id = $1 order by page_number`,
    [book.id],
  );
  res.set("Cache-Control", "private, no-store");
  res.json({
    slug: book.slug,
    title: book.title,
    page_count: pages.length,
    last_page: Math.min(Math.max(book.last_page ?? 1, 1), Math.max(pages.length, 1)),
    pages: pages.map((p) => ({ n: p.page_number, w: p.width, h: p.height })),
  });
});

const PAGE_LINK_SECONDS = 10 * 60;

const pagesQuery = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
});

/** Signed links for a run of pages (at most 8 at a time), valid for ten minutes. */
meRouter.get("/books/:slug/pages", async (req: AuthedRequest, res) => {
  const range = pagesQuery.safeParse(req.query);
  if (!range.success || range.data.to < range.data.from) return res.status(400).json({ error: "Ask for a range of pages" });
  const to = Math.min(range.data.to, range.data.from + 7);
  const book = await readableBook(req, res);
  if (!book) return;

  const rows = await query<{ page_number: number; storage_path: string }>(
    `select page_number, storage_path from book_pages where book_id = $1 and page_number between $2 and $3 order by page_number`,
    [book.id, range.data.from, to],
  );
  if (rows.length === 0) return res.json([]);
  const { data, error } = await supabaseAdmin.storage
    .from("book-pages")
    .createSignedUrls(rows.map((r) => r.storage_path), PAGE_LINK_SECONDS);
  if (error) throw error;
  res.set("Cache-Control", "private, no-store");
  res.json(rows.map((r, i) => ({ n: r.page_number, url: data[i]?.signedUrl ?? null })));
});

const progressSchema = z.object({ page: z.number().int().min(1).max(10000) });

/** Remember where the member stopped, so the book opens there next time. */
meRouter.put("/books/:slug/progress", async (req: AuthedRequest, res) => {
  const body = progressSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Send the page number" });
  await query(
    `update user_books ub set last_page = $3, last_read_at = now()
       from books b
      where b.id = ub.book_id and b.slug = $1 and ub.user_id = $2`,
    [req.params.slug, req.user!.id, body.data.page],
  );
  res.json({ ok: true });
});
