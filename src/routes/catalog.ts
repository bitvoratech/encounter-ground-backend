import { Router } from "express";
import { query } from "../db/pool.js";

// Public, read-only catalogue endpoints. Only published rows are returned.
export const booksRouter = Router();
export const eventsRouter = Router();

const BOOK_FIELDS = `id, slug, title, subtitle, author, description, cover_image_url,
  format, price_kobo, currency, page_count`;

booksRouter.get("/", async (_req, res) => {
  const rows = await query(
    `select ${BOOK_FIELDS} from books where status = 'published' order by created_at desc`,
  );
  res.json(rows);
});

booksRouter.get("/:slug", async (req, res) => {
  const [book] = await query(
    `select ${BOOK_FIELDS} from books where slug = $1 and status = 'published'`,
    [req.params.slug],
  );
  if (!book) return res.status(404).json({ error: "Book not found" });
  res.json(book);
});

const EVENT_FIELDS = `id, slug, title, summary, body, theme, venue, starts_at, ends_at,
  time_tbc, is_recurring, recurrence_note, dress_code, cover_image_url, registration_open`;

eventsRouter.get("/", async (_req, res) => {
  const rows = await query(
    `select ${EVENT_FIELDS} from events where status = 'published'
      order by is_recurring, starts_at nulls last, title`,
  );
  res.json(rows);
});

eventsRouter.get("/:slug", async (req, res) => {
  const [event] = await query(
    `select ${EVENT_FIELDS} from events where slug = $1 and status = 'published'`,
    [req.params.slug],
  );
  if (!event) return res.status(404).json({ error: "Event not found" });
  res.json(event);
});
