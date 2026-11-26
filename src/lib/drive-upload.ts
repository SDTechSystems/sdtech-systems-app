import type { DocModel } from "../../shared/docs/model";
import type { Project } from "../../shared/types";
import { ApiError, apiFetch, jsonInit } from "./api";

/** Dónde queda el archivo: la carpeta del proyecto (entrega) o la del documento. */
export type DriveTarget = { type: "delivery"; projectId: string } | { type: "quote" | "collection" | "receipt"; id: string };

/** Tamaño de cada parte: múltiplo de 256 KiB (lo pide Google) y el máximo que acepta el relevo. */
export const CHUNK_SIZE = 8 * 1024 * 1024;
/** Esperas antes de cada reintento después de un error de red. */
export const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

export type UploadOptions = {
  fetch?: typeof fetch;
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** La sesión de una subida que se cortó («Reintentar»): se pregunta a Google y se sigue desde ahí. */
  resume?: DriveSession;
};
/** Una subida en curso: la sesión de Google, los bytes que ya tiene y, si ya terminó, el id del archivo. */
export type DriveSession = { uploadUrl: string; offset: number; fileId?: string };
/** Lo que contestó Google a un PUT, venga directo o dentro del sobre del relevo. */
type Reply = { status: number; range: string | null; body: { id?: string } | null };

export class DriveUploadError extends Error {
  constructor(readonly status: number) {
    super(`drive_upload_${status}`);
    this.name = "DriveUploadError";
  }
}

/** La subida se detuvo con la sesión de Google abierta: `session` sirve para retomarla. `reason` es el error real. */
export class DriveUploadInterrupted extends Error {
  constructor(
    readonly reason: unknown,
    readonly session: DriveSession,
  ) {
    super(reason instanceof Error ? reason.message : "drive_upload_interrupted");
    this.name = "DriveUploadInterrupted";
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
/** Vale reintentar: la red, o el panel/relevo contestando 5xx. */
const isRetryable = (e: unknown) => isNetworkError(e) || (e instanceof ApiError && e.status >= 500);

/** «bytes=0-8388607» → 8388608, el primer byte que Google aún no tiene. Sin Range, no tiene nada. */
export function nextOffset(range: string | null): number {
  const m = /^bytes=\d+-(\d+)$/.exec(range?.trim() ?? "");
  return m ? Number(m[1]) + 1 : 0;
}

/** Un PUT a la sesión de Google, directo o por el relevo. `body` null es la consulta de estado. */
async function putChunk(f: typeof fetch | undefined, uploadUrl: string, viaRelay: boolean, body: Blob | null, contentRange: string, signal?: AbortSignal): Promise<Reply> {
  const init: RequestInit = { method: "PUT", headers: { "content-range": contentRange }, body, signal };
  if (viaRelay) return apiFetch<Reply>(`/api/admin/drive/relay?url=${encodeURIComponent(uploadUrl)}`, init, f);
  const res = await (f ? f(uploadUrl, init) : fetch(uploadUrl, init));
  const done = res.status === 200 || res.status === 201;
  return { status: res.status, range: res.headers.get("range"), body: done ? ((await res.json().catch(() => null)) as Reply["body"]) : null };
}

/**
 * Sube un archivo a Drive por partes de 8 MiB, directo del navegador a Google (o por el relevo si
 * el navegador no puede), sin leerlo entero nunca: cada parte es un `slice`. Si se corta la red,
 * pregunta a Google cuánto tiene y sigue desde ahí, hasta 5 veces seguidas; después rechaza con
 * `DriveUploadInterrupted`, cuya `session` se pasa en `resume` para seguir en la misma sesión.
 */
export async function uploadToDrive(
  target: DriveTarget,
  file: Blob & { name: string },
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
  opts: UploadOptions = {},
): Promise<{ fileId: string; project?: Project }> {
  const f = opts.fetch;
  const delay = opts.delay ?? sleep;
  const total = file.size;
  const open = async (): Promise<DriveSession> => {
    const { uploadUrl } = await apiFetch<{ uploadUrl: string }>("/api/admin/drive/uploads", jsonInit("POST", { target, name: file.name, mimeType: file.type, size: total }, signal), f);
    return { uploadUrl, offset: 0 };
  };

  let session = opts.resume ? { ...opts.resume } : await open();
  let viaRelay = relayOnly;
  // Al retomar, la sesión ya habló con Google: un error de red ya no es CORS.
  let answered = !!opts.resume;
  let askStatus = !!opts.resume;
  let restarted = false;
  let retries = 0;
  const backoff = async (cause: unknown) => {
    if (retries >= RETRY_DELAYS.length) throw cause;
    await delay(RETRY_DELAYS[retries++], signal);
    askStatus = true;
  };
  const toRelay = () => {
    // Esta subida y las que vengan, por el relevo; primero se pregunta cuánto tiene Google.
    viaRelay = relayOnly = true;
    askStatus = true;
  };

  try {
    onProgress?.(session.offset / total);
    for (;;) {
      if (session.fileId) {
        try {
          const done = await apiFetch<{ project?: Project }>("/api/admin/drive/complete", jsonInit("POST", { target, fileId: session.fileId, name: file.name, size: total }, signal), f);
          return { fileId: session.fileId, ...(done.project ? { project: done.project } : {}) };
        } catch (e) {
          if (!isRetryable(e)) throw e;
          await backoff(e);
          continue;
        }
      }
      const query = askStatus;
      let reply: Reply;
      try {
        if (query) reply = await putChunk(f, session.uploadUrl, viaRelay, null, `bytes */${total}`, signal);
        else {
          const end = Math.min(session.offset + CHUNK_SIZE, total);
          reply = await putChunk(f, session.uploadUrl, viaRelay, file.slice(session.offset, end), `bytes ${session.offset}-${end - 1}/${total}`, signal);
        }
      } catch (e) {
        if (!isRetryable(e)) throw e;
        if (!viaRelay && !answered && isNetworkError(e)) toRelay();
        else await backoff(e);
        continue;
      }
      answered = true;
      if (reply.status === 308) {
        // Directo, un 308 sin Range después de mandar bytes es CORS que no deja leer el header: no se retrocede.
        if (!viaRelay && reply.range === null && (!query || session.offset > 0)) {
          toRelay();
          continue;
        }
        const next = nextOffset(reply.range);
        // Solo la consulta de estado puede mover el punto hacia atrás; una parte sin avance cuenta como fallo.
        if (!query && next <= session.offset) {
          await backoff(new DriveUploadError(308));
          continue;
        }
        if (next > session.offset) retries = 0;
        session.offset = next;
        askStatus = false;
        onProgress?.(next / total);
        continue;
      }
      if (reply.status === 200 || reply.status === 201) {
        if (!reply.body?.id) throw new DriveUploadError(reply.status);
        session = { ...session, offset: total, fileId: reply.body.id };
        retries = 0;
        onProgress?.(1);
        continue;
      }
      if ((reply.status === 404 || reply.status === 410) && !restarted) {
        // La sesión de Google venció: se abre otra y se sube desde el principio.
        restarted = true;
        session = await open();
        askStatus = false;
        retries = 0;
        onProgress?.(0);
        continue;
      }
      if (reply.status >= 500) {
        await backoff(new DriveUploadError(reply.status));
        continue;
      }
      // Otro 4xx: Google no aceptó la subida.
      throw new DriveUploadError(reply.status);
    }
  } catch (e) {
    throw new DriveUploadInterrupted(e, session);
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
