import type { DocModel } from "../../shared/docs/model";
import type { Project } from "../../shared/types";
import { ApiError } from "./api";

/** Dónde queda el archivo: la carpeta del proyecto (entrega) o la del documento. */
export type DriveTarget = { type: "delivery"; projectId: string } | { type: "quote" | "collection" | "receipt"; id: string };

/** Tamaño de cada parte: múltiplo de 256 KiB (lo pide Google) y el máximo que acepta el relevo. */
export const CHUNK_SIZE = 8 * 1024 * 1024;
/** Esperas antes de cada reintento después de un error de red. */
export const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

type Deps = { fetch?: typeof fetch; delay?: (ms: number, signal?: AbortSignal) => Promise<void> };
/** Lo que contestó Google a un PUT, venga directo o dentro del sobre del relevo. */
type Reply = { status: number; range: string | null; body: { id?: string } | null };

export class DriveUploadError extends Error {
  constructor(readonly status: number) {
    super(`drive_upload_${status}`);
    this.name = "DriveUploadError";
  }
}

/**
 * Si el PUT directo del navegador a Google falló una vez (CORS), las siguientes subidas de esta
 * sesión van de una por el relevo del Worker.
 */
let relayOnly = false;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/** Un `fetch` que tiró TypeError no llegó a tener respuesta: red caída o CORS. */
const isNetworkError = (e: unknown) => e instanceof TypeError;
/** Vale reintentar: la red, o el relevo/Google contestando 5xx. */
const isRetryable = (e: unknown) => isNetworkError(e) || (e instanceof ApiError && e.status >= 500);

/** «bytes=0-8388607» → 8388608, el primer byte que Google aún no tiene. Sin Range, no tiene nada. */
export function nextOffset(range: string | null): number {
  const m = /^bytes=\d+-(\d+)$/.exec(range?.trim() ?? "");
  return m ? Number(m[1]) + 1 : 0;
}

async function postJson<T>(f: typeof fetch, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await f(path, { method: "POST", credentials: "same-origin", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body), signal });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "unknown_error");
  return data;
}

/** Un PUT a la sesión de Google, directo o por el relevo. `body` null es la consulta de estado. */
async function putChunk(f: typeof fetch, uploadUrl: string, viaRelay: boolean, body: Blob | null, contentRange: string, signal?: AbortSignal): Promise<Reply> {
  const headers = { "content-range": contentRange };
  if (viaRelay) {
    const res = await f(`/api/admin/drive/relay?url=${encodeURIComponent(uploadUrl)}`, { method: "PUT", credentials: "same-origin", headers, body, signal });
    const data = (await res.json().catch(() => ({}))) as Reply & { error?: string };
    if (!res.ok) throw new ApiError(res.status, data.error ?? "unknown_error");
    return data;
  }
  const res = await f(uploadUrl, { method: "PUT", headers, body, signal });
  const done = res.status === 200 || res.status === 201;
  return { status: res.status, range: res.headers.get("range"), body: done ? ((await res.json().catch(() => null)) as Reply["body"]) : null };
}

/**
 * Sube un archivo a Drive por partes de 8 MiB, directo del navegador a Google (o por el relevo si
 * el navegador no puede), sin leerlo entero nunca: cada parte es un `slice`. Si se corta la red,
 * pregunta a Google cuánto tiene y sigue desde ahí, hasta 5 veces seguidas.
 */
export async function uploadToDrive(
  target: DriveTarget,
  file: Blob & { name: string },
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
  deps: Deps = {},
): Promise<{ fileId: string; project?: Project }> {
  const f = deps.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const delay = deps.delay ?? sleep;
  const total = file.size;
  const { uploadUrl } = await postJson<{ uploadUrl: string }>(f, "/api/admin/drive/uploads", { target, name: file.name, mimeType: file.type, size: total }, signal);

  let viaRelay = relayOnly;
  let answered = false;
  let offset = 0;
  let retries = 0;
  let askStatus = false;
  const backoff = async (cause: unknown) => {
    if (retries >= RETRY_DELAYS.length) throw cause;
    await delay(RETRY_DELAYS[retries++], signal);
    askStatus = true;
  };

  onProgress?.(0);
  for (;;) {
    const query = askStatus;
    let reply: Reply;
    try {
      if (askStatus) reply = await putChunk(f, uploadUrl, viaRelay, null, `bytes */${total}`, signal);
      else {
        const end = Math.min(offset + CHUNK_SIZE, total);
        reply = await putChunk(f, uploadUrl, viaRelay, file.slice(offset, end), `bytes ${offset}-${end - 1}/${total}`, signal);
      }
    } catch (e) {
      if (!isRetryable(e)) throw e;
      if (!viaRelay && !answered && isNetworkError(e)) {
        // El navegador no deja hablar directo con Google: esta subida y las que vengan, por el relevo.
        viaRelay = relayOnly = true;
        continue;
      }
      await backoff(e);
      continue;
    }
    answered = true;
    if (reply.status === 308) {
      const next = nextOffset(reply.range);
      const moved = next > offset;
      if (moved) retries = 0;
      offset = next;
      askStatus = false;
      onProgress?.(offset / total);
      // Una parte que Google no guardó en nada cuenta como fallo, para no repetirla sin fin.
      if (!moved && !query) await backoff(new DriveUploadError(308));
      continue;
    }
    if (reply.status === 200 || reply.status === 201) {
      const fileId = reply.body?.id;
      if (!fileId) throw new DriveUploadError(reply.status);
      onProgress?.(1);
      const done = await postJson<{ project?: Project }>(f, "/api/admin/drive/complete", { target, fileId, name: file.name, size: total }, signal);
      return { fileId, ...(done.project ? { project: done.project } : {}) };
    }
    if (reply.status >= 500) {
      await backoff(new DriveUploadError(reply.status));
      continue;
    }
    // 404/410: la sesión de Google venció; otro 4xx: Google no aceptó la subida.
    throw new DriveUploadError(reply.status);
  }
}

/** El nombre en Drive: el del PDF («CC-0003.pdf») y, si ya está anulado, con la marca que el Worker le puso al anularlo. */
export const driveDocName = (model: DocModel, fileName: string): string =>
  model.voided ? fileName.replace(/\.pdf$/, ` (${model.kind === "receipt" ? "anulado" : "anulada"}).pdf`) : fileName;

/** Arma el PDF del documento y lo guarda (o reemplaza) en su carpeta de Drive. */
export async function saveDocToDrive(target: DriveTarget, model: DocModel): Promise<void> {
  // La librería de PDF se carga solo aquí, para no hacer más pesado el panel.
  const { renderPdf, pdfFileName } = await import("../pdf/render");
  const blob = await renderPdf(model);
  await uploadToDrive(target, new File([blob], driveDocName(model, pdfFileName(model)), { type: "application/pdf" }));
}
