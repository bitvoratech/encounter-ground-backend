import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { query } from "./db/pool.js";
import { meRouter } from "./routes/me.js";
import { booksRouter, eventsRouter } from "./routes/catalog.js";
import { selfTestsRouter } from "./routes/selfTests.js";
import { contactRouter } from "./routes/contact.js";

export const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
// NOTE: the Paystack webhook needs the raw body to verify its signature, so
// mount it here, before express.json(), when payments are built (week 4).
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_req, res) => {
  await query("select 1");
  res.json({ ok: true });
});

app.use("/me", meRouter);
app.use("/books", booksRouter);
app.use("/events", eventsRouter);
app.use("/self-tests", selfTestsRouter);
app.use("/contact", contactRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
};
app.use(errorHandler);
