import { isDate } from "../../shared/dates";
import type { CollectionLineInput, CollectionLineSource, Currency, InvoiceLine } from "../../shared/types";
import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { listCollections, loadCollection, type CollectionSnapshot } from "../collections/repo";
import { error, json, now, readJson } from "../http";
import { formatNumber, getSettings, nextNumber } from "../settings";

const SOURCES: CollectionLineSource[] = ["balance", "advance", "plan", "quote", "change", "catalog", "free"];
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

const validLine = (l: CollectionLineInput): boolean =>
  !!l &&
  SOURCES.includes(l.source) &&
  typeof l.title === "string" &&
  !!l.title.trim() &&
  (l.detail === undefined || typeof l.detail === "string") &&
  // En una línea de promesa el servidor pone cantidad y valor.
  (l.source === "plan" || (Number.isInteger(l.quantity) && l.quantity >= 1 && Number.isInteger(l.unitPrice) && l.unitPrice >= 0));

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
  if (!Array.isArray(body.lines) || !body.lines.length) return error(400, "lines_required");
  if (!body.lines.every(validLine)) return error(400, "invalid_line");

  const plans = new Map(
    (
      await db
        .prepare("SELECT pp.id, pp.amount, pp.paid_at, (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE plan_id = pp.id) AS paid FROM payment_plans pp WHERE pp.project_id = ?")
        .bind(projectId)
        .all<{ id: string; amount: number; paid_at: string | null; paid: number }>()
    ).results.map((p) => [p.id, p]),
  );
  const planIds: string[] = [];
  const lines: InvoiceLine[] = [];
  const nonPlan: InvoiceLine[] = [];
  const newWork: InvoiceLine[] = [];
  for (const l of body.lines) {
    const title = l.title.trim();
    const detail = l.detail?.trim() ?? "";
    if (l.source === "plan") {
      const plan = typeof l.planId === "string" ? plans.get(l.planId) : undefined;
      const open = plan && !plan.paid_at ? plan.amount - plan.paid : 0;
      if (!plan || open <= 0 || planIds.includes(plan.id)) return error(400, "invalid_plan");
      planIds.push(plan.id);
      lines.push({ title, detail, quantity: 1, unitPrice: open, total: open });
      continue;
    }
    const line = { title, detail, quantity: l.quantity, unitPrice: l.unitPrice, total: l.quantity * l.unitPrice };
    lines.push(line);
    nonPlan.push(line);
    if (NEW_WORK.includes(l.source)) newWork.push(line);
  }

  const dueDate = body.dueDate ?? null;
  if (dueDate !== null && !isDate(dueDate)) return error(400, "invalid_date");
  const paymentUrl = typeof body.paymentUrl === "string" ? body.paymentUrl.trim() || null : null;
  if (paymentUrl && !/^https:\/\/\S+$/.test(paymentUrl)) return error(400, "invalid_url");
  const includeDelivery = body.includeDelivery === true;
  if (includeDelivery && !project.delivery_url) return error(400, "delivery_url_required");
  const total = sum(lines);
  if (total <= 0) return error(400, "invalid_amount");

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
      .prepare("INSERT INTO collections (id, number, project_id, client_id, issued_at, currency, total, due_date, own_plan_id, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, number, projectId, project.client_id, t, currency, total, dueDate, ownPlanId, JSON.stringify(snapshot), t),
    ...planIds.map((planId) => db.prepare("INSERT INTO collection_plans (collection_id, plan_id) VALUES (?, ?)").bind(id, planId)),
    logActivity(db, session.email, "project", projectId, "collection_issued", { number, total }),
  );

  const before = project.total;
  const after = body.setTotal === true && before === null ? total : body.addToTotal === true && before !== null ? before + sum(newWork) : before;
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
export const handleCollections: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const db = env.DB;
  const id = path[1] ? decodeURIComponent(path[1]) : "";
  const c = await loadCollection(db, "id", id);
  if (!c) return error(404, "not_found");
  if (request.method === "GET" && !path[2]) return json({ collection: c });
  if (request.method !== "POST" || path[2] !== "void") return error(405, "method_not_allowed");
  const body = await readJson<object>(request);
  if (body instanceof Response) return body;
  if (c.status === "voided") return json({ collection: c });
  const own = await db.prepare("SELECT own_plan_id FROM collections WHERE id = ?").bind(id).first<{ own_plan_id: string | null }>();
  const ownPlanId = own?.own_plan_id ?? null;
  // La promesa propia se cancela solo si nadie le ha pagado nada.
  const unpaid = ownPlanId ? !(await db.prepare("SELECT 1 FROM payments WHERE plan_id = ? LIMIT 1").bind(ownPlanId).first()) : false;
  await db.batch([
    db.prepare("UPDATE collections SET voided_at = ? WHERE id = ?").bind(now(), id),
    ...(unpaid
      ? [
          db.prepare("DELETE FROM collection_plans WHERE collection_id = ? AND plan_id = ?").bind(id, ownPlanId),
          db.prepare("DELETE FROM payment_plans WHERE id = ?").bind(ownPlanId),
        ]
      : []),
    logActivity(db, session.email, "project", c.projectId, "collection_voided", { number: c.number, promiseDeleted: unpaid }),
  ]);
  return json({ collection: await loadCollection(db, "id", id) });
};
