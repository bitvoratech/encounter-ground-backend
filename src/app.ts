import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { query } from "./db/poll";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
// NOTE: the Paystack webhook route will need the raw body, so it gets mounted
// before this JSON parser when we build payments.
app.use(express.json());

app.get("/health", async (_req, res) => {
  await query("select 1");
  res.json({ ok: true });
});
