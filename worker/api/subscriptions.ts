import { addCycle } from "../../shared/cycles";
import { isDate, todayBogota } from "../../shared/dates";
import type { Currency, Subscription, SubscriptionKind, SubscriptionStatus } from "../../shared/types";
import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { error, json, now, readJson } from "../http";
import { activeMethodIds } from "../payments/repo";
import { getSettings } from "../settings";

const KINDS: SubscriptionKind[] = ["hosting", "dominio", "mantenimiento", "soporte", "otro"];
const STATUSES: SubscriptionStatus[] = ["active", "paused", "cancelled"];

interface Row {
  id: string;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  project_id: string | null;
  kind: SubscriptionKind;
  name: string;
  amount: number;
  currency: Currency;
  cycle: "mensual" | "anual";
  next_due: string;
  provider: string | null;
  notes: string | null;
  status: SubscriptionStatus;
  last_paid_on: string | null;
}

const SELECT = `SELECT s.id, s.client_id, c.name AS client_name, c.phone AS client_phone, s.project_id, s.kind, s.name, s.amount, s.currency, s.cycle, s.next_due, s.provider, s.notes, s.status, s.last_paid_on FROM subscriptions s JOIN clients c ON c.id = s.client_id`;

const toSub = (r: Row): Subscription => ({
  id: r.id,
  clientId: r.client_id,
  clientName: r.client_name,
  clientPhone: r.client_phone,
  projectId: r.project_id,
  kind: r.kind,
  name: r.name,
  amount: r.amount,
  currency: r.currency,
  cycle: r.cycle,
  nextDue: r.next_due,
  provider: r.provider,
  notes: r.notes,
  status: r.status,
  lastPaidOn: r.last_paid_on,
});

export async function listSubscriptions(db: D1Database, filter: { clientId?: string | null; statuses?: SubscriptionStatus[] }): Promise<Subscription[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.clientId) {
    where.push("s.client_id = ?");
    args.push(filter.clientId);
  }
  const statuses = filter.statuses ?? ["active"];
  where.push(`s.status IN (${statuses.map(() => "?").join(",")})`);
  args.push(...statuses);
  const { results } = await db.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY s.next_due, s.name`).bind(...args).all<Row>();
  return results.map(toSub);
}

const load = async (db: D1Database, id: string) => {
  const r = await db.prepare(`${SELECT} WHERE s.id = ?`).bind(id).first<Row>();
  return r ? toSub(r) : null;
};

type Input = Partial<Omit<Subscription, "id" | "clientName" | "clientPhone" | "lastPaidOn">>;

function validate(body: Input, creating: boolean): Response | null {
  if ((creating || "name" in body) && !body.name?.trim()) return error(400, "name_required");
  if ((creating || "amount" in body) && !(Number.isInteger(body.amount) && (body.amount as number) > 0)) return error(400, "invalid_amount");
  if ((creating || "kind" in body) && !KINDS.includes(body.kind as SubscriptionKind)) return error(400, "invalid_kind");
  if ((creating || "cycle" in body) && body.cycle !== "mensual" && body.cycle !== "anual") return error(400, "invalid_cycle");
  if ((creating || "nextDue" in body) && !isDate(body.nextDue)) return error(400, "invalid_date");
  if ("currency" in body && body.currency !== "COP" && body.currency !== "USD") return error(400, "invalid_currency");
  if ("status" in body && !STATUSES.includes(body.status as SubscriptionStatus)) return error(400, "invalid_status");
  return null;
}

export const handleSubscriptions: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const db = env.DB;
  const id = path[1] ? decodeURIComponent(path[1]) : null;

  if (request.method === "GET" && !id) {
    const url = new URL(request.url);
    const s = url.searchParams.get("status");
    const statuses = s === "all" ? STATUSES : s && STATUSES.includes(s as SubscriptionStatus) ? [s as SubscriptionStatus] : undefined;
    return json({ subscriptions: await listSubscriptions(db, { clientId: url.searchParams.get("clientId"), statuses }) });
  }

  if (request.method === "POST" && !id) {
    const body = await readJson<Input>(request);
    if (body instanceof Response) return body;
    const client = body.clientId ? await db.prepare("SELECT id FROM clients WHERE id = ?").bind(body.clientId).first() : null;
    if (!client) return error(400, "invalid_client");
    const bad = validate(body, true);
    if (bad) return bad;
    const sid = crypto.randomUUID();
    const t = now();
    await db.batch([
      db
        .prepare("INSERT INTO subscriptions (id, client_id, project_id, kind, name, amount, currency, cycle, next_due, provider, notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)")
        .bind(sid, body.clientId, body.projectId ?? null, body.kind, body.name!.trim(), body.amount, body.currency ?? "COP", body.cycle, body.nextDue, body.provider?.trim() || null, body.notes?.trim() || null, t, t),
      logActivity(db, session.email, "client", body.clientId!, "subscription_created", { subscriptionId: sid, name: body.name, amount: body.amount, cycle: body.cycle }),
    ]);
    return json({ subscription: await load(db, sid) }, 201);
  }

  if (!id) return error(405, "method_not_allowed");
  const sub = await load(db, id);
  if (!sub) return error(404, "not_found");

  if (request.method === "PATCH") {
    const body = await readJson<Input>(request);
    if (body instanceof Response) return body;
    const bad = validate(body, false);
    if (bad) return bad;
    const n = { ...sub, ...body };
    await db.batch([
      db
        .prepare("UPDATE subscriptions SET project_id = ?, kind = ?, name = ?, amount = ?, currency = ?, cycle = ?, next_due = ?, provider = ?, notes = ?, status = ?, updated_at = ? WHERE id = ?")
        .bind(n.projectId ?? null, n.kind, n.name.trim(), n.amount, n.currency, n.cycle, n.nextDue, n.provider?.trim() || null, n.notes?.trim() || null, n.status, now(), id),
      logActivity(db, session.email, "client", sub.clientId, "subscription_updated", { subscriptionId: id, fields: Object.keys(body) }),
    ]);
    return json({ subscription: await load(db, id) });
  }

  if (request.method === "POST" && path[2] === "pay") {
    const body = await readJson<{ paidOn?: string; method?: string }>(request);
    if (body instanceof Response) return body;
    const paidOn = body.paidOn ?? todayBogota();
    if (!isDate(paidOn)) return error(400, "invalid_date");
    if (typeof body.method !== "string" || !activeMethodIds(await getSettings(db)).includes(body.method)) return error(400, "invalid_method");
    const next = addCycle(sub.nextDue, sub.cycle);
    await db.batch([
      db.prepare("UPDATE subscriptions SET next_due = ?, last_paid_on = ?, updated_at = ? WHERE id = ?").bind(next, paidOn, now(), id),
      logActivity(db, session.email, "client", sub.clientId, "subscription_paid", { subscriptionId: id, name: sub.name, amount: sub.amount, method: body.method, paidOn, period: sub.nextDue }),
    ]);
    return json({ subscription: await load(db, id) });
  }

  return error(405, "method_not_allowed");
};
