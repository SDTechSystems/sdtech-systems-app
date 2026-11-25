import { isDate } from "../../shared/dates";
import type { PaymentMethod } from "../../shared/types";
import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { error, json, now, readJson } from "../http";
import { loadPayments, PAYMENT_METHODS, syncPlanPaid } from "../payments/repo";

const validAmount = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/** /api/admin/projects/:id/payments y /api/admin/projects/:id/payment-plans */
export const handleProjectPayments: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const db = env.DB;
  const projectId = decodeURIComponent(path[1]);
  const project = await db.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first();
  if (!project) return error(404, "not_found");

  if (request.method === "GET") return json(await loadPayments(db, projectId));
  if (request.method !== "POST") return error(405, "method_not_allowed");

  if (path[2] === "payment-plans") {
    const body = await readJson<{ label?: string; amount?: number; dueDate?: string }>(request);
    if (body instanceof Response) return body;
    const label = body.label?.trim();
    if (!label) return error(400, "label_required");
    if (!validAmount(body.amount)) return error(400, "invalid_amount");
    if (!isDate(body.dueDate)) return error(400, "invalid_date");
    const id = crypto.randomUUID();
    await db.batch([
      db.prepare("INSERT INTO payment_plans (id, project_id, label, amount, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, projectId, label, body.amount, body.dueDate, now()),
      logActivity(db, session.email, "project", projectId, "add_payment_plan", { planId: id, label, amount: body.amount, dueDate: body.dueDate }),
    ]);
    return json(await loadPayments(db, projectId), 201);
  }

  const body = await readJson<{ amount?: number; paidOn?: string; method?: PaymentMethod; planId?: string | null; note?: string }>(request);
  if (body instanceof Response) return body;
  if (!validAmount(body.amount)) return error(400, "invalid_amount");
  if (!isDate(body.paidOn)) return error(400, "invalid_date");
  if (!PAYMENT_METHODS.includes(body.method as PaymentMethod)) return error(400, "invalid_method");
  const planId = body.planId || null;
  if (planId) {
    const plan = await db.prepare("SELECT id FROM payment_plans WHERE id = ? AND project_id = ?").bind(planId, projectId).first();
    if (!plan) return error(400, "invalid_plan");
  }
  const id = crypto.randomUUID();
  const t = now();
  await db.batch([
    db
      .prepare("INSERT INTO payments (id, project_id, plan_id, amount, paid_on, method, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, projectId, planId, body.amount, body.paidOn, body.method, body.note?.trim() || null, t),
    logActivity(db, session.email, "project", projectId, "payment", { paymentId: id, planId, amount: body.amount, method: body.method }),
  ]);
  if (planId) await syncPlanPaid(db, planId, t);
  return json(await loadPayments(db, projectId), 201);
};

/** /api/admin/payment-plans/:id */
export const handlePaymentPlans: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const db = env.DB;
  const id = path[1] ? decodeURIComponent(path[1]) : "";
  const plan = await db.prepare("SELECT id, project_id, label, amount, due_date, paid_at FROM payment_plans WHERE id = ?").bind(id).first<{
    id: string;
    project_id: string;
    label: string;
    amount: number;
    due_date: string;
    paid_at: string | null;
  }>();
  if (!plan) return error(404, "not_found");

  if (request.method === "DELETE") {
    await db.batch([
      db.prepare("UPDATE payments SET plan_id = NULL WHERE plan_id = ?").bind(id),
      db.prepare("DELETE FROM payment_plans WHERE id = ?").bind(id),
      logActivity(db, session.email, "project", plan.project_id, "delete_payment_plan", { planId: id, label: plan.label }),
    ]);
    return json(await loadPayments(db, plan.project_id));
  }
  if (request.method !== "PATCH") return error(405, "method_not_allowed");
  const body = await readJson<{ label?: string; amount?: number; dueDate?: string; paid?: boolean }>(request);
  if (body instanceof Response) return body;
  const label = body.label !== undefined ? body.label.trim() : plan.label;
  if (!label) return error(400, "label_required");
  if (body.amount !== undefined && !validAmount(body.amount)) return error(400, "invalid_amount");
  if (body.dueDate !== undefined && !isDate(body.dueDate)) return error(400, "invalid_date");
  const paidAt = body.paid === true ? plan.paid_at ?? now() : body.paid === false ? null : plan.paid_at;
  await db.batch([
    db
      .prepare("UPDATE payment_plans SET label = ?, amount = ?, due_date = ?, paid_at = ? WHERE id = ?")
      .bind(label, body.amount ?? plan.amount, body.dueDate ?? plan.due_date, paidAt, id),
    logActivity(db, session.email, "project", plan.project_id, "update_payment_plan", { planId: id, fields: Object.keys(body) }),
  ]);
  return json(await loadPayments(db, plan.project_id));
};

/** /api/admin/payments/:id */
export const handlePayments: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const db = env.DB;
  const id = path[1] ? decodeURIComponent(path[1]) : "";
  const payment = await db.prepare("SELECT id, project_id, plan_id, amount FROM payments WHERE id = ?").bind(id).first<{ id: string; project_id: string; plan_id: string | null; amount: number }>();
  if (!payment) return error(404, "not_found");
  if (request.method !== "DELETE") return error(405, "method_not_allowed");
  await db.batch([
    db.prepare("DELETE FROM payments WHERE id = ?").bind(id),
    logActivity(db, session.email, "project", payment.project_id, "delete_payment", { amount: payment.amount }),
  ]);
  if (payment.plan_id) await syncPlanPaid(db, payment.plan_id, now());
  return json(await loadPayments(db, payment.project_id));
};
