import { isDate, todayBogota } from "../../shared/dates";
import type { Currency, PhaseStatus, ProjectStatus, Service } from "../../shared/types";
import { logActivity } from "../activity";
import type { Handler } from "../auth/session";
import { error, json, now, readJson } from "../http";
import { listProjects, loadProject } from "../projects/repo";
import { initialPhaseStatuses } from "../quotes/approve";
import { getSettings } from "../settings";

const SERVICES: Service[] = ["web", "marca", "software", "general"];
const STATUSES: ProjectStatus[] = ["active", "paused", "delivered", "cancelled"];
const PHASE_STATUSES: PhaseStatus[] = ["pending", "in_progress", "done"];

interface ProjectInput {
  clientId?: string;
  service?: Service;
  title?: string;
  description?: string;
  status?: ProjectStatus;
  dueDate?: string | null;
  total?: number;
  currency?: Currency;
}

const activityOf = async (db: D1Database, type: string, id: string) =>
  (
    await db
      .prepare("SELECT at, actor, action, detail FROM activity_log WHERE entity_type = ? AND entity_id = ? ORDER BY at DESC, rowid DESC LIMIT 50")
      .bind(type, id)
      .all<{ at: string; actor: string; action: string; detail: string | null }>()
  ).results.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));

export const handleProjects: Handler = async (request, env, session, path) => {
  const db = env.DB;
  const money = session.role === "owner";
  const id = path[1] ? decodeURIComponent(path[1]) : null;
  const sub = path[2] ?? null;

  if (request.method === "GET" && !id) {
    const url = new URL(request.url);
    const s = url.searchParams.get("status");
    const statuses = s === "all" ? "all" : s && STATUSES.includes(s as ProjectStatus) ? [s as ProjectStatus] : undefined;
    return json({ projects: await listProjects(db, { clientId: url.searchParams.get("clientId"), statuses }, money) });
  }

  if (request.method === "POST" && !id) {
    const body = await readJson<ProjectInput>(request);
    if (body instanceof Response) return body;
    if (!money && (body.total !== undefined || body.currency !== undefined)) return error(403, "forbidden");
    const client = body.clientId ? await db.prepare("SELECT id FROM clients WHERE id = ?").bind(body.clientId).first() : null;
    if (!client) return error(400, "invalid_client");
    if (!SERVICES.includes(body.service as Service)) return error(400, "invalid_service");
    const title = body.title?.trim();
    if (!title) return error(400, "title_required");
    if (body.dueDate != null && !isDate(body.dueDate)) return error(400, "invalid_date");
    if (body.total !== undefined && (!Number.isInteger(body.total) || body.total < 0)) return error(400, "invalid_total");
    const template = (await getSettings(db)).phaseTemplates[body.service!];
    const statuses = initialPhaseStatuses(template, false);
    const pid = crypto.randomUUID();
    const t = now();
    await db.batch([
      db
        .prepare("INSERT INTO projects (id, client_id, quote_id, service, title, description, status, start_date, due_date, total, currency, advance_percent, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, ?, ?)")
        .bind(pid, body.clientId, body.service, title, body.description?.trim() ?? "", todayBogota(), body.dueDate ?? null, body.total ?? null, body.total !== undefined ? body.currency ?? "COP" : null, t, t),
      ...template.map((name, i) =>
        db.prepare("INSERT INTO phases (id, project_id, parent_id, position, name, status, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)").bind(crypto.randomUUID(), pid, i + 1, name, statuses[i], t),
      ),
      logActivity(db, session.email, "project", pid, "create", { title }),
    ]);
    return json({ project: await loadProject(db, pid, money) }, 201);
  }

  if (!id) return error(405, "method_not_allowed");
  const project = await loadProject(db, id, true);
  if (!project) return error(404, "not_found");

  if (request.method === "GET" && !sub) {
    return json({ project: await loadProject(db, id, money), activity: await activityOf(db, "project", id) });
  }

  if (request.method === "PATCH" && !sub) {
    const body = await readJson<ProjectInput>(request);
    if (body instanceof Response) return body;
    if (!money && (body.total !== undefined || body.currency !== undefined)) return error(403, "forbidden");
    if (body.dueDate != null && !isDate(body.dueDate)) return error(400, "invalid_date");
    if (body.status !== undefined && !STATUSES.includes(body.status)) return error(400, "invalid_status");
    if (body.total !== undefined && (!Number.isInteger(body.total) || body.total < 0)) return error(400, "invalid_total");
    const title = body.title !== undefined ? body.title.trim() : project.title;
    if (!title) return error(400, "title_required");
    const next = {
      title,
      description: body.description !== undefined ? body.description.trim() : project.description,
      status: body.status ?? project.status,
      dueDate: body.dueDate !== undefined ? body.dueDate : project.dueDate,
      total: body.total !== undefined ? body.total : project.total,
      currency: body.currency ?? project.currency ?? (body.total !== undefined ? "COP" : null),
    };
    await db.batch([
      db
        .prepare("UPDATE projects SET title = ?, description = ?, status = ?, due_date = ?, total = ?, currency = ?, updated_at = ? WHERE id = ?")
        .bind(next.title, next.description, next.status, next.dueDate, next.total, next.currency, now(), id),
      logActivity(db, session.email, "project", id, "update", { fields: Object.keys(body) }),
    ]);
    return json({ project: await loadProject(db, id, money) });
  }

  if (request.method === "POST" && sub === "phases") {
    const body = await readJson<{ name?: string; parentId?: string }>(request);
    if (body instanceof Response) return body;
    let name = body.name?.trim() ?? "";
    let position: number;
    if (body.parentId) {
      const parent = project.phases.find((p) => p.id === body.parentId && !p.parentId);
      if (!parent) return error(400, "invalid_parent");
      const siblings = project.phases.filter((p) => p.parentId === parent.id);
      name ||= `Ronda ${siblings.length + 1}`;
      position = Math.max(0, ...siblings.map((p) => p.position)) + 1;
    } else {
      if (!name) return error(400, "name_required");
      position = Math.max(0, ...project.phases.filter((p) => !p.parentId).map((p) => p.position)) + 1;
    }
    const phaseId = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO phases (id, project_id, parent_id, position, name, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)").bind(phaseId, id, body.parentId ?? null, position, name, now()),
      logActivity(db, session.email, "project", id, "add_phase", { name }),
    ]);
    return json({ project: await loadProject(db, id, money) }, 201);
  }

  return error(405, "method_not_allowed");
};

