import type { Billing, CatalogItem, Currency, Service } from "../../shared/types";
import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { error, json, now, readJson } from "../http";

interface ItemRow {
  id: string;
  service: Service;
  name: string;
  description: string;
  price: number;
  currency: Currency;
  billing: Billing;
  price_from: number;
  active: number;
  sort: number;
}

const COLUMNS = "id, service, name, description, price, currency, billing, price_from, active, sort";
const SERVICES: Service[] = ["web", "marca", "software", "general"];
const CURRENCIES: Currency[] = ["COP", "USD"];
const BILLINGS: Billing[] = ["unico", "mensual", "anual"];

const toItem = (r: ItemRow): CatalogItem => ({
  id: r.id,
  service: r.service,
  name: r.name,
  description: r.description,
  price: r.price,
  currency: r.currency,
  billing: r.billing,
  priceFrom: r.price_from === 1,
  active: r.active === 1,
  sort: r.sort,
});

type ItemInput = Partial<Omit<CatalogItem, "id">>;

function validate(body: ItemInput, creating: boolean): Partial<CatalogItem> | Response {
  const out: Partial<CatalogItem> = {};
  if (creating || "name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return error(400, "name_required");
    out.name = name;
  }
  if (creating || "service" in body) {
    if (!SERVICES.includes(body.service as Service)) return error(400, "invalid_service");
    out.service = body.service;
  }
  if (creating || "price" in body) {
    if (typeof body.price !== "number" || !Number.isInteger(body.price) || body.price < 0) return error(400, "invalid_price");
    out.price = body.price;
  }
  if ("currency" in body || creating) {
    const c = body.currency ?? "COP";
    if (!CURRENCIES.includes(c)) return error(400, "invalid_currency");
    out.currency = c;
  }
  if ("billing" in body || creating) {
    const b = body.billing ?? "unico";
    if (!BILLINGS.includes(b)) return error(400, "invalid_billing");
    out.billing = b;
  }
  if ("description" in body || creating) out.description = typeof body.description === "string" ? body.description.trim() : "";
  if ("priceFrom" in body || creating) out.priceFrom = body.priceFrom === true;
  if ("active" in body) out.active = body.active !== false;
  if ("sort" in body && Number.isInteger(body.sort)) out.sort = body.sort;
  return out;
}

export const handleCatalog: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const db = env.DB;
  const id = path[1] ? decodeURIComponent(path[1]) : null;

  if (request.method === "GET" && !id) {
    const all = new URL(request.url).searchParams.get("all") === "1";
    const { results } = await db
      .prepare(`SELECT ${COLUMNS} FROM catalog_items ${all ? "" : "WHERE active = 1"} ORDER BY CASE service WHEN 'web' THEN 1 WHEN 'marca' THEN 2 WHEN 'software' THEN 3 ELSE 4 END, sort, name`)
      .all<ItemRow>();
    return json({ items: results.map(toItem) });
  }

  if (request.method === "POST" && !id) {
    const body = await readJson<ItemInput>(request);
    if (body instanceof Response) return body;
    const v = validate(body, true);
    if (v instanceof Response) return v;
    const max = await db.prepare("SELECT COALESCE(MAX(sort), 0) AS m FROM catalog_items").first<{ m: number }>();
    const item: CatalogItem = {
      id: crypto.randomUUID(),
      service: v.service!,
      name: v.name!,
      description: v.description ?? "",
      price: v.price!,
      currency: v.currency ?? "COP",
      billing: v.billing ?? "unico",
      priceFrom: v.priceFrom ?? false,
      active: true,
      sort: v.sort ?? (max?.m ?? 0) + 1,
    };
    const t = now();
    await db.batch([
      db
        .prepare("INSERT INTO catalog_items (id, service, name, description, price, currency, billing, price_from, active, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)")
        .bind(item.id, item.service, item.name, item.description, item.price, item.currency, item.billing, item.priceFrom ? 1 : 0, item.sort, t, t),
      logActivity(db, session.email, "catalog_item", item.id, "create", { name: item.name, price: item.price }),
    ]);
    return json({ item }, 201);
  }

  if (request.method === "PATCH" && id) {
    const body = await readJson<ItemInput>(request);
    if (body instanceof Response) return body;
    const row = await db.prepare(`SELECT ${COLUMNS} FROM catalog_items WHERE id = ?`).bind(id).first<ItemRow>();
    if (!row) return error(404, "not_found");
    const v = validate(body, false);
    if (v instanceof Response) return v;
    const current = toItem(row);
    const next: CatalogItem = { ...current, ...v };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(v) as (keyof CatalogItem)[]) if (current[k] !== next[k]) changes[k] = { from: current[k], to: next[k] };
    await db.batch([
      db
        .prepare("UPDATE catalog_items SET service = ?, name = ?, description = ?, price = ?, currency = ?, billing = ?, price_from = ?, active = ?, sort = ?, updated_at = ? WHERE id = ?")
        .bind(next.service, next.name, next.description, next.price, next.currency, next.billing, next.priceFrom ? 1 : 0, next.active ? 1 : 0, next.sort, now(), id),
      logActivity(db, session.email, "catalog_item", id, "update", changes),
    ]);
    return json({ item: next });
  }

  return error(405, "method_not_allowed");
};
