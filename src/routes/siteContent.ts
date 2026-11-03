import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import type { AuthedRequest } from "../middleware/auth.js";

// Small blocks of website wording the team edits in the admin without a developer: contact
// details, the YADA conference, and the home page's links. Each key has a fixed shape. The
// website falls back to its built-in wording for anything not saved here yet.

const text = (max: number) => z.string().trim().max(max);
const link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Links must start with https://");

const schemas = {
  contact: z.object({
    email: z.email("Enter a valid email address").trim(),
    phone: text(30).min(1, "Add a phone number"),
    instagram: link,
    youtube: link,
    tiktok: link,
    whatsapp_channel: link,
  }),
  yada: z.object({
    theme: text(200).min(1, "Add the conference theme"),
    when: text(100).min(1, "Say when the conference is"),
    register_url: link,
    about: text(3000),
    dress: text(1000),
  }),
  home: z.object({
    tagline: text(120).min(1, "Add the tagline"),
    join_url: link,
    zoom_url: link,
    mixlr_url: link,
    replays_url: link,
  }),
} as const;

type Key = keyof typeof schemas;
const keys = Object.keys(schemas) as Key[];
const isKey = (k: string): k is Key => (keys as string[]).includes(k);

async function readAll() {
  const rows = await query<{ key: string; value: unknown; updated_at: string }>(
    `select key, value, updated_at from site_content where key = any($1)`,
    [keys],
  );
  return rows;
}

/** Public: every saved block, as { contact: {...}, yada: {...}, home: {...} }. */
export const siteContentRouter = Router();

siteContentRouter.get("/", async (_req, res) => {
  const rows = await readAll();
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    // Only serve values that still fit their shape, so the website can trust them.
    const parsed = schemas[r.key as Key].safeParse(r.value);
    if (parsed.success) out[r.key] = parsed.data;
  }
  res.set("Cache-Control", "public, max-age=30");
  res.json(out);
});

/** Staff: the saved blocks with when they changed; mounted inside the admin router. */
export const adminSiteContentRouter = Router();

adminSiteContentRouter.get("/site-content", async (_req, res) => {
  const rows = await readAll();
  res.json(Object.fromEntries(rows.map((r) => [r.key, { value: r.value, updated_at: r.updated_at }])));
});

adminSiteContentRouter.put("/site-content/:key", async (req: AuthedRequest, res) => {
  const key = String(req.params.key);
  if (!isKey(key)) return res.status(404).json({ error: "Unknown section" });
  const body = schemas[key].safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Check the form and try again" });
  await query(
    `insert into site_content (key, value, updated_by) values ($1, $2, $3)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
    [key, JSON.stringify(body.data), req.user!.id],
  );
  res.json({ ok: true });
});
