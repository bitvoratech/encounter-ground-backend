import { Router, type Response } from "express";
import type pg from "pg";
import { z } from "zod";
import { env } from "../config/env.js";
import { pool, query } from "../db/pool.js";

// Admin for books and classes. Mounted inside the admin router, so every route here is for
// staff (editors and admins). Covers and lesson files are uploaded by the browser straight
// to Supabase Storage; these routes only store where they ended up.

export const adminCatalogueRouter = Router();

const idParam = z.uuid();

const statusSchema = z.enum(["draft", "published", "archived"]);

/** Lowercase words joined by hyphens: what appears in the page's address. */
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Add a web address")
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "The web address can only use letters, numbers and single hyphens");

/** An optional field: empty or missing is stored as null. */
const optional = <T extends z.ZodType>(schema: T) =>
  z
    .preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional())
    .transform((v) => v ?? null);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

/** A link the team pastes in. */
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "Links must start with https://");

const optionalUrl = optional(httpsUrl);

/** A cover: one of the website's own images, or a file uploaded to the covers bucket. */
const coverUrl = optional(
  z
    .string()
    .trim()
    .refine(
      (v) => /^\/images\/[\w./-]+$/.test(v) || v.startsWith(`${env.SUPABASE_URL}/storage/v1/object/public/covers/`),
      "Upload the cover here",
    ),
);

/** YouTube or Vimeo, the hosts the lesson player can show. */
const videoUrl = optional(
  httpsUrl.refine((v) => {
    const host = new URL(v).hostname.replace(/^www\.|^m\./, "");
    return ["youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com"].includes(host);
  }, "Use a YouTube or Vimeo link"),
);

function badRequest(res: Response, error: z.ZodError) {
  return res.status(400).json({ error: error.issues[0]?.message ?? "Check the form and try again" });
}

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === "23505";

async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** A web address made from a title: "Walking it out!" → "walking-it-out". */
export function slugify(title: string) {
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "lesson"
  );
}

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

const currencies = ["CAD", "USD", "NGN"] as const;

const BOOK_SELECT = `
  select b.id, b.slug, b.title, b.subtitle, b.author, b.audience, b.description, b.cover_image_url,
         b.amazon_url, b.page_count, b.sort_order, b.status, b.updated_at,
         coalesce((select json_object_agg(p.currency, p.amount) from book_prices p where p.book_id = b.id), '{}') as prices,
         (select count(*) from user_books ub where ub.book_id = b.id)::int as owners
    from books b`;

const bookSchema = z.object({
  title: z.string().trim().min(1, "Add the book’s title").max(200),
  slug: slugSchema,
  subtitle: optionalText(300),
  author: optionalText(120),
  audience: optionalText(80),
  description: optionalText(5000),
  cover_image_url: coverUrl,
  amazon_url: optionalUrl,
  page_count: optional(z.number().int().min(1).max(5000)),
  sort_order: z.number().int().min(0).max(10000).default(0),
  status: statusSchema,
  /** Minor units per currency (cents, kobo). A currency left out isn't sold in. */
  prices: z.object({
    CAD: z.number().int().min(0).max(100_000_000).nullish(),
    USD: z.number().int().min(0).max(100_000_000).nullish(),
    NGN: z.number().int().min(0).max(1_000_000_000).nullish(),
  }),
});

type BookInput = z.infer<typeof bookSchema>;

async function savePrices(client: pg.PoolClient, bookId: string, prices: BookInput["prices"]) {
  await client.query(`delete from book_prices where book_id = $1`, [bookId]);
  for (const currency of currencies) {
    const amount = prices[currency];
    if (amount === null || amount === undefined) continue;
    await client.query(`insert into book_prices (book_id, currency, amount) values ($1, $2, $3)`, [bookId, currency, amount]);
  }
}

const bookParams = (b: BookInput) => [
  b.slug,
  b.title,
  b.subtitle,
  b.author,
  b.audience,
  b.description,
  b.cover_image_url,
  b.amazon_url,
  b.page_count,
  b.sort_order,
  b.status,
];

adminCatalogueRouter.get("/books", async (_req, res) => {
  res.json(await query(`${BOOK_SELECT} order by b.sort_order, b.title`));
});

adminCatalogueRouter.get("/books/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: "Book not found" });
  const [book] = await query(`${BOOK_SELECT} where b.id = $1`, [id.data]);
  if (!book) return res.status(404).json({ error: "Book not found" });
  res.json(book);
});

