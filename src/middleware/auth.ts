import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../db/supabase.js";
import { query } from "../db/pool.js";

export type Role = "member" | "editor" | "admin";

export type AuthedRequest = Request & {
  user?: { id: string; email?: string; role: Role };
};

/** Verifies the Supabase access token in `Authorization: Bearer <token>`. */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Not signed in" });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user)
    return res.status(401).json({ error: "Invalid or expired session" });

  const rows = await query<{ role: Role }>(
    "select role from profiles where id = $1",
    [data.user.id],
  );
  req.user = {
    id: data.user.id,
    email: data.user.email,
    role: rows[0]?.role ?? "member",
  };
  next();
}

/** Allows only the listed roles. Use after requireAuth. */
export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

export const requireAdmin = requireRole("admin");
export const requireStaff = requireRole("admin", "editor");
