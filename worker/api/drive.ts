import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import type { Env } from "../env";
import { GoogleError } from "../google/calendar";
import { DriveNotConnected, driveReady, ensureClientFolder, ensureProjectFolder, parentsOf, shareAnyone, startUpload } from "../google/drive";
import { error, json, now, readJson } from "../http";
import { loadProject } from "../projects/repo";

export const PANEL_ORIGIN = "https://panel.sdtechsystems.dev";
/** Tamaño máximo de una parte que pasa por el relevo (el plan gratis limita el cuerpo de la petición). */
export const RELAY_MAX_CHUNK = 8 * 1024 * 1024;

const DOCS = { quote: "quotes", collection: "collections", receipt: "invoices" } as const;
type DocType = keyof typeof DOCS;
type Target = { type: "delivery"; projectId: string } | { type: DocType; id: string };

const fileLink = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const folderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;
const DRIVE_ID = /^[\w-]{1,200}$/;

function parseTarget(t: unknown): Target | null {
  const v = (t ?? {}) as Record<string, unknown>;
  if (v.type === "delivery" && typeof v.projectId === "string" && v.projectId) return { type: "delivery", projectId: v.projectId };
  if (typeof v.type === "string" && v.type in DOCS && typeof v.id === "string" && v.id) return { type: v.type as DocType, id: v.id };
  return null;
}

const cleanName = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
const validSize = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

/** El origen del panel para la sesión de subida (el navegador sube las partes desde ahí). */
function panelOrigin(request: Request): string {
  const o = request.headers.get("origin");
  try {
    if (o && new URL(o).hostname === new URL(PANEL_ORIGIN).hostname) return o;
  } catch {
    /* origen raro: se usa el del panel */
  }
  return PANEL_ORIGIN;
}

/** Carpeta de destino y archivo a reemplazar, o null si el destino no existe. */
async function resolveTarget(env: Env, target: Target): Promise<{ folderId: string; fileId: string | null } | null> {
  const db = env.DB;
  if (target.type === "delivery") {
    if (!(await db.prepare("SELECT 1 FROM projects WHERE id = ?").bind(target.projectId).first())) return null;
    return { folderId: await ensureProjectFolder(env, target.projectId), fileId: null };
  }
  const row = await db
    .prepare(`SELECT project_id, client_id, drive_file_id FROM ${DOCS[target.type]} WHERE id = ?`)
    .bind(target.id)
    .first<{ project_id: string | null; client_id: string; drive_file_id: string | null }>();
  if (!row) return null;
  const folderId = row.project_id ? await ensureProjectFolder(env, row.project_id) : await ensureClientFolder(env, row.client_id);
  return { folderId, fileId: row.drive_file_id };
}

async function openUpload(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ target?: unknown; name?: unknown; mimeType?: unknown; size?: unknown }>(request);
  if (body instanceof Response) return body;
  const target = parseTarget(body.target);
  if (!target) return error(400, "invalid_target");
  const name = cleanName(body.name);
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim() || "application/octet-stream" : null;
  if (!name || !mimeType || !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType) || !validSize(body.size)) return error(400, "invalid_file");
  if (target.type !== "delivery" && mimeType !== "application/pdf") return error(400, "invalid_file");
  const dest = await resolveTarget(env, target);
  if (!dest) return error(400, "invalid_target");
  const opts = { parentId: dest.folderId, name, mimeType, size: body.size, origin: panelOrigin(request) };
  let uploadUrl: string;
  try {
    uploadUrl = await startUpload(env, { ...opts, fileId: dest.fileId ?? undefined });
  } catch (e) {
    // El archivo guardado ya no existe en Drive: se sube uno nuevo en la carpeta.
    if (!(dest.fileId && e instanceof GoogleError && e.status === 404)) throw e;
    uploadUrl = await startUpload(env, opts);
  }
  return json({ uploadUrl });
}

