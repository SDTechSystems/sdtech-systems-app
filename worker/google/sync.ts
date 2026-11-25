import { addMinutesBogota } from "../../shared/dates";
import { formatMoney } from "../../shared/money";
import type { Currency } from "../../shared/types";
import type { Env } from "../env";
import { now } from "../http";
import { getSettings } from "../settings";
import { deleteEvent, GoogleError, insertEvent, patchEvent, type EventBody } from "./calendar";
import { getAccessToken } from "./oauth";

export interface EventSpec {
  summary: string;
  description: string;
  date: string;
}
export interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: number;
  skipped?: "not_connected";
}

const PANEL = "https://panel.sdtechsystems.dev";

/** Lo que debería estar en el calendario, por clave. */
export async function desiredEvents(db: D1Database): Promise<Map<string, EventSpec>> {
  const out = new Map<string, EventSpec>();
  const deliveries = await db
    .prepare("SELECT p.id, p.title, p.due_date, c.name FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.status IN ('active','paused') AND p.due_date IS NOT NULL")
    .all<{ id: string; title: string; due_date: string; name: string }>();
  for (const p of deliveries.results) {
    out.set(`delivery:${p.id}`, { summary: `Entrega: ${p.title} · ${p.name}`, description: `${PANEL}/proyectos/${p.id}`, date: p.due_date });
  }
  const phases = await db
    .prepare("SELECT f.id, f.name, f.due_date, p.id AS project_id, p.title FROM phases f JOIN projects p ON p.id = f.project_id WHERE p.status = 'active' AND f.status != 'done' AND f.due_date IS NOT NULL")
    .all<{ id: string; name: string; due_date: string; project_id: string; title: string }>();
  for (const f of phases.results) {
    out.set(`phase:${f.id}`, { summary: `${f.name} · ${f.title}`, description: `${PANEL}/proyectos/${f.project_id}`, date: f.due_date });
  }
  const plans = await db
    .prepare(
      `SELECT pp.id, pp.label, pp.due_date, pp.amount - COALESCE((SELECT SUM(amount) FROM payments WHERE plan_id = pp.id), 0) AS remaining, p.id AS project_id, p.currency, c.name
       FROM payment_plans pp JOIN projects p ON p.id = pp.project_id JOIN clients c ON c.id = p.client_id
       WHERE pp.paid_at IS NULL AND p.status != 'cancelled'`,
    )
    .all<{ id: string; label: string; due_date: string; remaining: number; project_id: string; currency: Currency | null; name: string }>();
  for (const pl of plans.results) {
    if (pl.remaining <= 0) continue;
    out.set(`payment:${pl.id}`, {
      summary: `Cobro: ${pl.label} ${formatMoney(pl.remaining, pl.currency ?? "COP")} · ${pl.name}`,
      description: `${PANEL}/proyectos/${pl.project_id}`,
      date: pl.due_date,
    });
  }
  return out;
}

async function signatureOf(spec: EventSpec, hour: number): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify({ ...spec, hour }));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bodyOf(spec: EventSpec, hour: number): EventBody {
  const start = `${spec.date}T${String(hour).padStart(2, "0")}:00:00-05:00`;
  return {
    summary: spec.summary,
    description: spec.description,
    start: { dateTime: start, timeZone: "America/Bogota" },
    end: { dateTime: addMinutesBogota(start, 30), timeZone: "America/Bogota" },
  };
}

let running: Promise<SyncResult> | null = null;

/** Deja el calendario igual a lo que dice el panel. Idempotente; un error por evento no detiene a los demás. */
export function syncCalendar(env: Env): Promise<SyncResult> {
  if (!running) running = run(env).finally(() => (running = null));
  return running;
}

async function run(env: Env): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: 0 };
  const token = await getAccessToken(env);
  if (!token) return { ...result, skipped: "not_connected" };
  const db = env.DB;
  const hour = (await getSettings(db)).calendar.eventHour;
  const desired = await desiredEvents(db);
  const { results: existing } = await db.prepare("SELECT key, google_event_id, signature FROM calendar_links").all<{ key: string; google_event_id: string; signature: string }>();
  const byKey = new Map(existing.map((l) => [l.key, l]));

  for (const [key, spec] of desired) {
    const sig = await signatureOf(spec, hour);
    const link = byKey.get(key);
    try {
      if (!link) {
        const ev = await insertEvent(token, bodyOf(spec, hour));
        await db.prepare("INSERT OR REPLACE INTO calendar_links (key, google_event_id, signature, updated_at) VALUES (?, ?, ?, ?)").bind(key, ev.id, sig, now()).run();
        result.created++;
      } else if (link.signature !== sig) {
        try {
          await patchEvent(token, link.google_event_id, bodyOf(spec, hour));
          await db.prepare("UPDATE calendar_links SET signature = ?, updated_at = ? WHERE key = ?").bind(sig, now(), key).run();
          result.updated++;
        } catch (e) {
          if (!(e instanceof GoogleError) || (e.status !== 404 && e.status !== 410)) throw e;
          // Lo borraron a mano en Google: se crea de nuevo.
          const ev = await insertEvent(token, bodyOf(spec, hour));
          await db.prepare("UPDATE calendar_links SET google_event_id = ?, signature = ?, updated_at = ? WHERE key = ?").bind(ev.id, sig, now(), key).run();
          result.created++;
        }
      }
    } catch {
      result.errors++;
    }
  }
  for (const link of existing) {
    if (desired.has(link.key)) continue;
    try {
      await deleteEvent(token, link.google_event_id);
      await db.prepare("DELETE FROM calendar_links WHERE key = ?").bind(link.key).run();
      result.deleted++;
    } catch {
      result.errors++;
    }
  }
  return result;
}
