import type { TemplateKey } from "../../shared/templates";
import { DEFAULT_TEMPLATES } from "../../shared/templates";
import { logActivity } from "../activity";
import type { Handler } from "../auth/session";
import { error, json, readJson } from "../http";

const ENTITY_TABLE = { project: "projects", quote: "quotes", client: "clients" } as const;
const MONEY_KINDS: TemplateKey[] = ["payment", "subscription", "quote"];

/** POST /api/admin/reminders — deja constancia de un mensaje de WhatsApp enviado. */
export const handleReminders: Handler = async (request, env, session) => {
  if (request.method !== "POST") return error(405, "method_not_allowed");
  const body = await readJson<{ entityType?: string; entityId?: string; kind?: TemplateKey }>(request);
  if (body instanceof Response) return body;
  if (!body.kind || !(body.kind in DEFAULT_TEMPLATES)) return error(400, "invalid_kind");
  if (MONEY_KINDS.includes(body.kind) && session.role !== "owner") return error(403, "forbidden");
  const db = env.DB;
  const id = body.entityId ?? "";

  if (body.entityType === "payment_plan") {
    const plan = await db.prepare("SELECT project_id FROM payment_plans WHERE id = ?").bind(id).first<{ project_id: string }>();
    if (!plan) return error(404, "not_found");
    await logActivity(db, session.email, "project", plan.project_id, "reminder", { kind: body.kind, planId: id }).run();
    return json({ ok: true }, 201);
  }
  const table = ENTITY_TABLE[body.entityType as keyof typeof ENTITY_TABLE];
  if (!table) return error(400, "invalid_entity");
  const exists = await db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).bind(id).first();
  if (!exists) return error(404, "not_found");
  await logActivity(db, session.email, body.entityType!, id, "reminder", { kind: body.kind }).run();
  return json({ ok: true }, 201);
};
