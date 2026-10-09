import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  FRONTEND_URL: z.url(),
  // Postgres connection string from Supabase (Project Settings → Database).
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  // Server-only. Never expose this key to the browser.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Empty until the merchant account is approved; payments run in test mode.
  PAYSTACK_SECRET_KEY: z.string().default(""),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
