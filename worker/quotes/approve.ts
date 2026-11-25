import { todayBogota } from "../../shared/dates";
import type { Quote } from "../../shared/types";
import { error, now } from "../http";
import { getSettings } from "../settings";
import { loadQuote } from "./repo";

export interface ApproveInput {
  by: "owner" | "client";
  actor: string;
  name?: string;
  comment?: string;
  note?: string;
  today?: string;
}

/** Fases que ya quedaron atrás cuando el cliente aprueba la cotización. */
const DONE_UP_TO = ["Cotización", "Propuesta"];

export function initialPhaseStatuses(template: string[], fromQuote: boolean): ("pending" | "in_progress" | "done")[] {
  const cut = fromQuote ? Math.max(...DONE_UP_TO.map((n) => template.indexOf(n))) : -1;
  return template.map((_, i) => (i <= cut ? "done" : i === cut + 1 ? "in_progress" : "pending"));
}

/**
 * Aprueba una cotización enviada y vigente y crea su proyecto con fases, en una sola transacción.
 * Si otra aprobación ganó (doble clic, panel y portal a la vez), responde 409 sin duplicar el proyecto.
 */
export async function approveQuote(db: D1Database, quoteId: string, input: ApproveInput): Promise<{ quote: Quote; projectId: string } | Response> {
  const today = input.today ?? todayBogota();
  const quote = await loadQuote(db, quoteId, today);
  if (!quote) return error(404, "not_found");
  if (quote.status !== "sent") return error(409, "not_approvable");

  const settings = await getSettings(db);
  const template = settings.phaseTemplates[quote.service];
  const statuses = initialPhaseStatuses(template, true);
  const projectId = crypto.randomUUID();
  const t = now();
  const snapshot = JSON.stringify({ items: quote.items, total: quote.total, currency: quote.currency, advancePercent: quote.advancePercent });
  const guard = "EXISTS (SELECT 1 FROM quotes WHERE id = ? AND project_id = ?)";

  await db.batch([
    db
      .prepare(
        "UPDATE quotes SET status = 'approved', approved_at = ?, approved_by = ?, approved_name = ?, client_comment = ?, owner_note = ?, approval_snapshot = ?, project_id = ?, updated_at = ? WHERE id = ? AND status = 'sent' AND valid_until >= ?",
      )
      .bind(t, input.by, input.name ?? null, input.comment ?? null, input.note ?? null, snapshot, projectId, t, quoteId, today),
    db
      .prepare(
        `INSERT INTO projects (id, client_id, quote_id, service, title, description, status, start_date, due_date, total, currency, advance_percent, created_at, updated_at) SELECT ?, ?, ?, ?, ?, '', 'active', ?, NULL, ?, ?, ?, ?, ? WHERE ${guard}`,
      )
      .bind(projectId, quote.clientId, quote.id, quote.service, quote.items[0]?.title ?? quote.service, today, quote.total, quote.currency, quote.advancePercent, t, t, quoteId, projectId),
    ...template.map((name, i) =>
      db
        .prepare(`INSERT INTO phases (id, project_id, parent_id, position, name, status, done_at, created_at) SELECT ?, ?, NULL, ?, ?, ?, ?, ? WHERE ${guard}`)
        .bind(crypto.randomUUID(), projectId, i + 1, name, statuses[i], statuses[i] === "done" ? t : null, t, quoteId, projectId),
    ),
    db
      .prepare(`INSERT INTO activity_log (id, at, actor, entity_type, entity_id, action, detail) SELECT ?, ?, ?, 'quote', ?, 'approve', ? WHERE ${guard}`)
      .bind(crypto.randomUUID(), t, input.actor, quoteId, JSON.stringify({ by: input.by, name: input.name ?? null, comment: input.comment ?? null, total: quote.total }), quoteId, projectId),
    db
      .prepare(`INSERT INTO activity_log (id, at, actor, entity_type, entity_id, action, detail) SELECT ?, ?, ?, 'project', ?, 'create', ? WHERE ${guard}`)
      .bind(crypto.randomUUID(), t, input.actor, projectId, JSON.stringify({ fromQuote: quote.number }), quoteId, projectId),
  ]);

  const approved = await loadQuote(db, quoteId, today);
  if (!approved || approved.projectId !== projectId) return error(409, "not_approvable");
  return { quote: approved, projectId };
}

