import { handleCatalog } from "./api/catalog";
import { handleClients } from "./api/clients";
import { handleGoogleAdmin, handleGoogleCallback, handleGoogleConnect } from "./api/google";
import { handleMe } from "./api/me";
import { handleChanges } from "./api/changes";
import { handleMeetings } from "./api/meetings";
import { handlePending } from "./api/pending";
import { handleReminders } from "./api/reminders";
import { handlePaymentPlans, handlePayments } from "./api/payments";
import { handlePhases, handleProjects } from "./api/projects";
import { handleQuotes } from "./api/quotes";
import { handleSettings } from "./api/settings";
import { handleUsers } from "./api/users";
import { authenticate, type Handler } from "./auth/session";
import { ensureSchema } from "./db/migrate";
import type { Env } from "./env";
import { error } from "./http";
import { syncCalendar } from "./google/sync";
import { handlePortalApi, handlePortalPage } from "./portal/api";
import { homePage } from "./portal/html";

const PORTAL_HOST = "clientes.sdtechsystems.dev";

const ADMIN: Record<string, Handler> = {
  me: handleMe,
  users: handleUsers,
  clients: handleClients,
  catalog: handleCatalog,
  settings: handleSettings,
  quotes: handleQuotes,
  projects: handleProjects,
  phases: handlePhases,
  "payment-plans": handlePaymentPlans,
  payments: handlePayments,
  reminders: handleReminders,
  pending: handlePending,
  google: handleGoogleAdmin,
  meetings: handleMeetings,
  changes: handleChanges,
};

/** Cambios del panel que mueven fechas del calendario. */
const CALENDAR_SOURCES = new Set(["projects", "phases", "payment-plans", "payments", "quotes", "changes"]);

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        await ensureSchema(env.DB);
        await syncCalendar(env);
      })().catch(() => undefined),
    );
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === PORTAL_HOST) return handlePortalHost(request, env, url, ctx);

    if (url.pathname.startsWith("/api/admin/")) {
      await ensureSchema(env.DB);
      const session = await authenticate(request, env);
      if (session instanceof Response) return session;
      const path = url.pathname.slice("/api/admin/".length).split("/").filter(Boolean);
      const handler = ADMIN[path[0] ?? ""];
      if (!handler) return error(404, "not_found");
      const response = await handler(request, env, session, path);
      if (request.method !== "GET" && response.ok && CALENDAR_SOURCES.has(path[0])) ctx.waitUntil?.(syncCalendar(env).catch(() => undefined));
      return response;
    }

    if (url.pathname === "/api/google/connect" || url.pathname === "/api/google/callback") {
      await ensureSchema(env.DB);
      const session = await authenticate(request, env);
      if (session instanceof Response) return session;
      const handler = url.pathname.endsWith("connect") ? handleGoogleConnect : handleGoogleCallback;
      return handler(request, env, session, []);
    }

    if (url.pathname.startsWith("/api/")) return error(404, "not_found");
    return env.ASSETS.fetch(request);
  },
};

async function handlePortalHost(request: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
  const p = url.pathname;
  if (p.startsWith("/brand/") || p.startsWith("/fonts/") || p === "/favicon.ico") return env.ASSETS.fetch(request);
  const isPortal = p.startsWith("/c/") || p.startsWith("/api/portal/");
  if (!isPortal) return p.startsWith("/api/") ? error(404, "not_found") : homePage();

  if (env.PORTAL_LIMIT) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.PORTAL_LIMIT.limit({ key: ip });
    if (!success) return error(429, "too_many_requests");
  }
  await ensureSchema(env.DB);
  const parts = p.split("/").filter(Boolean);
  if (parts[0] === "api") {
    const response = await handlePortalApi(request, env, parts.slice(2));
    if (response.ok) ctx.waitUntil?.(syncCalendar(env).catch(() => undefined));
    return response;
  }
  if (request.method !== "GET") return error(405, "method_not_allowed");
  return handlePortalPage(env, parts[1] ?? "", parts.slice(2));
}
