import type { Collection, CollectionStatus } from "../../shared/types";

/** Lo que se congela al emitir. */
export type CollectionSnapshot = Pick<Collection, "lines" | "client" | "methods" | "includeDelivery" | "deliveryUrl" | "paymentUrl" | "note" | "projectTitle">;

interface Row {
  id: string;
  number: string;
  project_id: string;
  client_id: string;
  issued_at: string;
  currency: Collection["currency"];
  total: number;
  due_date: string | null;
  snapshot: string;
  drive_file_id: string | null;
  voided_at: string | null;
  plan_ids: string | null;
  paid: number;
}

/**
 * Pagado = pagos registrados desde la cuenta, o contra una promesa enlazada desde que se emitió
 * (lo abonado antes ya se descontó del valor de la línea). Una sola suma con OR: cada pago cuenta una vez.
 */
const PAID = `(SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.collection_id = c.id OR (p.created_at >= c.created_at AND p.plan_id IN (SELECT cp.plan_id FROM collection_plans cp WHERE cp.collection_id = c.id)))`;

const SELECT = `SELECT c.id, c.number, c.project_id, c.client_id, c.issued_at, c.currency, c.total, c.due_date, c.snapshot, c.drive_file_id, c.voided_at,
  (SELECT GROUP_CONCAT(cp.plan_id) FROM collection_plans cp WHERE cp.collection_id = c.id) AS plan_ids, ${PAID} AS paid FROM collections c`;

export const collectionStatus = (total: number, paid: number, voided: boolean): CollectionStatus =>
  voided ? "voided" : paid >= total ? "paid" : paid > 0 ? "partial" : "pending";

const toCollection = (r: Row): Collection => {
  const snap = JSON.parse(r.snapshot) as CollectionSnapshot;
  return {
    id: r.id,
    number: r.number,
    projectId: r.project_id,
    clientId: r.client_id,
    issuedAt: r.issued_at,
    currency: r.currency,
    total: r.total,
    dueDate: r.due_date,
    planIds: r.plan_ids ? r.plan_ids.split(",") : [],
    paid: r.paid,
    status: collectionStatus(r.total, r.paid, !!r.voided_at),
    driveFileId: r.drive_file_id,
    ...snap,
  };
};

/** De la más nueva a la más vieja. */
export async function listCollections(db: D1Database, filter: { projectId: string } | { clientId: string }): Promise<Collection[]> {
  const [where, value] = "projectId" in filter ? ["c.project_id", filter.projectId] : ["c.client_id", filter.clientId];
  const { results } = await db.prepare(`${SELECT} WHERE ${where} = ? ORDER BY c.issued_at DESC, c.number DESC`).bind(value).all<Row>();
  return results.map(toCollection);
}

export async function loadCollection(db: D1Database, by: "id" | "number", value: string): Promise<Collection | null> {
  const r = await db.prepare(`${SELECT} WHERE c.${by} = ?`).bind(value).first<Row>();
  return r ? toCollection(r) : null;
}

export async function collectionPaid(db: D1Database, id: string): Promise<number> {
  const r = await db.prepare(`SELECT ${PAID} AS paid FROM collections c WHERE c.id = ?`).bind(id).first<{ paid: number }>();
  return r?.paid ?? 0;
}

/** La cuenta no anulada y sin pagar que ya cobra esta promesa, si la hay. */
export async function openCollectionOfPlan(db: D1Database, planId: string): Promise<string | null> {
  const r = await db
    .prepare(`SELECT c.number FROM collections c JOIN collection_plans l ON l.collection_id = c.id WHERE l.plan_id = ? AND c.voided_at IS NULL AND ${PAID} < c.total LIMIT 1`)
    .bind(planId)
    .first<{ number: string }>();
  return r?.number ?? null;
}

/** ¿Alguna cuenta no anulada enlaza esta promesa? */
export async function planInCollection(db: D1Database, planId: string): Promise<boolean> {
  return !!(await db.prepare("SELECT 1 FROM collection_plans l JOIN collections c ON c.id = l.collection_id WHERE l.plan_id = ? AND c.voided_at IS NULL LIMIT 1").bind(planId).first());
}

/** La primera promesa enlazada sin pagar (por fecha), para un pago registrado desde la cuenta. */
export async function firstOpenPlan(db: D1Database, collectionId: string): Promise<string | null> {
  const r = await db
    .prepare("SELECT pp.id FROM collection_plans cp JOIN payment_plans pp ON pp.id = cp.plan_id WHERE cp.collection_id = ? AND pp.paid_at IS NULL ORDER BY pp.due_date, pp.created_at LIMIT 1")
    .bind(collectionId)
    .first<{ id: string }>();
  return r?.id ?? null;
}
