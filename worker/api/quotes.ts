import { addDays, todayBogota } from "../../shared/dates";
import type { Currency, Quote, QuoteStatus, Service } from "../../shared/types";
import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { error, json, now, readJson } from "../http";
import { approveQuote } from "../quotes/approve";
import { listQuotes, loadQuote } from "../quotes/repo";
import { formatNumber, getSettings, nextNumber } from "../settings";

const SERVICES: Service[] = ["web", "marca", "software", "general"];
const CURRENCIES: Currency[] = ["COP", "USD"];

interface ItemInput {
  title?: unknown;
  detail?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  catalogItemId?: unknown;
}
interface QuoteInput {
  clientId?: string;
  service?: Service;
  currency?: Currency;
  items?: ItemInput[];
  notes?: string;
  conditions?: string;
  advancePercent?: number;
  note?: string;
}

type CleanItem = { title: string; detail: string; quantity: number; unitPrice: number; catalogItemId: string | null };

function cleanItems(items: unknown): CleanItem[] | Response {
  if (!Array.isArray(items) || items.length === 0) return error(400, "items_required");
  const out: CleanItem[] = [];
  for (const raw of items as ItemInput[]) {
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const ok =
      title &&
      Number.isInteger(raw.quantity) &&
      (raw.quantity as number) >= 1 &&
      Number.isInteger(raw.unitPrice) &&
      (raw.unitPrice as number) >= 0;
    if (!ok) return error(400, "invalid_items");
    out.push({
      title,
      detail: typeof raw.detail === "string" ? raw.detail.trim() : "",
      quantity: raw.quantity as number,
      unitPrice: raw.unitPrice as number,
      catalogItemId: typeof raw.catalogItemId === "string" && raw.catalogItemId ? raw.catalogItemId : null,
    });
  }
  return out;
}

