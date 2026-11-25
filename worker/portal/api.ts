import { logActivity } from "../activity";
import type { Env } from "../env";
import { error, json, now, readJson } from "../http";
import { listProjects } from "../projects/repo";
import { approveQuote } from "../quotes/approve";
import { listQuotes, loadQuote } from "../quotes/repo";
import { getSettings } from "../settings";
import { invalidLinkPage } from "./html";
import { renderPortal } from "./page";
import { renderQuoteDocument } from "./quote-doc";
import { findClientByToken, portalUrl } from "./tokens";

const PORTAL_QUOTES = ["sent", "approved", "rejected", "expired"] as const;
export const PORTAL_ACTOR = "cliente (portal)";

/** GET /c/:token y /c/:token/cotizacion/:number */
export async function handlePortalPage(env: Env, token: string, sub: string[]): Promise<Response> {
  const client = await findClientByToken(env.DB, token);
  if (!client) return invalidLinkPage();
  const settings = await getSettings(env.DB);
  const quotes = await listQuotes(env.DB, { clientId: client.id, statuses: [...PORTAL_QUOTES] });

  if (sub[0] === "cotizacion" && sub[1]) {
    const quote = quotes.find((q) => q.number === decodeURIComponent(sub[1]));
    if (!quote) return invalidLinkPage();
    const full = await env.DB.prepare("SELECT name, company, document, city, phone, email FROM clients WHERE id = ?").bind(client.id).first<{
      name: string;
      company: string | null;
      document: string | null;
      city: string | null;
      phone: string | null;
      email: string | null;
    }>();
    return renderQuoteDocument({ quote, client: full!, settings, portalUrl: portalUrl(token) });
  }
  if (sub.length) return invalidLinkPage();

  const projects = await listProjects(env.DB, { clientId: client.id, statuses: ["active", "paused", "delivered"] }, true);
  return renderPortal({ token, client, quotes, projects, settings });
}

/** POST /api/portal/:token/quotes/:id/(approve|reject) */
export async function handlePortalApi(request: Request, env: Env, path: string[]): Promise<Response> {
  const [token, kind, quoteId, action] = path;
  if (request.method !== "POST" || kind !== "quotes" || !quoteId || !["approve", "reject"].includes(action)) return error(404, "not_found");
  const client = await findClientByToken(env.DB, token);
  if (!client) return error(404, "not_found");
  const body = await readJson<{ name?: unknown; comment?: unknown }>(request);
  if (body instanceof Response) return body;
  const quote = await loadQuote(env.DB, decodeURIComponent(quoteId));
  if (!quote || quote.clientId !== client.id || quote.status === "draft") return error(404, "not_found");
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) || undefined : undefined;

  if (action === "approve") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 80) return error(400, "name_required");
    const result = await approveQuote(env.DB, quote.id, { by: "client", actor: PORTAL_ACTOR, name, comment });
    return result instanceof Response ? result : json({ ok: true });
  }

  if (quote.status !== "sent") return error(409, "not_rejectable");
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE quotes SET status = 'rejected', client_comment = ?, updated_at = ? WHERE id = ? AND status = 'sent'").bind(comment ?? null, t, quote.id),
    logActivity(env.DB, PORTAL_ACTOR, "quote", quote.id, "reject", { comment: comment ?? null }),
  ]);
  return json({ ok: true });
}
