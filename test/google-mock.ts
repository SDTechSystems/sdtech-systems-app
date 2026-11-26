import { vi } from "vitest";

export const TEST_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
export const googleEnv = { GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "GOCSPX-test", TOKEN_ENC_KEY: TEST_KEY };
export const BOTH_SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.file";

export type Call = { method: string; url: string; body: unknown; headers: Record<string, string>; rawBody: unknown };

export interface FakeFile {
  id: string;
  name: string;
  mimeType?: string;
  parents: string[];
  trashed: boolean;
}

/** Drive de mentiras: carpetas y archivos por id, permisos y aperturas de subida. */
export interface FakeDrive {
  files: Map<string, FakeFile>;
  permissions: { fileId: string; body: Record<string, unknown> }[];
  /** Agrega un archivo como si una subida hubiera terminado. */
  add(name: string, parent: string): string;
}

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_FILES = "https://www.googleapis.com/upload/drive/v3/files";

function fakeDrive(): { drive: FakeDrive; handle: (method: string, url: string, body: unknown) => Response | undefined } {
  let n = 0;
  const files = new Map<string, FakeFile>();
  const permissions: FakeDrive["permissions"] = [];
  const add = (name: string, parent: string, mimeType?: string) => {
    const id = `${mimeType ? "fld" : "file"}${++n}`;
    files.set(id, { id, name, mimeType, parents: [parent], trashed: false });
    return id;
  };
  const drive: FakeDrive = { files, permissions, add: (name, parent) => add(name, parent) };
  const notFound = () => Response.json({ error: { code: 404 } }, { status: 404 });
  const handle = (method: string, url: string, body: unknown): Response | undefined => {
    const u = new URL(url);
    const base = u.origin + u.pathname;
    if (base.startsWith(UPLOAD_FILES)) {
      const id = base.slice(UPLOAD_FILES.length + 1);
      if (method === "PATCH" && !files.has(id)) return notFound();
      return new Response(null, { status: 200, headers: { location: `${UPLOAD_FILES}?uploadType=resumable&upload_id=up${++n}` } });
    }
    if (!base.startsWith(DRIVE_FILES)) return undefined;
    const [id, sub] = base.slice(DRIVE_FILES.length + 1).split("/");
    const b = (body ?? {}) as Record<string, unknown>;
    if (method === "POST" && !id) {
      const parents = (b.parents as string[] | undefined) ?? [];
      const fid = add(String(b.name), parents[0] ?? "root", String(b.mimeType));
      if (!parents.length) files.get(fid)!.parents = [];
      return Response.json({ id: fid });
    }
    const f = files.get(id);
    if (!f) return notFound();
    if (method === "POST" && sub === "permissions") {
      permissions.push({ fileId: id, body: b });
      return Response.json({ id: "anyoneWithLink" });
    }
    if (method === "PATCH") {
      if (typeof b.name === "string") f.name = b.name;
      if (typeof b.trashed === "boolean") f.trashed = b.trashed;
      return Response.json({ id });
    }
    if (method === "GET") return Response.json({ id, trashed: f.trashed, parents: f.parents });
    return undefined;
  };
  return { drive, handle };
}

/**
 * Simula a Google. `handlers` recibe método y URL y devuelve [status, json], un Response, o undefined (→ comportamiento por defecto).
 * Registra cada llamada en `calls`. Drive se simula con estado en `drive`.
 */
export function mockGoogle(handlers: (method: string, url: string, body: unknown) => [number, unknown] | Response | undefined = () => undefined) {
  const calls: Call[] = [];
  let n = 0;
  const { drive, handle } = fakeDrive();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const rawBody: unknown = init?.body;
    let body: unknown = rawBody;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = Object.fromEntries(new URLSearchParams(body as string));
      }
    } else if (body instanceof URLSearchParams) body = Object.fromEntries(body);
    const headers = Object.fromEntries(new Headers(init?.headers as HeadersInit | undefined).entries());
    calls.push({ method, url, body, headers, rawBody });
    const custom = handlers(method, url, body);
    if (custom instanceof Response) return custom;
    if (custom) return new Response(JSON.stringify(custom[1]), { status: custom[0], headers: { "content-type": "application/json" } });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "at-123", expires_in: 3599, refresh_token: "rt-secret-456", scope: BOTH_SCOPES });
    if (url.includes("/calendar/v3/calendars/primary/events") && method === "POST") return Response.json({ id: `evt${++n}`, hangoutLink: "https://meet.google.com/abc-defg-hij" });
    const fromDrive = handle(method, url, body);
    if (fromDrive) return fromDrive;
    if (method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock, drive };
}
