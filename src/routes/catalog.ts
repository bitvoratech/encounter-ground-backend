import { Router } from "express";
import { query } from "../db/pool.js";

// Public, read-only catalogue endpoints. Only published rows are returned.
export const booksRouter = Router();
export const eventsRouter = Router();

// Prices are per currency, in minor units (cents, kobo): { "CAD": 1299, "USD": 999, "NGN": 750000 }.
const BOOK_FIELDS = `b.id, b.slug, b.title, b.subtitle, b.author, b.audience, b.description, b.cover_image_url,
  b.amazon_url, b.format, b.page_count,
  coalesce((select json_object_agg(p.currency, p.amount) from book_prices p where p.book_id = b.id), '{}') as prices`;

booksRouter.get("/", async (_req, res) => {
  const rows = await query(
    `select ${BOOK_FIELDS} from books b where b.status = 'published' order by b.sort_order, b.title`,
  );
  res.json(rows);
});

booksRouter.get("/:slug", async (req, res) => {
  const [book] = await query(
    `select ${BOOK_FIELDS} from books b where b.slug = $1 and b.status = 'published'`,
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
