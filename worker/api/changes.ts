import type { Currency } from "../../shared/types";
import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { decideCostChange, listChanges, loadChange } from "../changes/repo";
import { error, json, now, readJson } from "../http";

const validAmount = (v: unknown): v is number => Number.isInteger(v) && v !== 0;

async function currencyOf(db: D1Database, projectId: string): Promise<Currency> {
  return (await db.prepare("SELECT currency FROM projects WHERE id = ?").bind(projectId).first<{ currency: Currency | null }>())?.currency ?? "COP";
}

/** /api/admin/projects/:id/changes */
export const handleProjectChanges: Handler = async (request, env, session, path) => {
  const db = env.DB;
  const projectId = decodeURIComponent(path[1]);
  const project = await db.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first();
  if (!project) return error(404, "not_found");
  if (request.method === "GET") {
    const all = await listChanges(db, projectId);
    return json({ changes: session.role === "owner" ? all : all.filter((c) => c.kind === "adjustment") });
  }
  if (request.method !== "POST") return error(405, "method_not_allowed");
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const body = await readJson<{ description?: string; amount?: number }>(request);
  if (body instanceof Response) return body;
  const description = body.description?.trim();
  if (!description) return error(400, "description_required");
  if (!validAmount(body.amount)) return error(400, "invalid_amount");
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO change_requests (id, project_id, kind, description, amount, status, requested_by, created_at) VALUES (?, ?, 'cost', ?, ?, 'pending', 'owner', ?)").bind(id, projectId, description, body.amount, now()),
    logActivity(db, session.email, "project", projectId, "change_created", { changeId: id, description, amount: body.amount }),
  ]);
  return json({ change: await loadChange(db, id) }, 201);
};

/** /api/admin/changes/:id/(approve|reject|resolve|convert) y DELETE /api/admin/changes/:id */
export const handleChanges: Handler = async (request, env, session, path) => {
  const db = env.DB;
  const id = path[1] ? decodeURIComponent(path[1]) : "";
  const action = path[2] ?? null;
  const change = await loadChange(db, id);
  if (!change) return error(404, "not_found");
  const owner = session.role === "owner";
  if (change.kind === "cost" && !owner) return error(403, "forbidden");

  if (request.method === "DELETE" && !action) {
    if (!owner) return error(403, "forbidden");
    if (change.kind !== "cost" || change.status !== "pending") return error(409, "not_deletable");
    await db.batch([db.prepare("DELETE FROM change_requests WHERE id = ?").bind(id), logActivity(db, session.email, "project", change.projectId, "change_deleted", { description: change.description })]);
    return json({ ok: true });
  }
  if (request.method !== "POST") return error(405, "method_not_allowed");
  const body = await readJson<{ note?: string; amount?: number; description?: string }>(request);
  if (body instanceof Response) return body;
  const t = now();

  if (action === "approve" || action === "reject") {
    if (change.kind !== "cost") return error(400, "not_a_cost_change");
    const ok = await decideCostChange(db, change, { approve: action === "approve", by: "owner", comment: body.note?.trim() || null, currency: await currencyOf(db, change.projectId), at: t });
    if (!ok) return error(409, "already_decided");
    await logActivity(db, session.email, "project", change.projectId, action === "approve" ? "change_approved" : "change_rejected", { changeId: id, amount: change.amount, by: "owner", note: body.note ?? null }).run();
    return json({ change: await loadChange(db, id) });
  }

  if (action === "resolve") {
    if (change.kind !== "adjustment") return error(400, "not_an_adjustment");
    const r = await db.prepare("UPDATE change_requests SET status = 'resolved', decided_by = 'owner', decided_at = ? WHERE id = ? AND status = 'pending'").bind(t, id).run();
    if (!r.meta.changes) return error(409, "already_decided");
    await logActivity(db, session.email, "project", change.projectId, "adjustment_resolved", { changeId: id }).run();
    return json({ change: await loadChange(db, id) });
  }

  if (action === "convert") {
    if (!owner) return error(403, "forbidden");
    if (change.kind !== "adjustment" || change.status !== "pending") return error(409, "already_decided");
    if (!validAmount(body.amount)) return error(400, "invalid_amount");
    const costId = crypto.randomUUID();
    const description = body.description?.trim() || change.description;
    await db.batch([
      db.prepare("UPDATE change_requests SET status = 'converted', decided_by = 'owner', decided_at = ? WHERE id = ? AND status = 'pending'").bind(t, id),
      db
        .prepare("INSERT INTO change_requests (id, project_id, kind, description, amount, status, requested_by, source_id, created_at) VALUES (?, ?, 'cost', ?, ?, 'pending', 'owner', ?, ?)")
        .bind(costId, change.projectId, description, body.amount, id, t),
      logActivity(db, session.email, "project", change.projectId, "change_created", { changeId: costId, description, amount: body.amount, fromAdjustment: id }),
    ]);
    return json({ change: await loadChange(db, costId) }, 201);
  }

  return error(404, "not_found");
};
