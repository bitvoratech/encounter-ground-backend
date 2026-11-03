import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
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

/** Books the signed-in member owns ("My Books"). */
meRouter.get("/books", async (req: AuthedRequest, res) => {
  const rows = await query(
    `select b.id, b.slug, b.title, b.author, b.cover_image_url, b.page_count,
            ub.last_page, ub.last_read_at, ub.granted_at
       from user_books ub join books b on b.id = ub.book_id
      where ub.user_id = $1
      order by coalesce(ub.last_read_at, ub.granted_at) desc`,
    [req.user!.id],
  );
  res.json(rows);
});