const insertItems = (db: D1Database, quoteId: string, items: CleanItem[]) =>
  items.map((it, i) =>
    db
      .prepare("INSERT INTO quote_items (id, quote_id, position, title, detail, quantity, unit_price, catalog_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), quoteId, i + 1, it.title, it.detail, it.quantity, it.unitPrice, it.catalogItemId),
  );

async function createQuote(db: D1Database, actor: string, input: Required<Pick<QuoteInput, "clientId" | "service" | "currency">> & { items: CleanItem[]; notes: string; conditions: string; advancePercent: number }): Promise<Quote> {
  const id = crypto.randomUUID();
  const number = formatNumber("COT", await nextNumber(db, "quote"));
  const t = now();
  await db.batch([
    db
      .prepare("INSERT INTO quotes (id, number, client_id, service, currency, status, advance_percent, notes, conditions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)")
      .bind(id, number, input.clientId, input.service, input.currency, input.advancePercent, input.notes, input.conditions, t, t),
    ...insertItems(db, id, input.items),
    logActivity(db, actor, "quote", id, "create", { number }),
  ]);
  return (await loadQuote(db, id))!;
}

const validAdvance = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100;

export const handleQuotes: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const db = env.DB;
  const id = path[1] ? decodeURIComponent(path[1]) : null;
  const action = path[2] ?? null;

  if (request.method === "GET" && !id) {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") as QuoteStatus | null;
    return json({ quotes: await listQuotes(db, { clientId: url.searchParams.get("clientId"), statuses: status ? [status] : undefined }) });
  }

  if (request.method === "GET" && id && !action) {
    const quote = await loadQuote(db, id);
    if (!quote) return error(404, "not_found");
    const { results } = await db
      .prepare("SELECT at, actor, action, detail FROM activity_log WHERE entity_type = 'quote' AND entity_id = ? ORDER BY at DESC, rowid DESC LIMIT 50")
      .bind(id)
      .all<{ at: string; actor: string; action: string; detail: string | null }>();
    return json({ quote, activity: results.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })) });
  }

  if (request.method === "POST" && !id) {
    const body = await readJson<QuoteInput>(request);
    if (body instanceof Response) return body;
    const client = body.clientId ? await db.prepare("SELECT id FROM clients WHERE id = ?").bind(body.clientId).first() : null;
    if (!client) return error(400, "invalid_client");
    if (!SERVICES.includes(body.service as Service)) return error(400, "invalid_service");
    const currency = body.currency ?? "COP";
    if (!CURRENCIES.includes(currency)) return error(400, "invalid_currency");
    const items = cleanItems(body.items);
    if (items instanceof Response) return items;
    const settings = await getSettings(db);
    const advancePercent = body.advancePercent ?? settings.quotes.advancePercent;
    if (!validAdvance(advancePercent)) return error(400, "invalid_advance");
    const quote = await createQuote(db, session.email, {
      clientId: body.clientId!,
      service: body.service!,
      currency,
      items,
      notes: typeof body.notes === "string" ? body.notes.trim() : "",
      conditions: typeof body.conditions === "string" ? body.conditions.trim() : settings.quotes.conditions,
      advancePercent,
    });
    return json({ quote }, 201);
  }

  if (!id) return error(405, "method_not_allowed");
  const quote = await loadQuote(db, id);
  if (!quote) return error(404, "not_found");

  if (request.method === "PATCH" && !action) {
    if (quote.status !== "draft") return error(409, "not_editable");
    const body = await readJson<QuoteInput>(request);
    if (body instanceof Response) return body;
    const next = {
      service: body.service ?? quote.service,
      currency: body.currency ?? quote.currency,
      notes: typeof body.notes === "string" ? body.notes.trim() : quote.notes,
      conditions: typeof body.conditions === "string" ? body.conditions.trim() : quote.conditions,
      advancePercent: body.advancePercent ?? quote.advancePercent,
    };
    if (!SERVICES.includes(next.service)) return error(400, "invalid_service");
    if (!CURRENCIES.includes(next.currency)) return error(400, "invalid_currency");
    if (!validAdvance(next.advancePercent)) return error(400, "invalid_advance");
    const items = body.items !== undefined ? cleanItems(body.items) : null;
    if (items instanceof Response) return items;
    await db.batch([
      db
        .prepare("UPDATE quotes SET service = ?, currency = ?, notes = ?, conditions = ?, advance_percent = ?, updated_at = ? WHERE id = ? AND status = 'draft'")
        .bind(next.service, next.currency, next.notes, next.conditions, next.advancePercent, now(), id),
      ...(items ? [db.prepare("DELETE FROM quote_items WHERE quote_id = ?").bind(id), ...insertItems(db, id, items)] : []),
      logActivity(db, session.email, "quote", id, "update"),
    ]);
    return json({ quote: await loadQuote(db, id) });
  }

  if (request.method !== "POST") return error(405, "method_not_allowed");
  const body = await readJson<QuoteInput>(request);
  if (body instanceof Response) return body;

  if (action === "send") {
    if (quote.status !== "draft") return error(409, "not_sendable");
    const settings = await getSettings(db);
    const validUntil = addDays(todayBogota(), settings.quotes.validityDays);
    await db.batch([
      db.prepare("UPDATE quotes SET status = 'sent', issued_at = ?, valid_until = ?, updated_at = ? WHERE id = ? AND status = 'draft'").bind(now(), validUntil, now(), id),
      logActivity(db, session.email, "quote", id, "send", { validUntil }),
    ]);
    return json({ quote: await loadQuote(db, id) });
  }

  if (action === "approve") {
    const result = await approveQuote(db, id, { by: "owner", actor: session.email, note: typeof body.note === "string" ? body.note.trim() || undefined : undefined });
    return result instanceof Response ? result : json(result);
  }

  if (action === "reject") {
    if (quote.status !== "sent") return error(409, "not_rejectable");
    await db.batch([
      db.prepare("UPDATE quotes SET status = 'rejected', owner_note = ?, updated_at = ? WHERE id = ? AND status = 'sent'").bind(body.note ?? null, now(), id),
      logActivity(db, session.email, "quote", id, "reject", { note: body.note ?? null }),
    ]);
    return json({ quote: await loadQuote(db, id) });
  }

  if (action === "renew") {
    if (quote.status !== "expired" && quote.status !== "rejected") return error(409, "not_renewable");
    const items: CleanItem[] = [];
    for (const it of quote.items) {
      const current = it.catalogItemId
        ? await db.prepare("SELECT price FROM catalog_items WHERE id = ? AND currency = ?").bind(it.catalogItemId, quote.currency).first<{ price: number }>()
        : null;
      items.push({ title: it.title, detail: it.detail, quantity: it.quantity, unitPrice: current?.price ?? it.unitPrice, catalogItemId: it.catalogItemId });
    }
    const renewed = await createQuote(db, session.email, {
      clientId: quote.clientId,
      service: quote.service,
      currency: quote.currency,
      items,
      notes: quote.notes,
      conditions: quote.conditions,
      advancePercent: quote.advancePercent,
    });
    await logActivity(db, session.email, "quote", id, "renew", { newQuote: renewed.number }).run();
    return json({ quote: renewed }, 201);
  }

  return error(404, "not_found");
};