interface PhaseInput {
  status?: PhaseStatus;
  dueDate?: string | null;
  clientNote?: string | null;
  name?: string;
}

export const handlePhases: Handler = async (request, env, session, path) => {
  const db = env.DB;
  const id = path[1] ? decodeURIComponent(path[1]) : null;
  if (!id) return error(404, "not_found");
  const row = await db.prepare("SELECT id, project_id, parent_id, position, name, status, due_date, client_note FROM phases WHERE id = ?").bind(id).first<{
    id: string;
    project_id: string;
    parent_id: string | null;
    position: number;
    name: string;
    status: PhaseStatus;
    due_date: string | null;
    client_note: string | null;
  }>();
  if (!row) return error(404, "not_found");
  const money = session.role === "owner";

  if (request.method === "DELETE") {
    if (!money) return error(403, "forbidden");
    if (!row.parent_id) return error(400, "only_rounds");
    await db.batch([db.prepare("DELETE FROM phases WHERE id = ?").bind(id), logActivity(db, session.email, "project", row.project_id, "delete_phase", { name: row.name })]);
    return json({ project: await loadProject(db, row.project_id, money) });
  }

  if (request.method !== "PATCH") return error(405, "method_not_allowed");
  const body = await readJson<PhaseInput>(request);
  if (body instanceof Response) return body;
  if (body.status !== undefined && !PHASE_STATUSES.includes(body.status)) return error(400, "invalid_status");
  if (body.dueDate != null && !isDate(body.dueDate)) return error(400, "invalid_date");
  const name = body.name !== undefined ? body.name.trim() : row.name;
  if (!name) return error(400, "name_required");
  const status = body.status ?? row.status;
  const t = now();
  const stmts = [
    db
      .prepare("UPDATE phases SET name = ?, status = ?, due_date = ?, client_note = ?, done_at = CASE WHEN ? = 'done' THEN COALESCE(done_at, ?) ELSE NULL END WHERE id = ?")
      .bind(
        name,
        status,
        body.dueDate !== undefined ? body.dueDate : row.due_date,
        body.clientNote !== undefined ? body.clientNote?.trim() || null : row.client_note,
        status,
        t,
        id,
      ),
  ];
  if (!row.parent_id && row.status === "in_progress" && status === "done") {
    stmts.push(
      db
        .prepare(
          "UPDATE phases SET status = 'in_progress' WHERE id = (SELECT id FROM phases WHERE project_id = ? AND parent_id IS NULL AND position > ? AND status = 'pending' ORDER BY position LIMIT 1)",
        )
        .bind(row.project_id, row.position),
    );
  }
  stmts.push(logActivity(db, session.email, "project", row.project_id, "phase", { name, status }));
  await db.batch(stmts);
  await db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(t, row.project_id).run();
  return json({ project: await loadProject(db, row.project_id, money) });
};
