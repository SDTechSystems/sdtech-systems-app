import { addDays, dayOf, formatLongDate, todayBogota } from "../../shared/dates";
import type { Currency, Pending, PendingItem, Urgency } from "../../shared/types";
import type { Handler } from "../auth/session";
import { error, json, now, readJson } from "../http";
import { PORTAL_ACTOR } from "../portal/api";
import { getSettings } from "../settings";
import { googleStatus } from "../google/oauth";
import { signedMoney } from "../../shared/money";
import { listMeetings } from "./meetings";

const ORDER: Record<Urgency, number> = { overdue: 0, today: 1, soon: 2, info: 3 };
const urgencyOf = (date: string, today: string): Urgency => (date < today ? "overdue" : date === today ? "today" : "soon");
const SEEN_KEY = "portal_seen_at";

type ClientCols = { client_id: string; client_name: string; client_phone: string | null };
const clientOf = (r: ClientCols) => ({ clientId: r.client_id, clientName: r.client_name, clientPhone: r.client_phone });

export const handlePending: Handler = async (request, env, session, path) => {
  const db = env.DB;
  const owner = session.role === "owner";

  if (path[1] === "seen") {
    if (request.method !== "POST") return error(405, "method_not_allowed");
    if (!owner) return error(403, "forbidden");
    const body = await readJson<object>(request);
    if (body instanceof Response) return body;
    await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(SEEN_KEY, now()).run();
    return json({ ok: true });
  }
  if (request.method !== "GET") return error(405, "method_not_allowed");

  const param = new URL(request.url).searchParams.get("today");
  const today = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : todayBogota();
  const { alerts } = await getSettings(db);
  const soon = addDays(today, alerts.dueSoonDays);
  const items: PendingItem[] = [];

  if (owner) {
    const plans = await db
      .prepare(
        `SELECT pp.id, pp.label, pp.amount - COALESCE((SELECT SUM(amount) FROM payments WHERE plan_id = pp.id), 0) AS remaining, pp.due_date, p.id AS project_id, p.title, p.currency, c.id AS client_id, c.name AS client_name, c.phone AS client_phone
         FROM payment_plans pp JOIN projects p ON p.id = pp.project_id JOIN clients c ON c.id = p.client_id
         WHERE pp.paid_at IS NULL AND p.status != 'cancelled' AND pp.due_date <= ?`,
      )
      .bind(soon)
      .all<ClientCols & { id: string; label: string; remaining: number; due_date: string; project_id: string; title: string; currency: Currency | null }>();
    const reminders = await db
      .prepare("SELECT detail, MAX(at) AS at FROM activity_log WHERE action = 'reminder' AND entity_type = 'project' GROUP BY detail")
      .all<{ detail: string; at: string }>();
    const lastByPlan = new Map<string, string>();
    for (const r of reminders.results) {
      const planId = (JSON.parse(r.detail) as { planId?: string }).planId;
      if (planId && (!lastByPlan.get(planId) || r.at > lastByPlan.get(planId)!)) lastByPlan.set(planId, r.at);
    }
    for (const r of plans.results) {
      if (r.remaining <= 0) continue;
      items.push({
        kind: "payment",
        title: `Cobro: ${r.label}`,
        subtitle: `${r.client_name} · ${r.title}`,
        date: r.due_date,
        urgency: urgencyOf(r.due_date, today),
        link: `/proyectos/${r.project_id}`,
        ...clientOf(r),
        projectId: r.project_id,
        planId: r.id,
        amount: r.remaining,
        currency: r.currency ?? "COP",
        lastReminderAt: lastByPlan.get(r.id) ?? null,
      });
    }

    const quotes = await db
      .prepare(
        `SELECT q.id, q.number, q.valid_until, c.id AS client_id, c.name AS client_name, c.phone AS client_phone
         FROM quotes q JOIN clients c ON c.id = q.client_id WHERE q.status = 'sent' AND q.valid_until >= ? AND q.valid_until <= ?`,
      )
      .bind(addDays(today, -30), addDays(today, alerts.quoteExpiringDays))
      .all<ClientCols & { id: string; number: string; valid_until: string }>();
    for (const q of quotes.results) {
      const expired = q.valid_until < today;
      items.push({
        kind: expired ? "quote_expired" : "quote_expiring",
        title: expired ? `${q.number} venció sin respuesta` : `${q.number} vence pronto`,
        subtitle: q.client_name,
        date: q.valid_until,
        urgency: expired ? "info" : q.valid_until === today ? "today" : "soon",
        link: `/cotizaciones/${q.id}`,
        ...clientOf(q),
        quoteId: q.id,
      });
    }
  }

  const deliveries = await db
    .prepare(
      `SELECT p.id, p.title, p.due_date, c.id AS client_id, c.name AS client_name, c.phone AS client_phone
       FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.status = 'active' AND p.due_date IS NOT NULL AND p.due_date <= ?`,
    )
    .bind(soon)
    .all<ClientCols & { id: string; title: string; due_date: string }>();
  for (const p of deliveries.results) {
    items.push({ kind: "delivery", title: `Entrega: ${p.title}`, subtitle: p.client_name, date: p.due_date, urgency: urgencyOf(p.due_date, today), link: `/proyectos/${p.id}`, ...clientOf(p), projectId: p.id });
  }

  const phases = await db
    .prepare(
      `SELECT f.name, f.due_date, p.id AS project_id, p.title, c.id AS client_id, c.name AS client_name, c.phone AS client_phone
       FROM phases f JOIN projects p ON p.id = f.project_id JOIN clients c ON c.id = p.client_id
       WHERE p.status = 'active' AND f.status != 'done' AND f.due_date IS NOT NULL AND f.due_date <= ?`,
    )
    .bind(soon)
    .all<ClientCols & { name: string; due_date: string; project_id: string; title: string }>();
  for (const f of phases.results) {
    items.push({ kind: "phase", title: `${f.name} · ${f.title}`, subtitle: f.client_name, date: f.due_date, urgency: urgencyOf(f.due_date, today), link: `/proyectos/${f.project_id}`, ...clientOf(f), projectId: f.project_id });
  }

  const seen = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(SEEN_KEY).first<{ value: string }>();
  const since = seen?.value ?? `${addDays(today, -7)}T05:00:00.000Z`;
  const news = await db
    .prepare(
      `SELECT a.action, a.at, a.detail, q.id AS quote_id, q.number, q.approved_name, c.id AS client_id, c.name AS client_name, c.phone AS client_phone
       FROM activity_log a JOIN quotes q ON q.id = a.entity_id JOIN clients c ON c.id = q.client_id
       WHERE a.actor = ? AND a.entity_type = 'quote' AND a.at > ? ORDER BY a.at DESC`,
    )
    .bind(PORTAL_ACTOR, since)
    .all<ClientCols & { action: string; at: string; detail: string | null; quote_id: string; number: string; approved_name: string | null }>();
  for (const n of news.results) {
    const who = n.approved_name ?? n.client_name;
    const comment = n.detail ? (JSON.parse(n.detail) as { comment?: string | null }).comment : null;
    items.push({
      kind: "portal",
      title: n.action === "approve" ? `${who} aprobó ${n.number}` : n.action === "reject" ? `${n.client_name} rechazó ${n.number}` : `${n.client_name}: ${n.action} ${n.number}`,
      subtitle: comment ? `«${comment}»` : n.client_name,
      date: dayOf(n.at),
      urgency: "info",
      link: `/cotizaciones/${n.quote_id}`,
      ...clientOf(n),
      quoteId: n.quote_id,
    });
  }

  const projectNews = await db
    .prepare(
      `SELECT a.action, a.at, a.detail, p.id AS project_id, p.title, p.currency, c.id AS client_id, c.name AS client_name, c.phone AS client_phone
       FROM activity_log a JOIN projects p ON p.id = a.entity_id JOIN clients c ON c.id = p.client_id
       WHERE a.actor = ? AND a.entity_type = 'project' AND a.action IN ('adjustment_requested','change_approved','change_rejected') AND a.at > ? ORDER BY a.at DESC`,
    )
    .bind(PORTAL_ACTOR, since)
    .all<ClientCols & { action: string; at: string; detail: string | null; project_id: string; title: string; currency: Currency | null }>();
  for (const n of projectNews.results) {
    const d = (n.detail ? JSON.parse(n.detail) : {}) as { description?: string; amount?: number; name?: string | null; comment?: string | null };
    if (!owner && n.action !== "adjustment_requested") continue;
    const who = d.name ?? n.client_name;
    const title =
      n.action === "adjustment_requested"
        ? `${n.client_name} pidió un ajuste en ${n.title}`
        : n.action === "change_approved"
          ? `${who} aprobó un cambio de ${signedMoney(d.amount ?? 0, n.currency ?? "COP")}`
          : n.action === "change_rejected"
            ? `${n.client_name} rechazó un cambio`
            : `${n.client_name}: ${n.action}`;
    items.push({
      kind: "portal",
      title,
      subtitle: d.comment ? `«${d.comment}»` : d.description ? `«${d.description}»` : n.title,
      date: dayOf(n.at),
      urgency: "info",
      link: `/proyectos/${n.project_id}`,
      ...clientOf(n),
      projectId: n.project_id,
    });
  }

  const cutoff = addDays(today, -alerts.staleDays);
  const active = await db
    .prepare(
      `SELECT p.id, p.title, p.created_at, (SELECT MAX(at) FROM activity_log WHERE entity_type = 'project' AND entity_id = p.id) AS last_at, c.id AS client_id, c.name AS client_name, c.phone AS client_phone
       FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.status = 'active'`,
    )
    .all<ClientCols & { id: string; title: string; created_at: string; last_at: string | null }>();
  for (const p of active.results) {
    const lastDay = dayOf(p.last_at ?? p.created_at);
    if (lastDay >= cutoff) continue;
    items.push({ kind: "stale", title: `Sin movimiento: ${p.title}`, subtitle: `${p.client_name} · último cambio el ${formatLongDate(lastDay)}`, date: lastDay, urgency: "soon", link: `/proyectos/${p.id}`, ...clientOf(p), projectId: p.id });
  }

  items.sort((a, b) => ORDER[a.urgency] - ORDER[b.urgency] || (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  const meetings = await listMeetings(db, { fromDate: today, toDate: addDays(today, 1) });
  const google = { status: (await googleStatus(db)).status };
  const result: Pending = { today, items, meetings, subscriptions: [], google };
  return json(result);
};
