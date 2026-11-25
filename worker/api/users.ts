import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { error, json, now, readJson } from "../http";

export const handleUsers: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const target = path[1] ? decodeURIComponent(path[1]).trim().toLowerCase() : null;

  if (request.method === "GET" && !target) {
    const { results } = await env.DB.prepare("SELECT email, role, name FROM users ORDER BY role DESC, email").all();
    return json({ users: results });
  }

  if (request.method === "POST" && !target) {
    const body = await readJson<{ email?: string; name?: string }>(request);
    if (body instanceof Response) return body;
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) return error(400, "invalid_email");
    const exists = await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
    if (exists) return error(409, "already_exists");
    const name = body.name?.trim() || null;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (email, role, name, created_at) VALUES (?, 'collaborator', ?, ?)").bind(email, name, now()),
      logActivity(env.DB, session.email, "user", email, "create", { role: "collaborator" }),
    ]);
    return json({ user: { email, role: "collaborator", name } }, 201);
  }

  if (request.method === "DELETE" && target) {
    const row = await env.DB.prepare("SELECT role FROM users WHERE email = ?").bind(target).first<{ role: string }>();
    const owner = env.OWNER_EMAIL?.trim().toLowerCase();
    if (row?.role === "owner" || target === owner) return error(400, "cannot_remove_owner");
    if (!row) return error(404, "not_found");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM users WHERE email = ?").bind(target),
      logActivity(env.DB, session.email, "user", target, "delete"),
    ]);
    return json({ ok: true });
  }

  return error(405, "method_not_allowed");
};
