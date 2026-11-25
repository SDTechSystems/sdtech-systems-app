import { isExpired, todayBogota } from "../../shared/dates";
import type { Currency, Quote, QuoteItem, QuoteStatus, Service } from "../../shared/types";

export interface QuoteRow {
  id: string;
  number: string;
  client_id: string;
  client_name: string;
  service: Service;
  currency: Currency;
  status: Exclude<QuoteStatus, "expired">;
  advance_percent: number;
  notes: string;
  conditions: string;
  issued_at: string | null;
  valid_until: string | null;
  approved_at: string | null;
  approved_by: "owner" | "client" | null;
  approved_name: string | null;
  client_comment: string | null;
  project_id: string | null;
  created_at: string;
}

interface ItemRow {
  id: string;
  quote_id: string;
  title: string;
  detail: string;
  quantity: number;
  unit_price: number;
  catalog_item_id: string | null;
}

const SELECT = `SELECT q.id, q.number, q.client_id, c.name AS client_name, q.service, q.currency, q.status, q.advance_percent, q.notes, q.conditions, q.issued_at, q.valid_until, q.approved_at, q.approved_by, q.approved_name, q.client_comment, q.project_id, q.created_at FROM quotes q JOIN clients c ON c.id = q.client_id`;

export function effectiveStatus(row: Pick<QuoteRow, "status" | "valid_until">, today = todayBogota()): QuoteStatus {
  return row.status === "sent" && row.valid_until && isExpired(row.valid_until, today) ? "expired" : row.status;
}

function toQuote(r: QuoteRow, itemRows: ItemRow[], today?: string): Quote {
  const items: QuoteItem[] = itemRows.map((i) => ({
    id: i.id,
    title: i.title,
    detail: i.detail,
    quantity: i.quantity,
    unitPrice: i.unit_price,
    catalogItemId: i.catalog_item_id,
  }));
  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  return {
    id: r.id,
    number: r.number,
    clientId: r.client_id,
    clientName: r.client_name,
    service: r.service,
    currency: r.currency,
    status: effectiveStatus(r, today),
    items,
    total,
    advancePercent: r.advance_percent,
    advanceAmount: Math.round((total * r.advance_percent) / 100),
    notes: r.notes,
    conditions: r.conditions,
    issuedAt: r.issued_at,
    validUntil: r.valid_until,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
    approvedName: r.approved_name,
    clientComment: r.client_comment,
    projectId: r.project_id,
    createdAt: r.created_at,
  };
}

async function withItems(db: D1Database, rows: QuoteRow[], today?: string): Promise<Quote[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const { results } = await db
    .prepare(`SELECT id, quote_id, title, detail, quantity, unit_price, catalog_item_id FROM quote_items WHERE quote_id IN (${ids.map(() => "?").join(",")}) ORDER BY position`)
    .bind(...ids)
    .all<ItemRow>();
  return rows.map((r) => toQuote(r, results.filter((i) => i.quote_id === r.id), today));
}

export async function loadQuote(db: D1Database, id: string, today?: string): Promise<Quote | null> {
  const row = await db.prepare(`${SELECT} WHERE q.id = ?`).bind(id).first<QuoteRow>();
  return row ? (await withItems(db, [row], today))[0] : null;
}

export async function listQuotes(db: D1Database, filter: { clientId?: string | null; statuses?: QuoteStatus[] } = {}): Promise<Quote[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.clientId) {
    where.push("q.client_id = ?");
    args.push(filter.clientId);
  }
  const { results } = await db
    .prepare(`${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY q.created_at DESC, q.number DESC`)
    .bind(...args)
    .all<QuoteRow>();
  const quotes = await withItems(db, results);
  return filter.statuses ? quotes.filter((q) => filter.statuses!.includes(q.status)) : quotes;
}
