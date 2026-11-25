import { handleCatalog } from "./api/catalog";
import { handleClients } from "./api/clients";
import { handleMe } from "./api/me";
import { handlePaymentPlans, handlePayments } from "./api/payments";
import { handlePhases, handleProjects } from "./api/projects";
import { handleQuotes } from "./api/quotes";
import { handleSettings } from "./api/settings";
import { handleUsers } from "./api/users";
import { authenticate, type Handler } from "./auth/session";
import { ensureSchema } from "./db/migrate";
import type { Env } from "./env";
import { error } from "./http";
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
};

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === PORTAL_HOST) return handlePortalHost(request, env, url);

    if (url.pathname.startsWith("/api/admin/")) {
      await ensureSchema(env.DB);
      const session = await authenticate(request, env);
      if (session instanceof Response) return session;
      const path = url.pathname.slice("/api/admin/".length).split("/").filter(Boolean);
      const handler = ADMIN[path[0] ?? ""];
      if (!handler) return error(404, "not_found");
      return handler(request, env, session, path);
    }

    if (url.pathname.startsWith("/api/")) return error(404, "not_found");
    return env.ASSETS.fetch(request);
  },
};

async function handlePortalHost(request: Request, env: Env, url: URL): Promise<Response> {
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
  if (parts[0] === "api") return handlePortalApi(request, env, parts.slice(2));
  if (request.method !== "GET") return error(405, "method_not_allowed");
  return handlePortalPage(env, parts[1] ?? "", parts.slice(2));
}
