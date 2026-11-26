import { normalizePhone } from "../../shared/phone";
import { searchKey } from "../../shared/text";
import type { ActivityEntry, Client } from "../../shared/types";
import { logActivity } from "../activity";
import type { Handler } from "../auth/session";
import { error, json, now, readJson } from "../http";
import { handlePortalLink } from "./portal-links";
import { folderName, renameLater } from "../google/drive";

interface ClientRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  city: string | null;
  company: string | null;
  notes: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, name, phone, email, document, city, company, notes, archived, created_at, updated_at";
const TEXT_FIELDS = ["document", "city", "company", "notes"] as const;

const toClient = (r: ClientRow): Client => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  email: r.email,
  document: r.document,
  city: r.city,
  company: r.company,
  notes: r.notes,
  archived: r.archived === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const clean = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

type ClientInput = Partial<Record<"name" | "phone" | "email" | "document" | "city" | "company" | "notes", string>> & { archived?: boolean };

/** Valida y normaliza los campos presentes. Devuelve un Response de error o los valores limpios. */
function validate(body: ClientInput, requireName: boolean): Partial<Client> | Response {
  const out: Partial<Client> = {};
  if (requireName || "name" in body) {
    const name = clean(body.name);
    if (!name) return error(400, "name_required");
    out.name = name;
  }
  if ("phone" in body) {
    const raw = clean(body.phone);
    if (raw) {
      const phone = normalizePhone(raw);
      if (!phone) return error(400, "invalid_phone");
      out.phone = phone;
    } else out.phone = null;
  }
  if ("email" in body) {
    const email = clean(body.email)?.toLowerCase() ?? null;
    if (email && !email.includes("@")) return error(400, "invalid_email");
    out.email = email;
  }
  for (const f of TEXT_FIELDS) if (f in body) out[f] = clean(body[f]);
  if ("archived" in body) out.archived = body.archived === true;
  return out;
}

const searchTextOf = (c: Pick<Client, "name" | "company" | "phone" | "email" | "document" | "city">) =>
  searchKey(c.name, c.company, c.phone, c.email, c.document, c.city);

async function load(db: D1Database, id: string): Promise<Client | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM clients WHERE id = ?`).bind(id).first<ClientRow>();
  return row ? toClient(row) : null;
}

export const handleClients: Handler = async (request, env, session, path, ctx) => {
  if (path[2] === "portal-link") return handlePortalLink(request, env, session, path);
  const db = env.DB;
  const id = path[1] ? decodeURIComponent(path[1]) : null;

  if (request.method === "GET" && !id) {
    const url = new URL(request.url);
    const archived = url.searchParams.get("archived") === "1" ? 1 : 0;
    const q = searchKey(url.searchParams.get("q"));
    const { results } = await db
      .prepare(`SELECT ${COLUMNS} FROM clients WHERE archived = ? AND search_text LIKE ? ORDER BY name COLLATE NOCASE`)
      .bind(archived, `%${q}%`)
      .all<ClientRow>();
    return json({ clients: results.map(toClient) });
  }

  if (request.method === "GET" && id) {
    const client = await load(db, id);
    if (!client) return error(404, "not_found");
    const { results } = await db
      .prepare("SELECT at, actor, action, detail FROM activity_log WHERE entity_type = 'client' AND entity_id = ? ORDER BY at DESC, rowid DESC LIMIT 50")
      .bind(id)
      .all<{ at: string; actor: string; action: string; detail: string | null }>();
    const activity: ActivityEntry[] = results.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
    return json({ client, activity });
  }

  if (request.method === "POST" && !id) {
    const body = await readJson<ClientInput>(request);
    if (body instanceof Response) return body;
    const v = validate(body, true);
    if (v instanceof Response) return v;
    const t = now();
    const client: Client = {
      id: crypto.randomUUID(),
      name: v.name!,
      phone: v.phone ?? null,
      email: v.email ?? null,
      document: v.document ?? null,
      city: v.city ?? null,
      company: v.company ?? null,
      notes: v.notes ?? null,
      archived: false,
      createdAt: t,
      updatedAt: t,
    };
    await db.batch([
      db
        .prepare("INSERT INTO clients (id, name, phone, email, document, city, company, notes, search_text, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)")
        .bind(client.id, client.name, client.phone, client.email, client.document, client.city, client.company, client.notes, searchTextOf(client), t, t),
      logActivity(db, session.email, "client", client.id, "create", { name: client.name }),
    ]);
    return json({ client }, 201);
  }

  if (request.method === "PATCH" && id) {
    const body = await readJson<ClientInput>(request);
    if (body instanceof Response) return body;
    const current = await load(db, id);
    if (!current) return error(404, "not_found");
    const v = validate(body, false);
    if (v instanceof Response) return v;
    const next: Client = { ...current, ...v, updatedAt: now() };
    const changed = Object.keys(v).filter((k) => v[k as keyof Client] !== current[k as keyof Client]);
    await db.batch([
      db
        .prepare("UPDATE clients SET name = ?, phone = ?, email = ?, document = ?, city = ?, company = ?, notes = ?, search_text = ?, archived = ?, updated_at = ? WHERE id = ?")
        .bind(next.name, next.phone, next.email, next.document, next.city, next.company, next.notes, searchTextOf(next), next.archived ? 1 : 0, next.updatedAt, id),
      logActivity(db, session.email, "client", id, "update", { fields: changed }),
    ]);
    if (next.name !== current.name) {
      const folder = await db.prepare("SELECT drive_folder_id AS f FROM clients WHERE id = ?").bind(id).first<{ f: string | null }>();
      await renameLater(env, ctx, folder?.f ?? null, folderName(next.name));
    }
    return json({ client: next });
  }

  return error(405, "method_not_allowed");
};
