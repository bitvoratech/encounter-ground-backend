import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAdmin, requireAuth, requireStaff, type AuthedRequest } from "../middleware/auth.js";

// The admin dashboard: for staff (editors and admins). Teachers review checkpoints and the
// team works through contact messages; only admins see the member list and change roles.
export const adminRouter = Router();

adminRouter.use(requireAuth, requireStaff);

const idParam = z.uuid();

// ---------------------------------------------------------------------------
// Checkpoints: students' written reflections, waiting for a teacher's reply
// ---------------------------------------------------------------------------

const CHECKPOINT_SELECT = `
  select s.id, s.body, s.submitted_at, s.feedback, s.reviewed_at,
         p.full_name as student_name, p.email as student_email,
         c.slug as course_slug, c.title as course_name,
         l.slug as lesson_slug, l.title as lesson_title, l.prompt,
         r.full_name as reviewer_name
    from checkpoint_submissions s
    join profiles p on p.id = s.user_id
    join lessons l on l.id = s.lesson_id
    join course_modules cm on cm.id = l.module_id
    join courses c on c.id = cm.course_id
    left join profiles r on r.id = s.reviewed_by`;

adminRouter.get("/checkpoints", async (req, res) => {
  const reviewed = req.query.status === "reviewed";
  const rows = await query(
    reviewed
      ? `${CHECKPOINT_SELECT} where s.reviewed_at is not null order by s.reviewed_at desc limit 100`
      : `${CHECKPOINT_SELECT} where s.reviewed_at is null order by s.submitted_at`,
  );
  res.json(rows);
});

const reviewSchema = z.object({
  feedback: z.string().trim().min(1, "Write a reply before you send it").max(2000),
});

/** Reply to a checkpoint. Replying again replaces the earlier reply. */
adminRouter.put("/checkpoints/:id", async (req: AuthedRequest, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = reviewSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: "Checkpoint not found" });
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid reply" });

  const [row] = await query<{ id: string }>(
    `update checkpoint_submissions
        set feedback = $2, reviewed_by = $3, reviewed_at = now()
      where id = $1
  returning id`,
    [id.data, body.data.feedback, req.user!.id],
  );
  if (!row) return res.status(404).json({ error: "Checkpoint not found" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Contact messages from the website
// ---------------------------------------------------------------------------

const MESSAGE_SELECT = `
  select m.id, m.full_name, m.email, m.phone, m.subject, m.message, m.created_at, m.handled_at
    from contact_messages m`;

adminRouter.get("/messages", async (req, res) => {
  const handled = req.query.status === "handled";
  const rows = await query(
    handled
      ? `${MESSAGE_SELECT} where m.handled_at is not null order by m.handled_at desc limit 100`
      : `${MESSAGE_SELECT} where m.handled_at is null order by m.created_at desc`,
  );
  res.json(rows);
});

const handledSchema = z.object({ handled: z.boolean() });

/** Mark a message as handled (replied to), or reopen it. */
adminRouter.put("/messages/:id", async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = handledSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: "Message not found" });
  if (!body.success) return res.status(400).json({ error: z.prettifyError(body.error) });

  const [row] = await query<{ id: string }>(
    `update contact_messages set handled_at = case when $2 then now() end where id = $1 returning id`,
    [id.data, body.data.handled],
  );
  if (!row) return res.status(404).json({ error: "Message not found" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Members and roles (admins only)
// ---------------------------------------------------------------------------

adminRouter.get("/members", requireAdmin, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const rows = await query(
    `select p.id, p.full_name, p.email, p.phone, p.role, p.created_at,
            (select count(*) from enrollments e where e.user_id = p.id)::int as enrolments
       from profiles p
      where $1 = '' or p.full_name ilike '%' || $1 || '%' or p.email ilike '%' || $1 || '%'
      order by p.created_at desc
      limit 200`,
    [q.replace(/[\\%_]/g, (c) => `\\${c}`)],
  );
  res.json(rows);
});

const roleSchema = z.object({ role: z.enum(["member", "editor", "admin"]) });

adminRouter.put("/members/:id", requireAdmin, async (req: AuthedRequest, res) => {
  const id = idParam.safeParse(req.params.id);
  const body = roleSchema.safeParse(req.body);
  if (!id.success) return res.status(404).json({ error: "Member not found" });
  if (!body.success) return res.status(400).json({ error: "Choose member, editor or admin" });
  // So the last admin can't lock everyone out by accident.
  if (id.data === req.user!.id) return res.status(400).json({ error: "You can’t change your own role." });

  const [row] = await query<{ id: string }>(
    `update profiles set role = $2 where id = $1 returning id`,
    [id.data, body.data.role],
  );
  if (!row) return res.status(404).json({ error: "Member not found" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/** Counts for the overview, plus the latest of what is waiting. */
adminRouter.get("/overview", async (_req, res) => {
  const [counts] = await query<{
    members: number;
    new_members: number;
    enrolments: number;
    checkpoints_waiting: number;
    messages_open: number;
    self_tests: number;
  }>(
    `select (select count(*) from profiles)::int as members,
            (select count(*) from profiles where created_at > now() - interval '30 days')::int as new_members,
            (select count(*) from enrollments)::int as enrolments,
            (select count(*) from checkpoint_submissions where reviewed_at is null)::int as checkpoints_waiting,
            (select count(*) from contact_messages where handled_at is null)::int as messages_open,
            (select count(*) from self_test_attempts)::int as self_tests`,
  );
  const [checkpoints, messages, classes] = await Promise.all([
    query(
      `${CHECKPOINT_SELECT} where s.reviewed_at is null order by s.submitted_at limit 4`,
    ),
    query(`${MESSAGE_SELECT} where m.handled_at is null order by m.created_at desc limit 4`),
    query(
      `select c.slug, c.title as name, c.status,
              (select count(*) from enrollments e where e.course_id = c.id)::int as enrolments,
              -- Finished: every lesson of the class complete.
              (select count(*) from enrollments e
                where e.course_id = c.id
                  and exists (select 1 from course_modules m join lessons l on l.module_id = m.id where m.course_id = c.id)
                  and not exists (
                    select 1 from course_modules m join lessons l on l.module_id = m.id
                     where m.course_id = c.id
                       and not exists (select 1 from lesson_progress lp
                                        where lp.user_id = e.user_id and lp.lesson_id = l.id and lp.completed_at is not null)))::int
                as completed
         from courses c order by c.sort_order, c.title`,
    ),
  ]);
  res.json({ counts, checkpoints, messages, classes });
});
