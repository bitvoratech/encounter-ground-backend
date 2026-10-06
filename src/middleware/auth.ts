import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../db/supabase";
import { query } from "../db/poll";

export type AuthedRequest = Request & {
  user?: { id: string; email?: string; role: string };
};

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Not signed in" });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user)
    return res.status(401).json({ error: "Invalid session" });

  const rows = await query<{ role: string }>(
    "select role from profiles where id = $1",
    [data.user.id],
  );
  req.user = {
    id: data.user.id,
    email: data.user.email,
    role: rows[0]?.role ?? "student",
  };
  next();
}

export function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  if (req.user?.role !== "admin")
    return res.status(403).json({ error: "Forbidden" });
  next();
}
