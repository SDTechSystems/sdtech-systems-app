import type { Invoice, InvoiceLine } from "../../shared/types";
import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { listChanges } from "../changes/repo";
import { error, json, now, readJson } from "../http";
import { findInvoice, listInvoices, newVerifyCode } from "../invoices/repo";
import { loadPayments } from "../payments/repo";
import { loadQuote } from "../quotes/repo";
import { formatNumber, nextNumber } from "../settings";

/** /api/admin/projects/:id/invoices */
export const handleProjectInvoices: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const db = env.DB;
  const projectId = decodeURIComponent(path[1]);
  const project = await db.prepare("SELECT id, client_id, quote_id, title, total, currency FROM projects WHERE id = ?").bind(projectId).first<{
    id: string;
    client_id: string;
    quote_id: string | null;
    title: string;
    total: number | null;
    currency: Invoice["currency"] | null;
  }>();
  if (!project) return error(404, "not_found");
  if (request.method === "GET") return json({ invoices: await listInvoices(db, { projectId }) });
  if (request.method !== "POST") return error(405, "method_not_allowed");
  const body = await readJson<object>(request);
  if (body instanceof Response) return body;

  const quote = project.quote_id ? await loadQuote(db, project.quote_id) : null;
  const lines: InvoiceLine[] = quote
    ? quote.items.map((i) => ({ title: i.title, detail: i.detail, quantity: i.quantity, unitPrice: i.unitPrice, total: i.quantity * i.unitPrice }))
    : project.total
      ? [{ title: project.title, detail: "", quantity: 1, unitPrice: project.total, total: project.total }]
      : [];
  for (const c of (await listChanges(db, projectId)).filter((c) => c.kind === "cost" && c.status === "approved").reverse()) {
    lines.push({ title: `Cambio aprobado: ${c.description}`, detail: "", quantity: 1, unitPrice: c.amount ?? 0, total: c.amount ?? 0 });
  }
  if (!lines.length) return error(400, "nothing_to_bill");
  const pay = await loadPayments(db, projectId);
  const client = await db.prepare("SELECT name, company, document, city, phone, email FROM clients WHERE id = ?").bind(project.client_id).first<Invoice["client"]>();
  const snapshot = {
    lines,
    payments: pay.payments.map((p) => ({ paidOn: p.paidOn, method: p.method, amount: p.amount })).reverse(),
    projectTitle: project.title,
    client: client!,
  };
  const total = lines.reduce((s, l) => s + l.total, 0);
  const id = crypto.randomUUID();
  const number = formatNumber("FAC", await nextNumber(db, "invoice"));
  const t = now();
  await db.batch([
    db
      .prepare("INSERT INTO invoices (id, number, project_id, client_id, issued_at, currency, snapshot, total, paid, balance, verify_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, number, projectId, project.client_id, t, pay.currency, JSON.stringify(snapshot), total, pay.paid, total - pay.paid, newVerifyCode(), t),
    logActivity(db, session.email, "project", projectId, "invoice_issued", { number, total }),
  ]);
  return json({ invoice: await findInvoice(db, "id", id) }, 201);
};

/** POST /api/admin/invoices/:id/void */
export const handleInvoices: Handler = async (request, env, session, path) => {
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
  return json({ invoice: await findInvoice(env.DB, "id", id) });
};
