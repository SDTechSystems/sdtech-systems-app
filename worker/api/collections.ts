import { isDate } from "../../shared/dates";
import type { CollectionLineInput, CollectionLineSource, Currency, InvoiceLine } from "../../shared/types";
import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { priceLines } from "../collections/lines";
import { renameLater, voidedName } from "../google/drive";
import { listCollections, loadCollection, openCollectionOfPlan, type CollectionSnapshot } from "../collections/repo";
import { error, json, now, readJson } from "../http";
import { loadPayments } from "../payments/repo";
import { formatNumber, getSettings, nextNumber } from "../settings";

/** Trabajo nuevo: lo único que «Sumar al total del proyecto» agrega. */
const NEW_WORK: CollectionLineSource[] = ["catalog", "free"];

interface CollectionInput {
  lines?: CollectionLineInput[];
  dueDate?: string | null;
  includeDelivery?: boolean;
  paymentUrl?: string | null;
  note?: string | null;
  addToTotal?: boolean;
  setTotal?: boolean;
}

const sum = (lines: InvoiceLine[]) => lines.reduce((s, l) => s + l.total, 0);

/** /api/admin/projects/:id/collections */
export const handleProjectCollections: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const db = env.DB;
  const projectId = decodeURIComponent(path[1]);
  const project = await db.prepare("SELECT id, client_id, title, total, currency, delivery_url FROM projects WHERE id = ?").bind(projectId).first<{
    id: string;
    client_id: string;
    title: string;
    total: number | null;
    currency: Currency | null;
    delivery_url: string | null;
  }>();
  if (!project) return error(404, "not_found");
  if (request.method === "GET") return json({ collections: await listCollections(db, { projectId }) });
  if (request.method !== "POST") return error(405, "method_not_allowed");

  const body = await readJson<CollectionInput>(request);
  if (body instanceof Response) return body;
  // Una promesa se cobra por lo que le falta, y en una sola cuenta abierta a la vez.
  const priced = await priceLines(db, projectId, body.lines, async (plan) => {
    const open = plan.paid_at ? 0 : plan.amount - plan.paid;
    if (open <= 0) return error(400, "invalid_plan");
    if (await openCollectionOfPlan(db, plan.id)) return error(400, "plan_already_billed");
    return open;
  });
  if (priced instanceof Response) return priced;
  const planIds = priced.flatMap((p) => (p.planId ? [p.planId] : []));
  const lines = priced.map((p) => p.line);
  const nonPlan = priced.filter((p) => !p.planId).map((p) => p.line);
  const newWork = priced.filter((p) => NEW_WORK.includes(p.source)).map((p) => p.line);

  const dueDate = body.dueDate || null;
  if (dueDate !== null && !isDate(dueDate)) return error(400, "invalid_date");
  const paymentUrl = typeof body.paymentUrl === "string" ? body.paymentUrl.trim() || null : null;
  if (paymentUrl && !/^https:\/\/\S+$/.test(paymentUrl)) return error(400, "invalid_url");
  const includeDelivery = body.includeDelivery === true;
  if (includeDelivery && !project.delivery_url) return error(400, "delivery_url_required");
  const total = sum(lines);
  if (total <= 0) return error(400, "invalid_amount");

  // «Tiene total» es lo mismo que en el panel: base más cambios aprobados mayor que 0. Sin total, «Usar este valor como
  // total» pone la base; con total, «Sumar al total» le suma el trabajo nuevo (una base vacía cuenta como 0).
  const hasTotal = (await loadPayments(db, projectId)).total > 0;
  const before = project.total;
  const adds = hasTotal && body.addToTotal === true && sum(newWork) > 0;
  const after = !hasTotal ? (body.setTotal === true ? total : before) : adds ? (before ?? 0) + sum(newWork) : before;
  const totalDelta = after === before ? 0 : Math.max(0, (after ?? 0) - (before ?? 0));
  const fromNull = before === null && after !== null;

  const settings = await getSettings(db);
  const currency: Currency = project.currency ?? "COP";
  const client = await db.prepare("SELECT name, company, document, city, phone, email FROM clients WHERE id = ?").bind(project.client_id).first<CollectionSnapshot["client"]>();
  const snapshot: CollectionSnapshot = {
    lines,
    client: client!,
    methods:
      currency === "USD"
        ? [{ name: "Pago", detail: settings.payment.usdText }]
        : settings.payment.methods.filter((m) => m.active && m.showOnDocs).map((m) => ({ name: m.name, detail: m.detail })),
    includeDelivery,
    deliveryUrl: includeDelivery ? project.delivery_url : null,
    paymentUrl,
    note: typeof body.note === "string" ? body.note.trim() || null : null,
    projectTitle: project.title,
    // Lo sumado al total sale en el recibo como línea propia.
    addedLines: adds ? newWork : [],
  };

  const id = crypto.randomUUID();
  const number = formatNumber("CC", await nextNumber(db, "collection"));
  const t = now();
  const stmts: D1PreparedStatement[] = [];
  // Promesa propia solo por las líneas sueltas, para que entre a Pendientes y al calendario.
  const ownAmount = dueDate ? sum(nonPlan) : 0;
  const ownPlanId = ownAmount > 0 ? crypto.randomUUID() : null;
  if (ownPlanId) {
    stmts.push(db.prepare("INSERT INTO payment_plans (id, project_id, label, amount, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(ownPlanId, projectId, number, ownAmount, dueDate, t));
    planIds.push(ownPlanId);
  }
  stmts.push(
    db
      .prepare(
        "INSERT INTO collections (id, number, project_id, client_id, issued_at, currency, total, due_date, own_plan_id, snapshot, created_at, total_delta, total_from_null) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(id, number, projectId, project.client_id, t, currency, total, dueDate, ownPlanId, JSON.stringify(snapshot), t, totalDelta, fromNull ? 1 : 0),
    ...planIds.map((planId) => db.prepare("INSERT INTO collection_plans (collection_id, plan_id) VALUES (?, ?)").bind(id, planId)),
    logActivity(db, session.email, "project", projectId, "collection_issued", { number, total }),
  );

  if (after !== before) {
    stmts.push(
      db.prepare("UPDATE projects SET total = ?, currency = ?, updated_at = ? WHERE id = ?").bind(after, currency, t, projectId),
      logActivity(db, session.email, "project", projectId, "collection_total", { number, before, after }),
    );
  }
  await db.batch(stmts);
  return json({ collection: await loadCollection(db, "id", id) }, 201);
};

/** GET /api/admin/collections/:id y POST /api/admin/collections/:id/void */
export const handleCollections: Handler = async (request, env, session, path, ctx) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const db = env.DB;
  const id = path[1] ? decodeURIComponent(path[1]) : "";
  const c = await loadCollection(db, "id", id);
  if (!c) return error(404, "not_found");
  if (request.method === "GET" && !path[2]) return json({ collection: c });
  if (request.method !== "POST" || path[2] !== "void") return error(405, "method_not_allowed");
  const body = await readJson<{ revertTotal?: boolean }>(request);
  if (body instanceof Response) return body;
  if (c.status === "voided") return json({ collection: c });
  const own = await db
    .prepare("SELECT pp.id, pp.paid_at, EXISTS (SELECT 1 FROM payments WHERE plan_id = pp.id) AS has_payments FROM collections c JOIN payment_plans pp ON pp.id = c.own_plan_id WHERE c.id = ?")
    .bind(id)
    .first<{ id: string; paid_at: string | null; has_payments: number }>();
  // La promesa propia se cancela solo si no tiene pagos ni se marcó pagada a mano.
  const unpaid = !!own && !own.paid_at && !own.has_payments;
  const ownPlanId = own?.id ?? null;
  const t = now();
  const stmts: D1PreparedStatement[] = [
    db.prepare("UPDATE collections SET voided_at = COALESCE(voided_at, ?) WHERE id = ?").bind(t, id),
    ...(unpaid
      ? [
          db.prepare("DELETE FROM collection_plans WHERE collection_id = ? AND plan_id = ?").bind(id, ownPlanId),
          db.prepare("DELETE FROM payment_plans WHERE id = ?").bind(ownPlanId),
        ]
      : []),
  ];
  // Si Juan lo pide, se resta del total base lo que la cuenta le sumó (nunca por debajo de 0); si la base estaba vacía
  // y queda en 0, vuelve a quedar sin total.
  let totalReverted = false;
  if (body.revertTotal === true && c.totalDelta > 0) {
    const row = await db.prepare("SELECT p.total, c.total_from_null FROM collections c JOIN projects p ON p.id = c.project_id WHERE c.id = ?").bind(id).first<{ total: number | null; total_from_null: number }>();
    const before = row?.total ?? null;
    if (before !== null) {
      const rest = Math.max(0, before - c.totalDelta);
      const after = row!.total_from_null && rest === 0 ? null : rest;
      stmts.push(
        // Solo si el total sigue siendo el que se leyó (dos anulaciones a la vez no restan dos veces).
        db.prepare("UPDATE projects SET total = ?, updated_at = ? WHERE id = ? AND total IS ?").bind(after, t, c.projectId, before),
        logActivity(db, session.email, "project", c.projectId, "collection_total", { number: c.number, before, after }),
      );
      totalReverted = true;
    }
  }
  stmts.push(logActivity(db, session.email, "project", c.projectId, "collection_voided", { number: c.number, promiseDeleted: unpaid, totalReverted }));
  await db.batch(stmts);
  await renameLater(env, ctx, c.driveFileId, voidedName(c.number));
  return json({ collection: await loadCollection(db, "id", id) });
};
