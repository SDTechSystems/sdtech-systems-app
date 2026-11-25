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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers: { accept: "application/json" } };
  if (body !== undefined) {
    init.headers = { accept: "application/json", "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) reloadOnce();
  if (!res.ok) throw new ApiError(res.status, data.error ?? "unknown_error");
  return data as T;
}

export const apiGet = <T>(path: string): Promise<T> => request<T>("GET", path);

export const apiSend = <T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> => request<T>(method, path, body);
