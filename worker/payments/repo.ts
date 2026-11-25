import { todayBogota } from "../../shared/dates";
import type { Currency, Payment, PaymentMethod, PaymentPlan, PaymentSummary, PlanStatus } from "../../shared/types";

export const PAYMENT_METHODS: PaymentMethod[] = ["nequi", "bancolombia", "efectivo", "breb"];

export const planStatus = (p: { paid_at: string | null; due_date: string }, today: string): PlanStatus =>
  p.paid_at ? "paid" : p.due_date < today ? "overdue" : "pending";

export async function loadPayments(db: D1Database, projectId: string, today = todayBogota()): Promise<PaymentSummary> {
  const project = await db.prepare("SELECT total, currency FROM projects WHERE id = ?").bind(projectId).first<{ total: number | null; currency: Currency | null }>();
  const [plans, payments] = await Promise.all([
    db.prepare("SELECT id, project_id, label, amount, due_date, paid_at FROM payment_plans WHERE project_id = ? ORDER BY due_date, created_at").bind(projectId).all<{
      id: string;
      project_id: string;
      label: string;
      amount: number;
      due_date: string;
      paid_at: string | null;
    }>(),
    db.prepare("SELECT id, project_id, plan_id, amount, paid_on, method, note FROM payments WHERE project_id = ? ORDER BY paid_on DESC, created_at DESC").bind(projectId).all<{
      id: string;
      project_id: string;
      plan_id: string | null;
      amount: number;
      paid_on: string;
      method: PaymentMethod;
      note: string | null;
    }>(),
  ]);
  const paymentList: Payment[] = payments.results.map((p) => ({
    id: p.id,
    projectId: p.project_id,
    planId: p.plan_id,
    amount: p.amount,
    paidOn: p.paid_on,
    method: p.method,
    note: p.note,
  }));
  const planList: PaymentPlan[] = plans.results.map((p) => ({
    id: p.id,
    projectId: p.project_id,
    label: p.label,
    amount: p.amount,
    dueDate: p.due_date,
    status: planStatus(p, today),
    paidAt: p.paid_at,
    paidAmount: paymentList.filter((x) => x.planId === p.id).reduce((s, x) => s + x.amount, 0),
  }));
  const total = project?.total ?? 0;
  const paid = paymentList.reduce((s, x) => s + x.amount, 0);
  return { currency: project?.currency ?? "COP", total, paid, balance: total - paid, plans: planList, payments: paymentList };
}

/** Marca o desmarca un compromiso según lo que ya se le pagó. */
export async function syncPlanPaid(db: D1Database, planId: string, at: string): Promise<void> {
  await db
    .prepare(
      `UPDATE payment_plans SET paid_at = CASE
         WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE plan_id = payment_plans.id) >= amount THEN COALESCE(paid_at, ?)
         ELSE NULL END
       WHERE id = ?`,
    )
    .bind(at, planId)
    .run();
}
