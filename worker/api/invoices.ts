import type { Collection, Invoice, InvoiceLine } from "../../shared/types";
import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { listChanges } from "../changes/repo";
import { priceLines } from "../collections/lines";
import { renameLater, voidedName } from "../google/drive";
import { collectionPaymentIds, listCollections, loadCollection } from "../collections/repo";
import { error, json, now, readJson } from "../http";
import { coveredPaymentIds, findInvoice, listInvoices, newVerifyCode, type InvoiceSnapshot } from "../invoices/repo";
import { loadPayments } from "../payments/repo";
import { loadQuote } from "../quotes/repo";
import { formatNumber, nextNumber } from "../settings";

interface ProjectRow {
  id: string;
  client_id: string;
  quote_id: string | null;
  title: string;
  total: number | null;
  currency: Invoice["currency"] | null;
}

interface ReceiptInput {
  lines?: unknown;
  paymentIds?: unknown;
  collectionId?: unknown;
}

/**
 * Las líneas de hoy: ítems de la cotización (o el total del proyecto) más los cambios aprobados, más lo que cada cuenta de
 * cobro no anulada sumó al total, como línea propia. La línea del total deja por fuera lo sumado, para no contarlo dos veces.
 */
async function currentLines(db: D1Database, project: ProjectRow): Promise<InvoiceLine[]> {
  const quote = project.quote_id ? await loadQuote(db, project.quote_id) : null;
  const added = (await listCollections(db, { projectId: project.id }))
    .filter((c) => c.status !== "voided")
    .reverse()
    .flatMap((c) => c.addedLines);
  const base = (project.total ?? 0) - added.reduce((s, l) => s + l.total, 0);
  const lines: InvoiceLine[] = quote
    ? quote.items.map((i) => ({ title: i.title, detail: i.detail, quantity: i.quantity, unitPrice: i.unitPrice, total: i.quantity * i.unitPrice }))
    : base > 0
      ? [{ title: project.title, detail: "", quantity: 1, unitPrice: base, total: base }]
      : [];
  for (const c of (await listChanges(db, project.id)).filter((c) => c.kind === "cost" && c.status === "approved").reverse()) {
    lines.push({ title: `Cambio aprobado: ${c.description}`, detail: "", quantity: 1, unitPrice: c.amount ?? 0, total: c.amount ?? 0 });
  }
  return [...lines, ...added];
}

/** /api/admin/projects/:id/invoices — recibos de pago (REC-) */
export const handleProjectInvoices: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const db = env.DB;
  const projectId = decodeURIComponent(path[1]);
  const project = await db.prepare("SELECT id, client_id, quote_id, title, total, currency FROM projects WHERE id = ?").bind(projectId).first<ProjectRow>();
  if (!project) return error(404, "not_found");
  if (request.method === "GET") return json({ invoices: await listInvoices(db, { projectId }) });
  if (request.method !== "POST") return error(405, "method_not_allowed");
  const body = await readJson<ReceiptInput>(request);
  if (body instanceof Response) return body;

  let collection: Collection | null = null;
  if (body.collectionId) {
    collection = typeof body.collectionId === "string" ? await loadCollection(db, "id", body.collectionId) : null;
    if (!collection || collection.projectId !== projectId || collection.status === "voided") return error(400, "invalid_collection");
    if (collection.paid <= 0) return error(409, "nothing_paid");
  }

  let lines: InvoiceLine[];
  if (body.lines !== undefined) {
    // El recibo suele ir después del pago: una promesa entra por su valor completo, pagada o no.
    const priced = await priceLines(db, projectId, body.lines, async (plan) => plan.amount);
    if (priced instanceof Response) return priced;
    lines = priced.map((p) => p.line);
  } else {
    lines = collection ? collection.lines : await currentLines(db, project);
  }
  if (!lines.length) return error(400, "lines_required");

  const pay = await loadPayments(db, projectId);
  let ids: Set<string>;
  if (body.paymentIds !== undefined) {
    const own = new Set(pay.payments.map((p) => p.id));
    const given = body.paymentIds;
    if (!Array.isArray(given) || new Set(given).size !== given.length || !given.every((id) => typeof id === "string" && own.has(id))) return error(400, "invalid_payment");
    ids = new Set(given as string[]);
  } else {
    // Por defecto, los pagos que aún no muestra otro recibo no anulado: de la cuenta, o del proyecto.
    const covered = await coveredPaymentIds(db, projectId);
    const pool = collection ? await collectionPaymentIds(db, collection.id) : pay.payments.map((p) => p.id);
    ids = new Set(pool.filter((id) => !covered.has(id)));
  }
  // Del más viejo al más nuevo, como se imprimen.
  const chosen = pay.payments.filter((p) => ids.has(p.id)).reverse();

  const client = await db.prepare("SELECT name, company, document, city, phone, email FROM clients WHERE id = ?").bind(project.client_id).first<Invoice["client"]>();
  const snapshot: InvoiceSnapshot = {
    lines,
    payments: chosen.map((p) => ({ paidOn: p.paidOn, method: p.method, amount: p.amount })),
    paymentIds: chosen.map((p) => p.id),
    collectionNumber: collection?.number ?? null,
    // Sin total (ni cambios aprobados) no hay saldo que mostrar.
    projectBalance: pay.total > 0 ? pay.balance : null,
    projectTitle: project.title,
    client: client!,
  };
  const total = lines.reduce((s, l) => s + l.total, 0);
  const paid = chosen.reduce((s, p) => s + p.amount, 0);
  const id = crypto.randomUUID();
  const number = formatNumber("REC", await nextNumber(db, "receipt"));
  const t = now();
  await db.batch([
    db
      .prepare("INSERT INTO invoices (id, number, project_id, client_id, issued_at, currency, snapshot, total, paid, balance, verify_code, collection_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, number, projectId, project.client_id, t, collection?.currency ?? pay.currency, JSON.stringify(snapshot), total, paid, total - paid, newVerifyCode(), collection?.id ?? null, t),
    logActivity(db, session.email, "project", projectId, "invoice_issued", { number, total }),
  ]);
  return json({ invoice: await findInvoice(db, "id", id) }, 201);
};

/** POST /api/admin/invoices/:id/void */
export const handleInvoices: Handler = async (request, env, session, path, ctx) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const id = path[1] ? decodeURIComponent(path[1]) : "";
  const inv = await findInvoice(env.DB, "id", id);
  if (!inv) return error(404, "not_found");
  if (request.method !== "POST" || path[2] !== "void") return error(405, "method_not_allowed");
  const body = await readJson<object>(request);
  if (body instanceof Response) return body;
  await env.DB.batch([
    env.DB.prepare("UPDATE invoices SET voided_at = COALESCE(voided_at, ?) WHERE id = ?").bind(now(), id),
    logActivity(env.DB, session.email, "project", inv.projectId, "invoice_voided", { number: inv.number }),
  ]);
  if (!inv.voided) {
    const file = await env.DB.prepare("SELECT drive_file_id AS f FROM invoices WHERE id = ?").bind(id).first<{ f: string | null }>();
    await renameLater(env, ctx, file?.f ?? null, voidedName(inv.number, true));
  }
  return json({ invoice: await findInvoice(env.DB, "id", id) });
};
