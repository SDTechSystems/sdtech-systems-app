import type { Env } from "../env";
import { GoogleError } from "./calendar";
import { getAccessToken, googleStatus } from "./oauth";

const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
export const ROOT_NAME = "SD Tech Systems";
export const CLIENTS_NAME = "Clientes";

/** Google no está conectado, Google revocó la conexión, o falta el permiso de Drive. */
export class DriveNotConnected extends Error {
  constructor() {
    super("drive_not_connected");
  }
}

/** Conectado y con el permiso drive.file. */
export async function driveReady(db: D1Database): Promise<boolean> {
  const s = await googleStatus(db);
  return s.status === "ok" && s.drive;
}

async function token(env: Env): Promise<string> {
  const t = await getAccessToken(env);
  if (!t) throw new DriveNotConnected();
  return t;
}

async function call<T>(env: Env, method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${await token(env)}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new DriveNotConnected();
  if (!res.ok) throw new GoogleError(res.status);
  return (await res.json()) as T;
}

/** Nombre de carpeta: Drive acepta «/» y casi todo; solo se recorta. */
export const folderName = (name: string): string => name.trim().slice(0, 200) || "Sin nombre";

/** La carpeta o archivo existe y no está en la papelera (ni dentro de una carpeta en la papelera). */
async function alive(env: Env, id: string): Promise<boolean> {
  try {
    const f = await call<{ trashed?: boolean }>(env, "GET", `${FILES}/${encodeURIComponent(id)}?fields=id,trashed`);
    return f.trashed !== true;
  } catch (e) {
    if (e instanceof GoogleError && e.status === 404) return false;
    throw e;
  }
}

/** Devuelve `existingId` si sigue viva; si no (o no hay), crea la carpeta `name` dentro de `parentId` (null = Mi unidad). */
export async function ensureFolder(env: Env, name: string, parentId: string | null, existingId?: string | null): Promise<string> {
  if (existingId && (await alive(env, existingId))) return existingId;
  const f = await call<{ id: string }>(env, "POST", `${FILES}?fields=id`, { name: folderName(name), mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) });
  return f.id;
}

interface DriveSettings {
  rootId: string;
  clientsId: string;
}

/** «SD Tech Systems/Clientes»: devuelve el id de «Clientes». Los ids quedan en settings('drive'). */
async function ensureClientsRoot(env: Env): Promise<string> {
  const db = env.DB;
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'drive'").first<{ value: string }>();
  const saved = row ? (JSON.parse(row.value) as Partial<DriveSettings>) : {};
  if (saved.clientsId && (await alive(env, saved.clientsId))) return saved.clientsId;
  const rootId = await ensureFolder(env, ROOT_NAME, null, saved.rootId);
  const clientsId = await ensureFolder(env, CLIENTS_NAME, rootId);
  await db
    .prepare("INSERT INTO settings (key, value) VALUES ('drive', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(JSON.stringify({ rootId, clientsId } satisfies DriveSettings))
    .run();
  return clientsId;
}

export async function ensureClientFolder(env: Env, clientId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT name, drive_folder_id FROM clients WHERE id = ?").bind(clientId).first<{ name: string; drive_folder_id: string | null }>();
  if (!row) throw new Error("client_not_found");
  if (row.drive_folder_id && (await alive(env, row.drive_folder_id))) return row.drive_folder_id;
  const id = await ensureFolder(env, row.name, await ensureClientsRoot(env));
  await env.DB.prepare("UPDATE clients SET drive_folder_id = ? WHERE id = ?").bind(id, clientId).run();
  return id;
}

export async function ensureProjectFolder(env: Env, projectId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT client_id, title, drive_folder_id FROM projects WHERE id = ?")
    .bind(projectId)
    .first<{ client_id: string; title: string; drive_folder_id: string | null }>();
  if (!row) throw new Error("project_not_found");
  if (row.drive_folder_id && (await alive(env, row.drive_folder_id))) return row.drive_folder_id;
  const id = await ensureFolder(env, row.title, await ensureClientFolder(env, row.client_id));
  await env.DB.prepare("UPDATE projects SET drive_folder_id = ? WHERE id = ?").bind(id, projectId).run();
  return id;
}

export interface UploadOptions {
  parentId: string;
  name: string;
  mimeType: string;
  size: number;
  /** Si viene, la subida reemplaza el contenido de ese archivo. */
  fileId?: string;
  /** Origen del navegador que va a subir las partes (CORS de la sesión). */
  origin: string;
}

/** Abre una subida reanudable y devuelve la URL de la sesión (encabezado Location). El Worker nunca recibe el archivo. */
export async function startUpload(env: Env, opts: UploadOptions): Promise<string> {
  const url = opts.fileId ? `${UPLOAD}/${encodeURIComponent(opts.fileId)}?uploadType=resumable` : `${UPLOAD}?uploadType=resumable&fields=id`;
  const res = await fetch(url, {
    method: opts.fileId ? "PATCH" : "POST",
    headers: {
      authorization: `Bearer ${await token(env)}`,
      "content-type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mimeType,
      "X-Upload-Content-Length": String(opts.size),
      Origin: opts.origin,
    },
    body: JSON.stringify(opts.fileId ? { name: opts.name } : { name: opts.name, parents: [opts.parentId] }),
  });
  if (res.status === 401) throw new DriveNotConnected();
  const location = res.headers.get("location");
  if (!res.ok || !location) throw new GoogleError(res.status);
  return location;
}

/** «Cualquiera con el link puede ver». Nunca se comparte con un correo. */
export const shareAnyone = (env: Env, fileId: string) =>
  call<{ id: string }>(env, "POST", `${FILES}/${encodeURIComponent(fileId)}/permissions`, { role: "reader", type: "anyone" });

export const renameFile = (env: Env, id: string, name: string) => call<{ id: string }>(env, "PATCH", `${FILES}/${encodeURIComponent(id)}?fields=id`, { name });

/** Carpetas padre de un archivo, o null si no existe o está en la papelera. */
export async function parentsOf(env: Env, id: string): Promise<string[] | null> {
  try {
    const f = await call<{ trashed?: boolean; parents?: string[] }>(env, "GET", `${FILES}/${encodeURIComponent(id)}?fields=id,trashed,parents`);
    return f.trashed ? null : (f.parents ?? []);
  } catch (e) {
    if (e instanceof GoogleError && e.status === 404) return null;
    throw e;
  }
}

type Ctx = Pick<ExecutionContext, "waitUntil"> | undefined;

/** Trabajo de Drive después de responder: solo con Drive conectado, y sin fallar nunca la petición. */
export async function driveLater(env: Env, ctx: Ctx, job: () => Promise<unknown>): Promise<void> {
  if (!ctx?.waitUntil || !(await driveReady(env.DB))) return;
  ctx.waitUntil(job().catch(() => undefined));
}

/** Crea la carpeta del proyecto recién creado (a mano, o al aprobar la cotización en el panel o el portal). */
export const afterProjectCreated = (env: Env, ctx: Ctx, projectId: string) => driveLater(env, ctx, () => ensureProjectFolder(env, projectId));

/** Renombra en Drive la carpeta o el archivo guardado, si existe. */
export const renameLater = (env: Env, ctx: Ctx, driveId: string | null, name: string) =>
  driveId ? driveLater(env, ctx, () => renameFile(env, driveId, name)) : Promise.resolve();

/** Nombre del PDF anulado: «CC-0003 (anulada).pdf», «REC-0007 (anulado).pdf» (el recibo es masculino, como su marca de agua). */
export const voidedName = (number: string, masculine = false) => `${number} (${masculine ? "anulado" : "anulada"}).pdf`;
