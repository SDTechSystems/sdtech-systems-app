import { todayBogota } from "../../shared/dates";
import { requireRole, type Handler } from "../auth/session";
import { error } from "../http";

/** Tablas que no salen en la copia: estados temporales de OAuth. */
const SKIP = new Set(["oauth_states", "_cf_KV", "sqlite_sequence", "d1_migrations"]);

/** GET /api/admin/export — copia completa en JSON, sin el token de Google. */
export const handleExport: Handler = async (request, env, session) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  if (request.method !== "GET") return error(405, "method_not_allowed");
  const db = env.DB;
  const { results } = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{ name: string }>();
  const tables: Record<string, unknown[]> = {};
  for (const { name } of results) {
    if (SKIP.has(name) || name.startsWith("_cf")) continue;
    const sql = name === "settings" ? "SELECT * FROM settings WHERE key != 'google'" : `SELECT * FROM "${name.replace(/"/g, "")}"`;
    tables[name] = (await db.prepare(sql).all()).results;
  }
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, tables }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="sdtech-systems-${todayBogota()}.json"`,
      "cache-control": "no-store",
    },
  });
};