async function completeUpload(request: Request, env: Env, actor: string): Promise<Response> {
  const body = await readJson<{ target?: unknown; fileId?: unknown; name?: unknown; size?: unknown }>(request);
  if (body instanceof Response) return body;
  const target = parseTarget(body.target);
  if (!target) return error(400, "invalid_target");
  const fileId = typeof body.fileId === "string" && DRIVE_ID.test(body.fileId) ? body.fileId : null;
  const name = cleanName(body.name);
  if (!fileId || !name || (body.size !== undefined && body.size !== null && !validSize(body.size))) return error(400, "invalid_file");
  const db = env.DB;

  if (target.type !== "delivery") {
    const table = DOCS[target.type];
    // La carpeta esperada: la del proyecto, o la del cliente si es una cotización sin proyecto (no se crea aquí).
    const doc = await db
      .prepare(
        `SELECT COALESCE(p.drive_folder_id, CASE WHEN d.project_id IS NULL THEN c.drive_folder_id END) AS folder FROM ${table} d LEFT JOIN projects p ON p.id = d.project_id LEFT JOIN clients c ON c.id = d.client_id WHERE d.id = ?`,
      )
      .bind(target.id)
      .first<{ folder: string | null }>();
    if (!doc) return error(400, "invalid_target");
    const parents = doc.folder ? await parentsOf(env, fileId) : null;
    if (!doc.folder || !parents?.includes(doc.folder)) return error(400, "invalid_file");
    await db.prepare(`UPDATE ${table} SET drive_file_id = ? WHERE id = ?`).bind(fileId, target.id).run();
    return json({ ok: true });
  }

  const pid = target.projectId;
  const project = await db.prepare("SELECT drive_folder_id FROM projects WHERE id = ?").bind(pid).first<{ drive_folder_id: string | null }>();
  if (!project) return error(400, "invalid_target");
  const folderId = project.drive_folder_id;
  // Solo se comparte lo que quedó dentro de la carpeta del proyecto (nunca la raíz, «Clientes» ni la del cliente).
  const parents = folderId ? await parentsOf(env, fileId) : null;
  if (!folderId || !parents?.includes(folderId)) return error(400, "invalid_file");

  const size = validSize(body.size) ? body.size : null;
  await db.prepare("INSERT OR IGNORE INTO project_files (id, project_id, drive_file_id, name, size, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), pid, fileId, name, size, now()).run();
  await shareAnyone(env, fileId);
  const count = (await db.prepare("SELECT COUNT(*) AS n FROM project_files WHERE project_id = ?").bind(pid).first<{ n: number }>())!.n;
  let link = fileLink(fileId);
  if (count >= 2) {
    await shareAnyone(env, folderId);
    link = folderLink(folderId);
  }
  await db.batch([
    db.prepare("UPDATE projects SET delivery_url = ?, updated_at = ? WHERE id = ?").bind(link, now(), pid),
    logActivity(db, actor, "project", pid, "drive_upload", { name, size, link }),
  ]);
  return json({ project: await loadProject(db, pid, true) });
}

/** Lleva una parte de la subida a la sesión de Google sin guardarla: el cuerpo pasa como stream. */
async function relayChunk(request: Request): Promise<Response> {
  let target: URL;
  try {
    target = new URL(new URL(request.url).searchParams.get("url") ?? "");
  } catch {
    return error(400, "invalid_url");
  }
  if (target.protocol !== "https:" || target.host !== "www.googleapis.com" || target.username || target.password || !target.pathname.startsWith("/upload/drive/v3/")) {
    return error(400, "invalid_url");
  }
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader === null || !/^\d+$/.test(lengthHeader)) return error(411, "length_required");
  const length = Number(lengthHeader);
  if (length > RELAY_MAX_CHUNK) return error(413, "chunk_too_large");
  const headers: Record<string, string> = { "content-length": lengthHeader };
  const range = request.headers.get("content-range");
  if (range) headers["content-range"] = range;
  // FixedLengthStream (solo en Workers) asegura que Google reciba Content-Length en vez de chunked.
  const body = !request.body || length === 0 ? undefined : typeof FixedLengthStream === "function" ? request.body.pipeThrough(new FixedLengthStream(length)) : request.body;
  let res: Response;
  try {
    res = await fetch(target.toString(), { method: "PUT", headers, body, redirect: "manual" });
  } catch {
    return error(502, "drive_error");
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return json({ status: res.status, range: res.headers.get("range"), body: parsed });
}

/** GET /api/admin/projects/:id/files */
export const handleProjectFiles: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  if (request.method !== "GET") return error(405, "method_not_allowed");
  if (!(await driveReady(env.DB))) return error(409, "drive_not_connected");
  const pid = decodeURIComponent(path[1]);
  if (!(await env.DB.prepare("SELECT 1 FROM projects WHERE id = ?").bind(pid).first())) return error(404, "not_found");
  const { results } = await env.DB.prepare("SELECT id, drive_file_id, name, size, created_at FROM project_files WHERE project_id = ? ORDER BY created_at, rowid")
    .bind(pid)
    .all<{ id: string; drive_file_id: string; name: string; size: number | null; created_at: string }>();
  return json({ files: results.map((f) => ({ id: f.id, driveFileId: f.drive_file_id, name: f.name, size: f.size, createdAt: f.created_at, url: fileLink(f.drive_file_id) })) });
};

const METHODS: Record<string, string> = { uploads: "POST", complete: "POST", relay: "PUT" };

/** /api/admin/drive/(uploads | complete | relay) — solo el dueño. */
export const handleDrive: Handler = async (request, env, session, path) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;
  const sub = path[1] ?? "";
  if (!Object.hasOwn(METHODS, sub)) return error(404, "not_found");
  if (request.method !== METHODS[sub]) return error(405, "method_not_allowed");
  if (!(await driveReady(env.DB))) return error(409, "drive_not_connected");
  try {
    if (sub === "relay") return await relayChunk(request);
    if (sub === "uploads") return await openUpload(request, env);
    return await completeUpload(request, env, session.email);
  } catch (e) {
    if (e instanceof DriveNotConnected) return error(409, "drive_not_connected");
    if (e instanceof GoogleError) return error(502, "drive_error");
    throw e;
  }
};
