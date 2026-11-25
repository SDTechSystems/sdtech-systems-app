import { now } from "./http";

/** Devuelve la sentencia para incluirla en el mismo batch del cambio. */
export function logActivity(
  db: D1Database,
  actor: string,
  entityType: string,
  entityId: string,
  action: string,
  detail?: unknown,
): D1PreparedStatement {
  return db
    .prepare("INSERT INTO activity_log (id, at, actor, entity_type, entity_id, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), now(), actor, entityType, entityId, action, detail === undefined ? null : JSON.stringify(detail));
}
