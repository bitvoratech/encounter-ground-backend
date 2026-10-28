import { Router, type Response } from "express";
import { z } from "zod";
import { pool, query } from "../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

// Beth-El Institute. The catalogue (classes, modules, lesson outlines, final-check
// questions without answers) is public. Learning — enrolling, progress, checkpoints,
// the final check — is for signed-in members, under /me/courses.

export const coursesRouter = Router();
export const myCoursesRouter = Router();

type LessonKind = "video" | "audio" | "text" | "pdf" | "checkpoint" | "quiz";

/** Lesson kinds a student finishes by pressing "Mark as complete". Checkpoints are
 * completed by submitting one, the final check by passing it. */
const MARKABLE: LessonKind[] = ["video", "audio", "text", "pdf"];

type CourseRow = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  meaning: string | null;
  badge: string | null;
  outcomes: string[];
  price_kobo: number;
};

const COURSE_FIELDS = `c.id, c.slug, c.title as name, c.summary, c.meaning, c.badge, c.outcomes, c.price_kobo`;

async function findCourse(slug: string) {
  const [course] = await query<CourseRow>(
    `select ${COURSE_FIELDS} from courses c where c.slug = $1 and c.status = 'published'`,
    [slug],
  );
  return course;
}

/** Every lesson of a course in order, with its module position. */
async function courseLessons(courseId: string) {
  return query<{
    id: string;
    slug: string;
    title: string;
    kind: LessonKind;
    minutes: number;
    preview: boolean;
    prompt: string | null;
    module_position: number;
  }>(
    `select l.id, l.slug, l.title, l.kind, coalesce(l.duration_seconds, 0) / 60 as minutes,
            l.is_preview as preview, l.prompt, m.position as module_position
       from lessons l join course_modules m on m.id = l.module_id
      where m.course_id = $1
      order by m.position, l.position`,
    [courseId],
  );
}

const publicCourse = ({ id: _id, price_kobo, ...c }: CourseRow) => ({ ...c, free: price_kobo === 0 });

coursesRouter.get("/", async (_req, res) => {
  const rows = await query<CourseRow & { module_count: number; lesson_count: number; minutes: number }>(
    `select ${COURSE_FIELDS},
            (select count(*) from course_modules m where m.course_id = c.id)::int as module_count,
            (select count(*) from lessons l join course_modules m on m.id = l.module_id
              where m.course_id = c.id)::int as lesson_count,
            (select coalesce(sum(l.duration_seconds), 0) / 60 from lessons l
               join course_modules m on m.id = l.module_id where m.course_id = c.id)::int as minutes
       from courses c
      where c.status = 'published'
      order by c.sort_order, c.title`,
  );
  res.json(rows.map(({ module_count, lesson_count, minutes, ...c }) => ({ ...publicCourse(c), module_count, lesson_count, minutes })));
});

coursesRouter.get("/:slug", async (req, res) => {
  const course = await findCourse(req.params.slug);
  if (!course) return res.status(404).json({ error: "Class not found" });

  const [modules, lessons, quiz] = await Promise.all([
    query<{ title: string; summary: string | null; position: number }>(
      `select title, summary, position from course_modules where course_id = $1 order by position`,
      [course.id],
    ),
    courseLessons(course.id),
    query<{ question: string; options: string[] }>(
      `select question, options from course_quiz_questions where course_id = $1 order by position`,
      [course.id],
    ),
  ]);

  res.json({
    ...publicCourse(course),
    modules: modules.map((m) => ({
      title: m.title,
      summary: m.summary,
      lessons: lessons
        .filter((l) => l.module_position === m.position)
        .map(({ id: _id, module_position: _m, ...l }) => l),
    })),
    quiz,
  });
});

// ---------------------------------------------------------------------------
// Signed-in learning: /me/courses
// ---------------------------------------------------------------------------

myCoursesRouter.use(requireAuth);

/** The member's classes: when they enrolled and which lessons they've finished. */
myCoursesRouter.get("/", async (req: AuthedRequest, res) => {
  const rows = await query<{ slug: string; enrolled_at: string; completed: string[] | null }>(
    `select c.slug, e.enrolled_at,
            (select array_agg(l.slug order by m.position, l.position)
               from lesson_progress lp
               join lessons l on l.id = lp.lesson_id
               join course_modules m on m.id = l.module_id
              where lp.user_id = e.user_id and m.course_id = c.id and lp.completed_at is not null)
              as completed
       from enrollments e join courses c on c.id = e.course_id
      where e.user_id = $1
      order by e.enrolled_at`,
    [req.user!.id],
  );
  res.json(rows.map((r) => ({ ...r, completed: r.completed ?? [] })));
});

