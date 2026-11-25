import type { Currency, Phase, PhaseStatus, Project, ProjectStatus, Service } from "../../shared/types";

interface ProjectRow {
  id: string;
  client_id: string;
  client_name: string;
  quote_id: string | null;
  service: Service;
  title: string;
  description: string;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  total: number | null;
  currency: Currency | null;
  advance_percent: number | null;
  delivery_url: string | null;
  delivery_released: number;
  created_at: string;
}

interface PhaseRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  position: number;
  name: string;
  status: PhaseStatus;
  due_date: string | null;
  client_note: string | null;
  done_at: string | null;
}

const SELECT = `SELECT p.id, p.client_id, c.name AS client_name, p.quote_id, p.service, p.title, p.description, p.status, p.start_date, p.due_date, p.total, p.currency, p.advance_percent, p.delivery_url, p.delivery_released, p.created_at FROM projects p JOIN clients c ON c.id = p.client_id`;

const toPhase = (r: PhaseRow): Phase => ({
  id: r.id,
  projectId: r.project_id,
  parentId: r.parent_id,
  position: r.position,
  name: r.name,
  status: r.status,
  dueDate: r.due_date,
  clientNote: r.client_note,
  doneAt: r.done_at,
});

/** Avance = fases de primer nivel hechas / fases de primer nivel. Las rondas no cuentan. */
export function progressOf(phases: Phase[]): number {
  const top = phases.filter((p) => !p.parentId);
  return top.length ? Math.round((100 * top.filter((p) => p.status === "done").length) / top.length) : 0;
}

function toProject(r: ProjectRow, phases: Phase[], includeMoney: boolean): Project {
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    quoteId: r.quote_id,
    service: r.service,
    title: r.title,
    description: r.description,
    status: r.status,
    startDate: r.start_date,
    dueDate: r.due_date,
    total: includeMoney ? r.total : null,
    currency: includeMoney ? r.currency : null,
    advancePercent: includeMoney ? r.advance_percent : null,
    progress: progressOf(phases),
    phases,
    deliveryUrl: includeMoney ? r.delivery_url : null,
    deliveryReleased: r.delivery_released === 1,
    createdAt: r.created_at,
  };
}

async function withPhases(db: D1Database, rows: ProjectRow[], includeMoney: boolean): Promise<Project[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const { results } = await db
    .prepare(`SELECT id, project_id, parent_id, position, name, status, due_date, client_note, done_at FROM phases WHERE project_id IN (${ids.map(() => "?").join(",")}) ORDER BY position, created_at`)
    .bind(...ids)
    .all<PhaseRow>();
  return rows.map((r) => toProject(r, results.filter((p) => p.project_id === r.id).map(toPhase), includeMoney));
}

export async function loadProject(db: D1Database, id: string, includeMoney: boolean): Promise<Project | null> {
  const row = await db.prepare(`${SELECT} WHERE p.id = ?`).bind(id).first<ProjectRow>();
  return row ? (await withPhases(db, [row], includeMoney))[0] : null;
}

export async function listProjects(
  db: D1Database,
  filter: { clientId?: string | null; statuses?: ProjectStatus[] | "all" },
  includeMoney: boolean,
): Promise<Project[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.clientId) {
    where.push("p.client_id = ?");
    args.push(filter.clientId);
  }
  const statuses = filter.statuses ?? ["active", "paused"];
  if (statuses !== "all") {
    where.push(`p.status IN (${statuses.map(() => "?").join(",")})`);
    args.push(...statuses);
  }
  const { results } = await db
    .prepare(`${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p.due_date IS NULL, p.due_date, p.created_at DESC`)
    .bind(...args)
    .all<ProjectRow>();
  return withPhases(db, results, includeMoney);
}
