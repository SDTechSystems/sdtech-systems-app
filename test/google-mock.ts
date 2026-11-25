import { vi } from "vitest";

export const TEST_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
export const googleEnv = { GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "GOCSPX-test", TOKEN_ENC_KEY: TEST_KEY };

export type Call = { method: string; url: string; body: unknown };

/**
 * Simula a Google. `handlers` recibe método y URL y devuelve [status, json] o undefined (→ 200 {}).
 * Registra cada llamada en `calls`.
 */
export function mockGoogle(handlers: (method: string, url: string, body: unknown) => [number, unknown] | undefined = () => undefined) {
  const calls: Call[] = [];
  let n = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    let body: unknown = init?.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = Object.fromEntries(new URLSearchParams(body as string));
      }
    } else if (body instanceof URLSearchParams) body = Object.fromEntries(body);
    calls.push({ method, url, body });
    const custom = handlers(method, url, body);
    if (custom) return new Response(JSON.stringify(custom[1]), { status: custom[0], headers: { "content-type": "application/json" } });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "at-123", expires_in: 3599, refresh_token: "rt-secret-456" });
    if (url.includes("/calendar/v3/calendars/primary/events") && method === "POST") return Response.json({ id: `evt${++n}`, hangoutLink: "https://meet.google.com/abc-defg-hij" });
    if (method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}
