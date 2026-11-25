import { logActivity } from "../activity";
import type { Env } from "../env";
import { error, json, now, readJson } from "../http";
import { loadPayments } from "../payments/repo";
import { decideCostChange, listChanges, loadChange } from "../changes/repo";
import { listProjects } from "../projects/repo";
import { listMeetings } from "../api/meetings";
import { todayBogota } from "../../shared/dates";
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
  const payments = Object.fromEntries(await Promise.all(projects.map(async (p) => [p.id, await loadPayments(env.DB, p.id)] as const)));
  const changes = Object.fromEntries(await Promise.all(projects.map(async (p) => [p.id, await listChanges(env.DB, p.id)] as const)));
  const meetings = await listMeetings(env.DB, { clientId: client.id, fromDate: todayBogota() });
  return renderPortal({ token, client, quotes, projects, payments, changes, meetings, settings });
}

/** POST /api/portal/:token/(quotes/:id/(approve|reject) | projects/:id/adjustments | changes/:id/(approve|reject)) */
export async function handlePortalApi(request: Request, env: Env, path: string[]): Promise<Response> {
  const [token, kind, quoteId, action] = path;
  if (request.method !== "POST" || !quoteId) return error(404, "not_found");
  const client = await findClientByToken(env.DB, token);
  if (!client) return error(404, "not_found");
  if (kind === "projects" && action === "adjustments") return requestAdjustment(request, env, client, decodeURIComponent(quoteId));
  if (kind === "changes" && (action === "approve" || action === "reject")) return decideChange(request, env, client, decodeURIComponent(quoteId), action === "approve");
  if (kind !== "quotes" || !["approve", "reject"].includes(action)) return error(404, "not_found");
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

async function projectOfClient(db: D1Database, projectId: string, clientId: string) {
  return db.prepare("SELECT id, title, currency FROM projects WHERE id = ? AND client_id = ?").bind(projectId, clientId).first<{ id: string; title: string; currency: string | null }>();
}

async function requestAdjustment(request: Request, env: Env, client: { id: string; name: string }, projectId: string): Promise<Response> {
  const project = await projectOfClient(env.DB, projectId, client.id);
  if (!project) return error(404, "not_found");
  const body = await readJson<{ text?: unknown }>(request);
  if (body instanceof Response) return body;
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
  if (text.length < 3) return error(400, "text_required");
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO change_requests (id, project_id, kind, description, status, requested_by, created_at) VALUES (?, ?, 'adjustment', ?, 'pending', 'client', ?)").bind(id, projectId, text, now()),
    logActivity(env.DB, PORTAL_ACTOR, "project", projectId, "adjustment_requested", { changeId: id, description: text }),
  ]);
  return json({ ok: true }, 201);
}

async function decideChange(request: Request, env: Env, client: { id: string; name: string }, changeId: string, approve: boolean): Promise<Response> {
  const change = await loadChange(env.DB, changeId);
  if (!change || change.kind !== "cost") return error(404, "not_found");
  const project = await projectOfClient(env.DB, change.projectId, client.id);
  if (!project) return error(404, "not_found");
  const body = await readJson<{ name?: unknown; comment?: unknown }>(request);
  if (body instanceof Response) return body;
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) || null : null;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (approve && (name.length < 2 || name.length > 80)) return error(400, "name_required");
  const ok = await decideCostChange(env.DB, change, { approve, by: "client", name: approve ? name : null, comment, currency: project.currency ?? "COP", at: now() });
  if (!ok) return error(409, "already_decided");
  await logActivity(env.DB, PORTAL_ACTOR, "project", change.projectId, approve ? "change_approved" : "change_rejected", {
    changeId,
    description: change.description,
    amount: change.amount,
    name: approve ? name : null,
    comment,
  }).run();
  return json({ ok: true });
}
