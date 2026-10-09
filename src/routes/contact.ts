import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { optionalAuth, type AuthedRequest } from "../middleware/auth.js";

// The website contact form.
export const contactRouter = Router();

const messageSchema = z.object({
  full_name: z.string().trim().min(1, "Please enter your name").max(120),
  email: z.email("Please enter a valid email address").max(254),
  phone: z.string().trim().max(30).optional().default(""),
  subject: z.string().trim().min(1, "Please add a subject").max(160),
  message: z.string().trim().min(1, "Please write a message").max(5000),
  // Honeypot: hidden from people, filled in by bots.
  website: z.string().optional(),
});

contactRouter.post("/", optionalAuth, async (req: AuthedRequest, res) => {
  const body = messageSchema.safeParse(req.body);
  if (!body.success)
    return res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid message" });

  const { full_name, email, phone, subject, message, website } = body.data;
  // Bots get the same answer as people so they don't learn to skip the field.
  if (website) return res.status(201).json({ ok: true });

  await query(
    `insert into contact_messages (user_id, full_name, email, phone, subject, message)
     values ($1, $2, $3, $4, $5, $6)`,
    [req.user?.id ?? null, full_name, email, phone || null, subject, message],
  );
  res.status(201).json({ ok: true });
});