adminCatalogueRouter.post("/books", async (req, res) => {
  const body = bookSchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  try {
    const id = await transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into books (slug, title, subtitle, author, audience, description, cover_image_url, amazon_url,
                            page_count, sort_order, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
        bookParams(body.data),
      );
      await savePrices(client, rows[0]!.id, body.data.prices);
      return rows[0]!.id;
    });
    res.status(201).json({ id });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: "Another book already uses that web address." });
    throw err;
  }
});

adminCatalogueRouter.put("/books/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = bookSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: "Book not found" });
  if (!body.success) return badRequest(res, body.error);
  try {
    const found = await transaction(async (client) => {
      const { rowCount } = await client.query(
        `update books set slug = $1, title = $2, subtitle = $3, author = $4, audience = $5, description = $6,
                          cover_image_url = $7, amazon_url = $8, page_count = $9, sort_order = $10, status = $11
          where id = $12`,
        [...bookParams(body.data), id.data],
      );
      if (!rowCount) return false;
      await savePrices(client, id.data, body.data.prices);
      return true;
    });
    if (!found) return res.status(404).json({ error: "Book not found" });
    res.json({ id: id.data });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: "Another book already uses that web address." });
    throw err;
  }
});

/** Delete a book nobody owns or has ordered. Otherwise it should be archived instead. */
adminCatalogueRouter.delete("/books/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: "Book not found" });
  const [used] = await query(
    `select 1 from user_books where book_id = $1 union all select 1 from order_items where book_id = $1 limit 1`,
    [id.data],
  );
  if (used)
    return res.status(409).json({ error: "People have bought this book, so it can’t be deleted. Archive it to take it off the shop." });
  const [row] = await query(`delete from books where id = $1 returning id`, [id.data]);
  if (!row) return res.status(404).json({ error: "Book not found" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Classes (courses)
// ---------------------------------------------------------------------------

const courseSchema = z.object({
  title: z.string().trim().min(1, "Add the class name").max(120),
  slug: slugSchema,
  summary: optionalText(600),
  description: optionalText(5000),
  meaning: optionalText(120),
  badge: optionalText(40),
  outcomes: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  sort_order: z.number().int().min(0).max(10000).default(0),
  status: statusSchema,
});

type CourseInput = z.infer<typeof courseSchema>;

const courseParams = (c: CourseInput) => [
  c.slug,
  c.title,
  c.summary,
  c.description,
  c.meaning,
  c.badge,
  c.outcomes,
  c.sort_order,
  c.status,
];

adminCatalogueRouter.get("/courses", async (_req, res) => {
  const rows = await query(
    `select c.id, c.slug, c.title, c.summary, c.badge, c.sort_order, c.status, c.updated_at,
            (select count(*) from course_modules m where m.course_id = c.id)::int as module_count,
            (select count(*) from lessons l join course_modules m on m.id = l.module_id where m.course_id = c.id)::int
              as lesson_count,
            (select count(*) from enrollments e where e.course_id = c.id)::int as enrolments
       from courses c
      order by c.sort_order, c.title`,
  );
  res.json(rows);
});

/** A class with everything the editor needs: modules, lessons with their content, and the final check. */
adminCatalogueRouter.get("/courses/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: "Class not found" });
  const [course] = await query(
    `select c.id, c.slug, c.title, c.summary, c.description, c.meaning, c.badge, c.outcomes, c.sort_order, c.status,
            (select count(*) from enrollments e where e.course_id = c.id)::int as enrolments
       from courses c where c.id = $1`,
    [id.data],
  );
  if (!course) return res.status(404).json({ error: "Class not found" });

  const [modules, lessons, quiz] = await Promise.all([
    query<{ id: string }>(
      `select id, title, summary, position from course_modules where course_id = $1 order by position, created_at`,
      [id.data],
    ),
    query<{ module_id: string }>(
      `select l.id, l.module_id, l.slug, l.title, l.kind, l.body, l.video_url, l.attachment_path, l.prompt,
              coalesce(l.duration_seconds, 0) / 60 as minutes, l.is_preview as preview, l.position
         from lessons l join course_modules m on m.id = l.module_id
        where m.course_id = $1
        order by m.position, l.position, l.created_at`,
      [id.data],
    ),
    query(
      `select question, options, answer_index, explanation from course_quiz_questions where course_id = $1 order by position`,
      [id.data],
    ),
  ]);

  res.json({
    ...course,
    modules: modules.map((m) => ({
      ...m,
      lessons: lessons.filter((l) => l.module_id === m.id).map(({ module_id: _m, ...l }) => l),
    })),
    quiz,
  });
});

adminCatalogueRouter.post("/courses", async (req, res) => {
  const body = courseSchema.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  try {
    const [row] = await query<{ id: string }>(
      `insert into courses (slug, title, summary, description, meaning, badge, outcomes, sort_order, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      courseParams(body.data),
    );
    res.status(201).json({ id: row!.id });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: "Another class already uses that web address." });
    throw err;
  }
});

adminCatalogueRouter.put("/courses/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = courseSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: "Class not found" });
  if (!body.success) return badRequest(res, body.error);
  try {
    const [row] = await query(
      `update courses set slug = $1, title = $2, summary = $3, description = $4, meaning = $5, badge = $6,
                          outcomes = $7, sort_order = $8, status = $9
        where id = $10 returning id`,
      [...courseParams(body.data), id.data],
    );
    if (!row) return res.status(404).json({ error: "Class not found" });
    res.json({ id: id.data });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: "Another class already uses that web address." });
    throw err;
  }
});

/** Delete a class nobody has enrolled in. Otherwise it should be archived instead. */
adminCatalogueRouter.delete("/courses/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: "Class not found" });
  const [used] = await query(
    `select 1 from enrollments where course_id = $1 union all select 1 from order_items where course_id = $1 limit 1`,
    [id.data],
  );
  if (used)
    return res.status(409).json({ error: "Students have enrolled in this class, so it can’t be deleted. Archive it to hide it." });
  const [row] = await query(`delete from courses where id = $1 returning id`, [id.data]);
  if (!row) return res.status(404).json({ error: "Class not found" });
  res.json({ ok: true });
});

/**
 * Put a class's modules, and the lessons within each, in a new order. Lessons may move
 * between modules. Every module and lesson of the class must be listed exactly once.
 */
const orderSchema = z.object({
  modules: z.array(z.object({ id: z.uuid(), lessons: z.array(z.uuid()) })).max(100),
});

adminCatalogueRouter.put("/courses/:id/order", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = orderSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: "Class not found" });
  if (!body.success) return badRequest(res, body.error);

  const [current] = await query<{ modules: string[] | null; lessons: string[] | null }>(
    `select (select array_agg(id) from course_modules where course_id = $1) as modules,
            (select array_agg(l.id) from lessons l join course_modules m on m.id = l.module_id where m.course_id = $1) as lessons`,
    [id.data],
  );
  const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));
  const moduleIds = body.data.modules.map((m) => m.id);
  const lessonIds = body.data.modules.flatMap((m) => m.lessons);
  if (!sameSet(moduleIds, current?.modules ?? []) || !sameSet(lessonIds, current?.lessons ?? []))
    return res.status(409).json({ error: "The class changed while you were editing it. Refresh and try again." });

  await transaction(async (client) => {
    for (const [mi, m] of body.data.modules.entries()) {
      await client.query(`update course_modules set position = $2 where id = $1`, [m.id, mi + 1]);
      for (const [li, lessonId] of m.lessons.entries())
        await client.query(`update lessons set module_id = $2, position = $3 where id = $1`, [lessonId, m.id, li + 1]);
    }
  });
  res.json({ ok: true });
});

/** Replace a class's final-check questions. */
const quizSchema = z.object({
  questions: z
    .array(
      z
        .object({
          question: z.string().trim().min(1, "Every question needs its wording").max(500),
          options: z.array(z.string().trim().min(1, "Answers can’t be empty").max(200)).min(2, "Give at least two answers").max(6),
          answer_index: z.number().int().min(0),
          explanation: optionalText(1000),
        })
        .refine((q) => q.answer_index < q.options.length, "Pick the right answer for every question"),
    )
    .max(30),
});

adminCatalogueRouter.put("/courses/:id/quiz", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = quizSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: "Class not found" });
  if (!body.success) return badRequest(res, body.error);
  const [course] = await query(`select 1 from courses where id = $1`, [id.data]);
  if (!course) return res.status(404).json({ error: "Class not found" });

  await transaction(async (client) => {
    await client.query(`delete from course_quiz_questions where course_id = $1`, [id.data]);
    for (const [i, q] of body.data.questions.entries())
      await client.query(
        `insert into course_quiz_questions (course_id, position, question, options, answer_index, explanation)
         values ($1, $2, $3, $4, $5, $6)`,
        [id.data, i + 1, q.question, q.options, q.answer_index, q.explanation],
      );
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

const moduleSchema = z.object({
  title: z.string().trim().min(1, "Add the module’s title").max(200),
  summary: optionalText(1000),
});

adminCatalogueRouter.post("/courses/:id/modules", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = moduleSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: "Class not found" });
  if (!body.success) return badRequest(res, body.error);
  const [row] = await query<{ id: string }>(
    `insert into course_modules (course_id, title, summary, position)
     select c.id, $2, $3, coalesce((select max(position) from course_modules where course_id = c.id), 0) + 1
       from courses c where c.id = $1
     returning id`,
    [id.data, body.data.title, body.data.summary],
  );
  if (!row) return res.status(404).json({ error: "Class not found" });
  res.status(201).json({ id: row.id });
});

adminCatalogueRouter.put("/modules/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = moduleSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: "Module not found" });
  if (!body.success) return badRequest(res, body.error);
  const [row] = await query(`update course_modules set title = $2, summary = $3 where id = $1 returning id`, [
    id.data,
    body.data.title,
    body.data.summary,
  ]);
  if (!row) return res.status(404).json({ error: "Module not found" });
  res.json({ id: id.data });
});

/** Only an empty module can be deleted, so lessons (and students' work on them) aren't lost by accident. */
adminCatalogueRouter.delete("/modules/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: "Module not found" });
  const [hasLessons] = await query(`select 1 from lessons where module_id = $1 limit 1`, [id.data]);
  if (hasLessons) return res.status(409).json({ error: "Move or delete this module’s lessons first." });
  const [row] = await query(`delete from course_modules where id = $1 returning id`, [id.data]);
  if (!row) return res.status(404).json({ error: "Module not found" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

const lessonSchema = z.object({
  title: z.string().trim().min(1, "Add the lesson’s title").max(200),
  kind: z.enum(["video", "audio", "text", "pdf", "checkpoint", "quiz"]),
  body: optionalText(50_000),
  video_url: videoUrl,
  /** Path inside the lesson-files bucket, set after the browser uploads the file. */
  attachment_path: optional(z.string().regex(/^lessons\/[\w./-]+$/, "Upload the file again")),
  prompt: optionalText(1000),
  minutes: z.number().int().min(0).max(600).default(0),
  preview: z.boolean().default(false),
});

type LessonInput = z.infer<typeof lessonSchema>;

const lessonParams = (l: LessonInput) => [
  l.title,
  l.kind,
  l.body,
  l.video_url,
  l.attachment_path,
  l.kind === "checkpoint" ? l.prompt : null,
  l.minutes * 60,
  l.preview,
];

/** A lesson slug not yet used anywhere in the class (students' links are /classes/<class>/<lesson>). */
async function freeLessonSlug(client: pg.PoolClient, courseId: string, title: string) {
  const base = slugify(title);
  const { rows } = await client.query<{ slug: string }>(
    `select l.slug from lessons l join course_modules m on m.id = l.module_id where m.course_id = $1`,
    [courseId],
  );
  const taken = new Set(rows.map((r) => r.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

adminCatalogueRouter.post("/modules/:id/lessons", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = lessonSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: "Module not found" });
  if (!body.success) return badRequest(res, body.error);

  const created = await transaction(async (client) => {
    const { rows } = await client.query<{ course_id: string }>(
      `select course_id from course_modules where id = $1 for update`,
      [id.data],
    );
    if (!rows[0]) return null;
    // Lock the class so two lessons added at once can't take the same address.
    await client.query(`select 1 from courses where id = $1 for update`, [rows[0].course_id]);
    const slug = await freeLessonSlug(client, rows[0].course_id, body.data.title);
    const inserted = await client.query<{ id: string; slug: string }>(
      `insert into lessons (module_id, slug, title, kind, body, video_url, attachment_path, prompt, duration_seconds, is_preview, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               coalesce((select max(position) from lessons where module_id = $1), 0) + 1)
       returning id, slug`,
      [id.data, slug, ...lessonParams(body.data)],
    );
    return inserted.rows[0]!;
  });
  if (!created) return res.status(404).json({ error: "Module not found" });
  res.status(201).json(created);
});

/** Edit a lesson. Its web address stays the same, so students' links keep working. */
adminCatalogueRouter.put("/lessons/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = lessonSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: "Lesson not found" });
  if (!body.success) return badRequest(res, body.error);
  const [row] = await query(
    `update lessons set title = $2, kind = $3, body = $4, video_url = $5, attachment_path = $6, prompt = $7,
                        duration_seconds = $8, is_preview = $9
      where id = $1 returning id`,
    [id.data, ...lessonParams(body.data)],
  );
  if (!row) return res.status(404).json({ error: "Lesson not found" });
  res.json({ id: id.data });
});

/** Delete a lesson, with students' progress and checkpoint answers on it. The admin asks first. */
adminCatalogueRouter.delete("/lessons/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return res.status(404).json({ error: "Lesson not found" });
  const [row] = await query(`delete from lessons where id = $1 returning id`, [id.data]);
  if (!row) return res.status(404).json({ error: "Lesson not found" });
  res.json({ ok: true });
});
