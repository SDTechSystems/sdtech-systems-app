import { addMinutesBogota, bogotaInstant, isLocalDateTime, todayBogota } from "../../shared/dates";
import type { Meeting } from "../../shared/types";
import { logActivity } from "../activity";
import type { Handler } from "../auth/session";
import type { Env } from "../env";
import { deleteEvent, insertEvent, patchEvent, type EventBody } from "../google/calendar";
import { getAccessToken } from "../google/oauth";
import { error, json, now, readJson } from "../http";

interface Row {
  id: string;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  project_id: string | null;
  title: string;
  start_at: string;
  duration_min: number;
  notes: string | null;
  invite_client: number;
  meet_url: string | null;
  google_event_id: string | null;
  status: "scheduled" | "cancelled";
}

const SELECT = `SELECT m.id, m.client_id, c.name AS client_name, c.phone AS client_phone, c.email AS client_email, m.project_id, m.title, m.start_at, m.duration_min, m.notes, m.invite_client, m.meet_url, m.google_event_id, m.status FROM meetings m JOIN clients c ON c.id = m.client_id`;

const toMeeting = (r: Row): Meeting => ({
  id: r.id,
  clientId: r.client_id,
  clientName: r.client_name,
  clientPhone: r.client_phone,
  projectId: r.project_id,
  title: r.title,
  startAt: r.start_at,
  durationMin: r.duration_min,
  notes: r.notes,
  inviteClient: r.invite_client === 1,
  meetUrl: r.meet_url,
  googleEventId: r.google_event_id,
  status: r.status,
});

