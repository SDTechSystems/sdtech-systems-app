import type { Env } from "../env";
import { now } from "../http";
import { decryptToken, encryptToken } from "./crypto";

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_REDIRECT = "https://panel.sdtechsystems.dev/api/google/callback";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type GoogleStatusValue = "disconnected" | "ok" | "reconnect";
interface Stored {
  refreshToken: string;
  connectedAt: string;
  status: "ok" | "reconnect";
}

let cache: { token: string; expiresAt: number } | null = null;
/** Solo para pruebas. */
export const resetTokenCache = () => {
  cache = null;
};

async function readStored(db: D1Database): Promise<Stored | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'google'").first<{ value: string }>();
  return row ? (JSON.parse(row.value) as Stored) : null;
}
const writeStored = (db: D1Database, s: Stored) =>
  db.prepare("INSERT INTO settings (key, value) VALUES ('google', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(s)).run();

export async function googleStatus(db: D1Database): Promise<{ status: GoogleStatusValue; connectedAt: string | null }> {
  const s = await readStored(db);
  return s ? { status: s.status, connectedAt: s.connectedAt } : { status: "disconnected", connectedAt: null };
}

export function authUrl(env: Env, state: string): string {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: GOOGLE_REDIRECT,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Cambia el código de Google por tokens y guarda el refresh token cifrado. */
export async function exchangeCode(env: Env, code: string): Promise<boolean> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: GOOGLE_REDIRECT,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { access_token?: string; expires_in?: number; refresh_token?: string };
  if (!data.refresh_token || !env.TOKEN_ENC_KEY) return false;
  await writeStored(env.DB, { refreshToken: await encryptToken(data.refresh_token, env.TOKEN_ENC_KEY), connectedAt: now(), status: "ok" });
  if (data.access_token) cache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return true;
}

/** Access token vigente, o null si no hay conexión o Google la revocó (queda en "reconnect"). */
export async function getAccessToken(env: Env): Promise<string | null> {
  if (cache && cache.expiresAt - 60_000 > Date.now()) return cache.token;
  const stored = await readStored(env.DB);
  if (!stored || stored.status !== "ok" || !env.TOKEN_ENC_KEY) return null;
  let refresh: string;
  try {
    refresh = await decryptToken(stored.refreshToken, env.TOKEN_ENC_KEY);
  } catch {
    await writeStored(env.DB, { ...stored, status: "reconnect" });
    return null;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID ?? "", client_secret: env.GOOGLE_CLIENT_SECRET ?? "", refresh_token: refresh, grant_type: "refresh_token" }).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) {
    if (data.error === "invalid_grant") await writeStored(env.DB, { ...stored, status: "reconnect" });
    return null;
  }
  cache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cache.token;
}

/** Borra del calendario los eventos que la app creó (no las reuniones) y olvida la conexión. */
export async function disconnectGoogle(env: Env): Promise<void> {
  const token = await getAccessToken(env).catch(() => null);
  if (token) {
    const { results } = await env.DB.prepare("SELECT google_event_id FROM calendar_links").all<{ google_event_id: string }>();
    for (const l of results) {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(l.google_event_id)}?sendUpdates=none`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  }
  cache = null;
  await env.DB.batch([env.DB.prepare("DELETE FROM settings WHERE key = 'google'"), env.DB.prepare("DELETE FROM calendar_links")]);
}
