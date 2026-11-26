import { MAX_DETAIL } from "../../shared/docs/model";
import type { CollectionLineInput, CollectionLineSource, InvoiceLine } from "../../shared/types";
import { error } from "../http";

const SOURCES: CollectionLineSource[] = ["balance", "advance", "plan", "quote", "change", "catalog", "free"];

export interface ProjectPlan {
  id: string;
  amount: number;
  paid_at: string | null;
  /** Lo ya abonado a la promesa. */
  paid: number;
}

export interface PricedLine {
  source: CollectionLineSource;
  /** Solo en las líneas de promesa. */
  planId: string | null;
  line: InvoiceLine;
}

const validLine = (l: CollectionLineInput): boolean =>
  !!l &&
  SOURCES.includes(l.source) &&
  typeof l.title === "string" &&
  !!l.title.trim() &&
  (l.detail === undefined || typeof l.detail === "string") &&
  // En una línea de promesa el servidor pone cantidad y valor.
  (l.source === "plan" || (Number.isInteger(l.quantity) && l.quantity >= 1 && Number.isInteger(l.unitPrice) && l.unitPrice >= 0));

/**
 * Valida las líneas del editor (cuenta de cobro y recibo) y les pone precio. Una línea de
 * promesa nunca toma el valor del cliente: lo da `planPrice`, que puede rechazarla con un error.
 */
export async function priceLines(
  db: D1Database,
  projectId: string,
  input: unknown,
  planPrice: (plan: ProjectPlan) => Promise<number | Response>,
): Promise<PricedLine[] | Response> {
  if (!Array.isArray(input) || !input.length) return error(400, "lines_required");
  const lines = input as CollectionLineInput[];
  if (!lines.every(validLine)) return error(400, "invalid_line");
  if (lines.some((l) => (l.detail?.trim().length ?? 0) > MAX_DETAIL)) return error(400, "detail_too_long");
  const plans = new Map(
    (
      await db
        .prepare("SELECT pp.id, pp.amount, pp.paid_at, (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE plan_id = pp.id) AS paid FROM payment_plans pp WHERE pp.project_id = ?")
        .bind(projectId)
        .all<ProjectPlan>()
    ).results.map((p) => [p.id, p]),
  );
  const priced: PricedLine[] = [];
  for (const l of lines) {
    const title = l.title.trim();
    const detail = l.detail?.trim() ?? "";
    if (l.source === "plan") {
      const plan = typeof l.planId === "string" ? plans.get(l.planId) : undefined;
      if (!plan || priced.some((p) => p.planId === plan.id)) return error(400, "invalid_plan");
      const price = await planPrice(plan);
      if (price instanceof Response) return price;
      priced.push({ source: l.source, planId: plan.id, line: { title, detail, quantity: 1, unitPrice: price, total: price } });
      continue;
    }
    priced.push({ source: l.source, planId: null, line: { title, detail, quantity: l.quantity, unitPrice: l.unitPrice, total: l.quantity * l.unitPrice } });
  }
  return priced;
}
