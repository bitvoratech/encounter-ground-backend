import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../db/supabase.js";
import { query } from "../db/pool.js";

export type Role = "member" | "editor" | "admin";

export type AuthedRequest = Request & {
  user?: { id: string; email?: string; role: Role };
};

type User = NonNullable<AuthedRequest["user"]>;

/**
 * Reads `Authorization: Bearer <token>`. Returns the user, "missing" when no
 * token was sent, or "invalid" when the token was rejected.
 */
async function userFromRequest(req: Request): Promise<User | "missing" | "invalid"> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return "missing";

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return "invalid";

  const rows = await query<{ role: Role }>(
    "select role from profiles where id = $1",
    [data.user.id],
  );
  return {
    id: data.user.id,
    email: data.user.email,
    role: rows[0]?.role ?? "member",
  };
}

/** Verifies the Supabase access token in `Authorization: Bearer <token>`. */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const user = await userFromRequest(req);
  if (user === "missing") return res.status(401).json({ error: "Not signed in" });
  if (user === "invalid")
    return res.status(401).json({ error: "Invalid or expired session" });
  req.user = user;
  next();
}

/**
 * Like requireAuth, but lets anonymous requests through. Sets `req.user` only
 * when a valid token is sent; a missing or expired token is not an error.
 */
export async function optionalAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
) {
  const user = await userFromRequest(req);
  if (typeof user === "object") req.user = user;
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
