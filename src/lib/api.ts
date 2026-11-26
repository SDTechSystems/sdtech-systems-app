export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

const RELOAD_KEY = "sd:auth-reload-at";
const RELOAD_WINDOW_MS = 60_000;

/**
 * La sesión de Access venció: recargar hace que Cloudflare pida el login otra vez.
 * Solo una vez por minuto, para no entrar en un ciclo si Access está mal configurado.
 */
function reloadOnce(): void {
  try {
    const last = Number(globalThis.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return;
    globalThis.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  globalThis.location.reload();
}

/**
 * Una llamada a la API del panel que contesta JSON: con la sesión, recargando si Access venció y
 * con `ApiError` si falla. `fetchImpl` deja usar otro `fetch` (las pruebas de la subida a Drive).
 */
export async function apiFetch<T>(path: string, init: RequestInit, fetchImpl?: typeof fetch): Promise<T> {
  const full: RequestInit = { credentials: "same-origin", ...init, headers: { accept: "application/json", ...(init.headers as Record<string, string> | undefined) } };
  const res = await (fetchImpl ? fetchImpl(path, full) : fetch(path, full));
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) reloadOnce();
  if (!res.ok) throw new ApiError(res.status, data.error ?? "unknown_error");
  return data as T;
}

/** `init` de una llamada con cuerpo JSON. */
export const jsonInit = (method: string, body?: unknown, signal?: AbortSignal): RequestInit =>
  body === undefined ? { method, signal } : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal };

const request = <T>(method: string, path: string, body?: unknown): Promise<T> => apiFetch<T>(path, jsonInit(method, body));

export const apiGet = <T>(path: string): Promise<T> => request<T>("GET", path);

export const apiSend = <T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> => request<T>(method, path, body);
