import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { authUrl, disconnectGoogle, exchangeCode, googleStatus } from "../google/oauth";
import { syncCalendar } from "../google/sync";
import { error, json, now } from "../http";
import { newToken } from "../portal/tokens";

const STATE_TTL_MS = 10 * 60_000;

const failPage = (msg: string) =>
  new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google Calendar</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07111F;color:#F4F8FC;font-family:system-ui;text-align:center;padding:24px"><div><p>${msg}</p><p><a style="color:#00BDE8" href="/ajustes">Volver a Ajustes</a></p></div></body></html>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

/** GET /api/google/connect */
export const handleGoogleConnect: Handler = async (_request, env, session) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.TOKEN_ENC_KEY) return failPage("Faltan los secretos de Google en el Worker.");
  const state = newToken();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE created_at < ?").bind(new Date(Date.now() - STATE_TTL_MS).toISOString()),
    env.DB.prepare("INSERT INTO oauth_states (state, created_at) VALUES (?, ?)").bind(state, now()),
  ]);
  return new Response(null, { status: 302, headers: { location: authUrl(env, state), "cache-control": "no-store" } });
};

/** GET /api/google/callback?code&state */
export const handleGoogleCallback: Handler = async (request, env, session) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const row = await env.DB.prepare("SELECT created_at FROM oauth_states WHERE state = ?").bind(state).first<{ created_at: string }>();
  await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  if (!row || Date.now() - Date.parse(row.created_at) > STATE_TTL_MS || !code) return failPage("No se pudo conectar Google Calendar. Intenta de nuevo desde Ajustes.");
  if (!(await exchangeCode(env, code))) return failPage("Google no aceptó la conexión. Intenta de nuevo desde Ajustes.");
  await logActivity(env.DB, session.email, "settings", "google", "connect").run();
  return new Response(null, { status: 302, headers: { location: "/ajustes?google=ok" } });
};

/** /api/admin/google y /api/admin/google/sync */
export const handleGoogleAdmin: Handler = async (request, env, session, path) => {
  if (request.method === "GET" && !path[1]) return json(await googleStatus(env.DB));
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  if (request.method === "DELETE" && !path[1]) {
    await disconnectGoogle(env.DB);
    await logActivity(env.DB, session.email, "settings", "google", "disconnect").run();
    return json(await googleStatus(env.DB));
  }
  if (request.method === "POST" && path[1] === "sync") return json(await syncCalendar(env));
  return error(405, "method_not_allowed");
};
