import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { error, json, readJson } from "../http";
import { activeToken, ensureToken, portalUrl } from "../portal/tokens";

/** /api/admin/clients/:id/portal-link */
export const handlePortalLink: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const clientId = decodeURIComponent(path[1]);
  const client = await env.DB.prepare("SELECT id FROM clients WHERE id = ?").bind(clientId).first();
  if (!client) return error(404, "not_found");

  if (request.method === "GET") {
    const token = await activeToken(env.DB, clientId);
    return json({ url: token ? portalUrl(token) : null });
  }
  if (request.method === "POST") {
    const body = await readJson<{ regenerate?: boolean }>(request);
    if (body instanceof Response) return body;
    const before = await activeToken(env.DB, clientId);
    const token = await ensureToken(env.DB, clientId, body.regenerate === true);
    if (token !== before) await logActivity(env.DB, session.email, "client", clientId, before ? "portal_link_regenerated" : "portal_link_created").run();
    return json({ url: portalUrl(token) });
  }
  return error(405, "method_not_allowed");
};
