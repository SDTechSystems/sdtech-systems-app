import { PORTAL_HOST } from "../../shared/docs/model";
import { now } from "../http";

export const PORTAL_ORIGIN = `https://${PORTAL_HOST}`;

/** 32 bytes aleatorios en base64url (43 caracteres). */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const portalUrl = (token: string): string => `${PORTAL_ORIGIN}/c/${token}`;

export async function findClientByToken(db: D1Database, token: string): Promise<{ id: string; name: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return db
    .prepare("SELECT c.id, c.name FROM portal_tokens t JOIN clients c ON c.id = t.client_id WHERE t.token = ? AND t.revoked_at IS NULL")
    .bind(token)
    .first<{ id: string; name: string }>();
}

export async function activeToken(db: D1Database, clientId: string): Promise<string | null> {
  const row = await db.prepare("SELECT token FROM portal_tokens WHERE client_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(clientId).first<{ token: string }>();
  return row?.token ?? null;
}

/** Devuelve el token activo, o crea uno. Con regenerate, revoca el anterior. */
export async function ensureToken(db: D1Database, clientId: string, regenerate = false): Promise<string> {
  const current = await activeToken(db, clientId);
  if (current && !regenerate) return current;
  const token = newToken();
  const t = now();
  await db.batch([
    db.prepare("UPDATE portal_tokens SET revoked_at = ? WHERE client_id = ? AND revoked_at IS NULL").bind(t, clientId),
    db.prepare("INSERT INTO portal_tokens (token, client_id, created_at) VALUES (?, ?, ?)").bind(token, clientId, t),
  ]);
  return token;
}
