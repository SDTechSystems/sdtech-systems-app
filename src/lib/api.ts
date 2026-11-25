export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers: { accept: "application/json" } };
  if (body !== undefined) {
    init.headers = { accept: "application/json", "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) {
    // La sesión de Access venció: recargar hace que Cloudflare pida el login otra vez.
    globalThis.location.reload();
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? "unknown_error");
  return data as T;
}

export const apiGet = <T>(path: string): Promise<T> => request<T>("GET", path);

export const apiSend = <T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> => request<T>(method, path, body);
