import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { query } from "./db/pool.js";
import { meRouter } from "./routes/me.js";
import { booksRouter, eventsRouter } from "./routes/catalog.js";
import { selfTestsRouter } from "./routes/selfTests.js";
import { contactRouter } from "./routes/contact.js";
import { coursesRouter, myCoursesRouter } from "./routes/school.js";
import { adminRouter } from "./routes/admin.js";
import { siteContentRouter } from "./routes/siteContent.js";

export const app = express();

app.set("trust proxy", 1);
app.use(helmet());
// Browsers send the Origin header without a trailing slash, so normalise
// FRONTEND_URL (which may hold several comma-separated origins) to match.
const allowedOrigins = env.FRONTEND_URL.split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
// NOTE: the Paystack webhook needs the raw body to verify its signature, so
// mount it here, before express.json(), when payments are built (week 4).
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  await query("select 1");
  res.json({ ok: true });
});

// Before /me, so /me/courses reaches the school router.
app.use("/me/courses", myCoursesRouter);
app.use("/me", meRouter);
app.use("/courses", coursesRouter);
app.use("/books", booksRouter);
app.use("/events", eventsRouter);
app.use("/self-tests", selfTestsRouter);
app.use("/contact", contactRouter);
app.use("/site-content", siteContentRouter);
app.use("/admin", adminRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
};
app.use(errorHandler);

// Vercel runs this file as the serverless entry point and needs the app as the
// default export. Locally, src/index.ts imports it and calls listen().
export default app;
