import type { ChangeRequest } from "../../shared/types";

interface Row {
  id: string;
  project_id: string;
  kind: ChangeRequest["kind"];
  description: string;
  amount: number | null;
  status: ChangeRequest["status"];
  requested_by: ChangeRequest["requestedBy"];
  decided_by: ChangeRequest["decidedBy"];
  approved_name: string | null;
  client_comment: string | null;
  created_at: string;
  decided_at: string | null;
}

export const CHANGE_COLUMNS = "id, project_id, kind, description, amount, status, requested_by, decided_by, approved_name, client_comment, created_at, decided_at";

export const toChange = (r: Row): ChangeRequest => ({
  id: r.id,
  projectId: r.project_id,
  kind: r.kind,
  description: r.description,
  amount: r.amount,
  status: r.status,
  requestedBy: r.requested_by,
  decidedBy: r.decided_by,
  approvedName: r.approved_name,
  clientComment: r.client_comment,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
});

export async function listChanges(db: D1Database, projectId: string): Promise<ChangeRequest[]> {
  const { results } = await db.prepare(`SELECT ${CHANGE_COLUMNS} FROM change_requests WHERE project_id = ? ORDER BY created_at DESC, rowid DESC`).bind(projectId).all<Row>();
  return results.map(toChange);
}

export async function loadChange(db: D1Database, id: string): Promise<ChangeRequest | null> {
  const row = await db.prepare(`SELECT ${CHANGE_COLUMNS} FROM change_requests WHERE id = ?`).bind(id).first<Row>();
  return row ? toChange(row) : null;
}

export async function approvedChangesTotal(db: D1Database, projectId: string): Promise<number> {
  const row = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM change_requests WHERE project_id = ? AND kind = 'cost' AND status = 'approved'").bind(projectId).first<{ t: number }>();
  return row?.t ?? 0;
}

/**
 * Decide un cambio de costo pendiente. Condicionado a status = 'pending' para que una segunda
 * aprobación (doble clic, pestaña vieja) no cuente dos veces: devuelve false si ya estaba decidido.
 */
export async function decideCostChange(
  db: D1Database,
  change: ChangeRequest,
  input: { approve: boolean; by: "client" | "owner"; name?: string | null; comment?: string | null; currency: string; at: string },
): Promise<boolean> {
  const snapshot = input.approve ? JSON.stringify({ description: change.description, amount: change.amount, currency: input.currency, approvedName: input.name ?? null, comment: input.comment ?? null, at: input.at }) : null;
  const r = await db
    .prepare("UPDATE change_requests SET status = ?, decided_by = ?, approved_name = ?, client_comment = ?, snapshot = ?, decided_at = ? WHERE id = ? AND kind = 'cost' AND status = 'pending'")
    .bind(input.approve ? "approved" : "rejected", input.by, input.name ?? null, input.comment ?? null, snapshot, input.at, change.id)
    .run();
  return (r.meta.changes ?? 0) > 0;
}
