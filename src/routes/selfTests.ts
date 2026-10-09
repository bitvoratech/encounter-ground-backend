import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { optionalAuth, type AuthedRequest } from "../middleware/auth.js";

// Self-tests (7 Mountains, Fivefold). Questions are public but served without
// their category; the API scores a submission and returns the breakdown.
export const selfTestsRouter = Router();

type Test = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  intro: string | null;
  scale: string[];
};

const TEST_FIELDS = "id, slug, title, summary, intro, scale";

async function findTest(slug: string) {
  const [test] = await query<Test>(
    `select ${TEST_FIELDS} from self_tests where slug = $1 and status = 'published'`,
    [slug],
  );
  return test;
}

selfTestsRouter.get("/", async (_req, res) => {
  const rows = await query(
    `select t.slug, t.title, t.summary,
            (select count(*) from self_test_questions q where q.test_id = t.id)::int as question_count
       from self_tests t
      where t.status = 'published'
      order by t.position, t.title`,
  );
  res.json(rows);
});

selfTestsRouter.get("/:slug", async (req, res) => {
  const test = await findTest(req.params.slug);
  if (!test) return res.status(404).json({ error: "Self-test not found" });

  const questions = await query(
    `select id, prompt from self_test_questions where test_id = $1 order by position`,
    [test.id],
  );
  const { id: _id, ...rest } = test;
  res.json({ ...rest, questions });
});

const submitSchema = z.object({
  // { "<question id>": rating }, rating is 1..scale length (checked below)
  answers: z.record(z.uuid(), z.number().int().min(1)),
});

selfTestsRouter.post("/:slug/attempts", optionalAuth, async (req: AuthedRequest, res) => {
  const test = await findTest(req.params.slug as string);
  if (!test) return res.status(404).json({ error: "Self-test not found" });

  const body = submitSchema.safeParse(req.body);
  if (!body.success)
    return res.status(400).json({ error: z.prettifyError(body.error) });

  const questions = await query<{ id: string; category_id: string }>(
    `select id, category_id from self_test_questions where test_id = $1`,
    [test.id],
  );
  const { answers } = body.data;
  const top = test.scale.length;
  const missing = questions.filter((q) => !(q.id in answers));
  if (missing.length)
    return res.status(400).json({ error: `Please answer all ${questions.length} statements.` });
  if (Object.keys(answers).length !== questions.length)
    return res.status(400).json({ error: "Answers do not match this self-test." });
  if (Object.values(answers).some((v) => v > top))
    return res.status(400).json({ error: `Ratings must be between 1 and ${top}.` });

  const categories = await query<{
    id: string;
    key: string;
    name: string;
    description: string | null;
  }>(
    `select id, key, name, description from self_test_categories
      where test_id = $1 order by position`,
    [test.id],
  );

  const scores = categories
    .map((c) => {
      const mine = questions.filter((q) => q.category_id === c.id);
      const score = mine.reduce((sum, q) => sum + answers[q.id]!, 0);
      const max = mine.length * top;
      return {
        key: c.key,
        name: c.name,
        description: c.description,
        score,
        max,
        percent: max ? Math.round((score / max) * 100) : 0,
      };
    })
    .sort((a, b) => b.percent - a.percent);

  const [attempt] = await query<{ id: string; created_at: string }>(
    `insert into self_test_attempts (test_id, user_id, answers, scores)
     values ($1, $2, $3, $4)
     returning id, created_at`,
    [test.id, req.user?.id ?? null, JSON.stringify(answers), JSON.stringify(scores)],
  );

  res.status(201).json({ ...attempt, test: test.slug, scores });
});
