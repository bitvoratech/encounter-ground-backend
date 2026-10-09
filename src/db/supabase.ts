import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Service-role client: used only on the server to verify sessions and to
// manage storage. It bypasses row-level security, so never send it to clients.
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
