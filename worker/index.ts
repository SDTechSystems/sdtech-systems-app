import { handleClients } from "./api/clients";
import { handleMe } from "./api/me";
import { handleUsers } from "./api/users";
import { authenticate, type Handler } from "./auth/session";
import { ensureSchema } from "./db/migrate";
import type { Env } from "./env";
import { error } from "./http";
import { renderPortalPlaceholder } from "./portal/placeholder";

export const PORTAL_HOST = "clientes.sdtechsystems.dev";

const ADMIN: Record<string, Handler> = {
  me: handleMe,
  users: handleUsers,
  clients: handleClients,
};

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === PORTAL_HOST) {
      if (url.pathname.startsWith("/api/")) return error(404, "not_found");
      if (url.pathname.startsWith("/brand/")) return env.ASSETS.fetch(request);
      return renderPortalPlaceholder();
    }

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