export async function listMeetings(db: D1Database, filter: { clientId?: string | null; projectId?: string | null; fromDate?: string; toDate?: string }): Promise<Meeting[]> {
  const where = ["m.status = 'scheduled'"];
  const args: unknown[] = [];
  if (filter.clientId) {
    where.push("m.client_id = ?");
    args.push(filter.clientId);
  }
  if (filter.projectId) {
    where.push("m.project_id = ?");
    args.push(filter.projectId);
  }
  if (filter.fromDate) {
    where.push("m.start_at >= ?");
    args.push(`${filter.fromDate}T00:00:00-05:00`);
  }
  if (filter.toDate) {
    where.push("m.start_at <= ?");
    args.push(`${filter.toDate}T23:59:59-05:00`);
  }
  const { results } = await db.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY m.start_at`).bind(...args).all<Row>();
  return results.map(toMeeting);
}

const load = (db: D1Database, id: string) => db.prepare(`${SELECT} WHERE m.id = ?`).bind(id).first<Row>();

function eventFor(r: Pick<Row, "title" | "client_name" | "notes" | "start_at" | "duration_min" | "invite_client" | "client_email">): EventBody {
  return {
    summary: `${r.title} · ${r.client_name}`,
    description: [r.notes, "Agendada desde el panel de SD Tech Systems."].filter(Boolean).join("\n\n"),
    start: { dateTime: r.start_at, timeZone: "America/Bogota" },
    end: { dateTime: addMinutesBogota(r.start_at, r.duration_min), timeZone: "America/Bogota" },
    ...(r.invite_client && r.client_email ? { attendees: [{ email: r.client_email }] } : {}),
  };
}

async function withGoogle<T>(env: Env, fn: (token: string) => Promise<T>): Promise<{ value: T | null; googleError: string | null }> {
  const token = await getAccessToken(env);
  if (!token) return { value: null, googleError: "not_connected" };
  try {
    return { value: await fn(token), googleError: null };
  } catch {
    return { value: null, googleError: "google_error" };
  }
}

interface Input {
  clientId?: string;
  projectId?: string | null;
  title?: string;
  start?: string;
  durationMin?: number;
  notes?: string;
  inviteClient?: boolean;
}

const validDuration = (v: unknown) => Number.isInteger(v) && (v as number) >= 15 && (v as number) <= 480;

export const handleMeetings: Handler = async (request, env, session, path) => {
  const db = env.DB;
  const id = path[1] ? decodeURIComponent(path[1]) : null;

  if (request.method === "GET" && !id) {
    const url = new URL(request.url);
    return json({ meetings: await listMeetings(db, { clientId: url.searchParams.get("clientId"), projectId: url.searchParams.get("projectId"), fromDate: url.searchParams.get("from") ?? todayBogota() }) });
  }

  if (request.method === "POST" && !id) {
    const body = await readJson<Input>(request);
    if (body instanceof Response) return body;
    const client = body.clientId ? await db.prepare("SELECT id, name, email FROM clients WHERE id = ?").bind(body.clientId).first<{ id: string; name: string; email: string | null }>() : null;
    if (!client) return error(400, "invalid_client");
    const title = body.title?.trim();
    if (!title) return error(400, "title_required");
    if (!isLocalDateTime(body.start)) return error(400, "invalid_start");
    const duration = body.durationMin ?? 30;
    if (!validDuration(duration)) return error(400, "invalid_duration");
    if (body.inviteClient && !client.email) return error(400, "client_without_email");
    if (body.projectId) {
      const p = await db.prepare("SELECT 1 FROM projects WHERE id = ? AND client_id = ?").bind(body.projectId, client.id).first();
      if (!p) return error(400, "invalid_project");
    }
    const meetingId = crypto.randomUUID();
    const startAt = bogotaInstant(body.start);
    const notes = body.notes?.trim() || null;
    const invite = body.inviteClient === true;
    const ev = eventFor({ title, client_name: client.name, notes, start_at: startAt, duration_min: duration, invite_client: invite ? 1 : 0, client_email: client.email });
    const g = await withGoogle(env, (t) =>
      insertEvent(t, { ...ev, conferenceData: { createRequest: { requestId: meetingId, conferenceSolutionKey: { type: "hangoutsMeet" } } } }, { conference: true, sendUpdates: invite ? "all" : "none" }),
    );
    const t = now();
    await db.batch([
      db
        .prepare("INSERT INTO meetings (id, client_id, project_id, title, start_at, duration_min, notes, invite_client, google_event_id, meet_url, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)")
        .bind(meetingId, client.id, body.projectId ?? null, title, startAt, duration, notes, invite ? 1 : 0, g.value?.id ?? null, g.value?.hangoutLink ?? null, t, t),
      logActivity(db, session.email, "client", client.id, "meeting", { meetingId, title, startAt }),
      ...(body.projectId ? [logActivity(db, session.email, "project", body.projectId, "meeting", { meetingId, title, startAt })] : []),
    ]);
    return json({ meeting: toMeeting((await load(db, meetingId))!), googleError: g.googleError }, 201);
  }

  if (!id) return error(405, "method_not_allowed");
  const row = await load(db, id);
  if (!row) return error(404, "not_found");
  const sendUpdates = row.invite_client ? "all" : "none";

  if (request.method === "DELETE") {
    const g = row.google_event_id ? await withGoogle(env, (t) => deleteEvent(t, row.google_event_id!, sendUpdates)) : { googleError: null };
    await db.batch([
      db.prepare("UPDATE meetings SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(now(), id),
      logActivity(db, session.email, "client", row.client_id, "meeting_cancelled", { meetingId: id, title: row.title }),
    ]);
    return json({ meeting: toMeeting((await load(db, id))!), googleError: g.googleError });
  }

  if (request.method === "PATCH") {
    const body = await readJson<Input>(request);
    if (body instanceof Response) return body;
    if (body.start !== undefined && !isLocalDateTime(body.start)) return error(400, "invalid_start");
    if (body.durationMin !== undefined && !validDuration(body.durationMin)) return error(400, "invalid_duration");
    const next = {
      ...row,
      title: body.title?.trim() || row.title,
      start_at: body.start ? bogotaInstant(body.start) : row.start_at,
      duration_min: body.durationMin ?? row.duration_min,
      notes: body.notes !== undefined ? body.notes.trim() || null : row.notes,
    };
    const g = row.google_event_id ? await withGoogle(env, (t) => patchEvent(t, row.google_event_id!, eventFor(next), sendUpdates)) : { googleError: null };
    await db.batch([
      db.prepare("UPDATE meetings SET title = ?, start_at = ?, duration_min = ?, notes = ?, updated_at = ? WHERE id = ?").bind(next.title, next.start_at, next.duration_min, next.notes, now(), id),
      logActivity(db, session.email, "client", row.client_id, "meeting_updated", { meetingId: id }),
    ]);
    return json({ meeting: toMeeting((await load(db, id))!), googleError: g.googleError });
  }

  return error(405, "method_not_allowed");
};