myCoursesRouter.post("/:slug/enrol", async (req: AuthedRequest, res) => {
  const course = await findCourse(req.params.slug as string);
  if (!course) return res.status(404).json({ error: "Class not found" });
  // Paid classes are enrolled by a verified payment, which isn't built yet.
  if (course.price_kobo > 0)
    return res.status(409).json({ error: "This class needs payment before you can enrol." });

  await query(
    `insert into enrollments (user_id, course_id) values ($1, $2) on conflict (user_id, course_id) do nothing`,
    [req.user!.id, course.id],
  );
  res.status(201).json({ slug: course.slug, enrolled: true });
});

/** A lesson of a class the member is enrolled in, or a 403/404 response. */
async function enrolledLesson(req: AuthedRequest, res: Response) {
  const course = await findCourse(req.params.slug as string);
  if (!course) {
    res.status(404).json({ error: "Class not found" });
    return null;
  }
  const [enrolled] = await query(`select 1 from enrollments where user_id = $1 and course_id = $2`, [
    req.user!.id,
    course.id,
  ]);
  if (!enrolled) {
    res.status(403).json({ error: "Enrol in this class first." });
    return null;
  }
  const lesson = (await courseLessons(course.id)).find((l) => l.slug === req.params.lesson);
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return null;
  }
  return { course, lesson };
}

const markComplete = (userId: string, lessonId: string) =>
  query(
    `insert into lesson_progress (user_id, lesson_id, completed_at) values ($1, $2, now())
     on conflict (user_id, lesson_id) do update set completed_at = coalesce(lesson_progress.completed_at, now())`,
    [userId, lessonId],
  );

const completeSchema = z.object({ done: z.boolean() });

/** Mark a video, audio, reading or study-guide lesson complete (or not). */
myCoursesRouter.put("/:slug/lessons/:lesson/complete", async (req: AuthedRequest, res) => {
  const body = completeSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: z.prettifyError(body.error) });
  const found = await enrolledLesson(req, res);
  if (!found) return;
  if (!MARKABLE.includes(found.lesson.kind))
    return res.status(400).json({ error: "This lesson is completed by submitting it, not marking it." });

  if (body.data.done) await markComplete(req.user!.id, found.lesson.id);
  else
    await query(`update lesson_progress set completed_at = null where user_id = $1 and lesson_id = $2`, [
      req.user!.id,
      found.lesson.id,
    ]);
  res.json({ lesson: found.lesson.slug, done: body.data.done });
});

const checkpointSchema = z.object({ body: z.string().trim().min(20).max(5000) });

/** Submit (or rewrite) a checkpoint reflection for a teacher; completes the lesson. */
myCoursesRouter.post("/:slug/lessons/:lesson/checkpoint", async (req: AuthedRequest, res) => {
  const body = checkpointSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Write at least a couple of sentences (20 characters or more)." });
  const found = await enrolledLesson(req, res);
  if (!found) return;
  if (found.lesson.kind !== "checkpoint") return res.status(400).json({ error: "This lesson isn't a checkpoint." });

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into checkpoint_submissions (user_id, lesson_id, body) values ($1, $2, $3)
       on conflict (user_id, lesson_id) do update
         set body = excluded.body, submitted_at = now(), reviewed_by = null, reviewed_at = null, feedback = null`,
      [req.user!.id, found.lesson.id, body.data.body],
    );
    await client.query(
      `insert into lesson_progress (user_id, lesson_id, completed_at) values ($1, $2, now())
       on conflict (user_id, lesson_id) do update set completed_at = coalesce(lesson_progress.completed_at, now())`,
      [req.user!.id, found.lesson.id],
    );
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  res.status(201).json({ lesson: found.lesson.slug, submitted: true });
});

const quizSchema = z.object({ answers: z.array(z.number().int().min(0)).min(1) });

/** Mark the final check. Passing means every answer right; then the lesson completes. */
myCoursesRouter.post("/:slug/lessons/:lesson/quiz", async (req: AuthedRequest, res) => {
  const body = quizSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: z.prettifyError(body.error) });
  const found = await enrolledLesson(req, res);
  if (!found) return;
  if (found.lesson.kind !== "quiz") return res.status(400).json({ error: "This lesson isn't the final check." });

  const questions = await query<{ answer_index: number; explanation: string | null; options: string[] }>(
    `select answer_index, explanation, options from course_quiz_questions where course_id = $1 order by position`,
    [found.course.id],
  );
  const { answers } = body.data;
  if (answers.length !== questions.length || answers.some((a, i) => a >= questions[i]!.options.length))
    return res.status(400).json({ error: `Answer all ${questions.length} questions.` });

  const results = questions.map((q, i) => ({
    correct: answers[i] === q.answer_index,
    answer: q.answer_index,
    explanation: q.explanation,
  }));
  const score = results.filter((r) => r.correct).length;
  const passed = score === questions.length;

  await query(
    `insert into quiz_attempts (user_id, course_id, answers, score, total, passed) values ($1, $2, $3, $4, $5, $6)`,
    [req.user!.id, found.course.id, answers, score, questions.length, passed],
  );
  if (passed) await markComplete(req.user!.id, found.lesson.id);

  res.status(201).json({ score, total: questions.length, passed, results });
});
