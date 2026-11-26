import type { JWTVerifyGetKey } from "jose";
import type { Role } from "../../shared/types";
import type { Env } from "../env";
import { error, now } from "../http";
import { verifyAccessJwt } from "./access";

export type Session = { email: string; role: Role };

async function sessionFor(email: string, env: Env): Promise<Session | Response> {
  const owner = env.OWNER_EMAIL?.trim().toLowerCase();
  if (owner && email === owner) {
    await env.DB.prepare("INSERT OR REPLACE INTO users (email, role, name, created_at) VALUES (?, 'owner', (SELECT name FROM users WHERE email = ?), COALESCE((SELECT created_at FROM users WHERE email = ?), ?))")
      .bind(email, email, email, now())
      .run();
    return { email, role: "owner" };
  }
  const row = await env.DB.prepare("SELECT role FROM users WHERE email = ?").bind(email).first<{ role: Role }>();
  if (!row) return error(403, "not_allowed");
  return { email, role: row.role };
}

export async function authenticate(request: Request, env: Env, jwks?: JWTVerifyGetKey): Promise<Session | Response> {
  if (!env.ACCESS_AUD) {
    if (env.DEV_AUTH_EMAIL) return sessionFor(env.DEV_AUTH_EMAIL.trim().toLowerCase(), env);
    return error(503, "access_not_configured");
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return error(401, "unauthenticated");
  const identity = await verifyAccessJwt(token, env, jwks);
  if (!identity) return error(401, "unauthenticated");
  return sessionFor(identity.email, env);
}

const RANK: Record<Role, number> = { collaborator: 1, owner: 2 };

export function requireRole(session: Session, role: Role): Response | null {
  return RANK[session.role] >= RANK[role] ? null : error(403, "forbidden");
}

/** `ctx` lo pasa el router (para trabajo después de responder, como las carpetas de Drive); en pruebas puede faltar. */
export type Handler = (request: Request, env: Env, session: Session, path: string[], ctx?: ExecutionContext) => Promise<Response>;
