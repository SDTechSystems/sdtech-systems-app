const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: HEADERS });

export const error = (status: number, code: string): Response => json({ error: code }, status);

/** Lee el cuerpo JSON. 415 si no es JSON (bloquea formularios de otros sitios), 400 si no parsea. */
export async function readJson<T>(request: Request): Promise<T | Response> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return error(415, "json_required");
  try {
    return (await request.json()) as T;
  } catch {
    return error(400, "invalid_json");
  }
}

export const now = (): string => new Date().toISOString();
