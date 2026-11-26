import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocModel } from "../shared/docs/model";

const MiB = 1024 * 1024;
const TOTAL = 20 * MiB;
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc";
const RELAY = `/api/admin/drive/relay?url=${encodeURIComponent(UPLOAD_URL)}`;
const target = { type: "delivery", projectId: "p1" } as const;

// Cada prueba carga el módulo de nuevo: la elección directo/relevo se recuerda por sesión.
let mod: typeof import("../src/lib/drive-upload");
beforeEach(async () => {
  vi.resetModules();
  mod = await import("../src/lib/drive-upload");
});

const file = (size = TOTAL, name = "kit-marca-final.zip") => new File([new Uint8Array(size)], name, { type: "application/zip" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { url: string; method: string; range: string | null; size: number | null; body: unknown };

/**
 * Un Google de mentira con sesión reanudable. `received` son los bytes que ya tiene.
 * `fail(call)` puede lanzar (error de red) antes de que Google conteste; `corsBlocked` hace que todo PUT directo falle como CORS;
 * `hideRange` quita el header Range de las respuestas directas (CORS que no lo expone); `expire()` vence la sesión (404) hasta
 * que se abra otra con `/uploads`.
 */
function fakeGoogle(opts: { fail?: (c: Call, n: number) => void; corsBlocked?: boolean; hideRange?: boolean; keep?: (start: number, end: number) => number } = {}) {
  let received = 0;
  let expired = false;
  const calls: Call[] = [];
  const google = (range: string | null, body: Blob | null): { status: number; range: string | null; body: unknown } => {
    if (expired) return { status: 404, range: null, body: { error: { code: 404 } } };
    const have = () => (received ? `bytes=0-${received - 1}` : null);
    if (range?.startsWith("bytes */")) return { status: 308, range: have(), body: null };
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range ?? "");
    if (!m || !body) throw new Error(`bad Content-Range ${range}`);
    const [start, end, total] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (start !== received) throw new Error(`chunk starts at ${start}, Google has ${received}`);
    if (body.size !== end - start + 1) throw new Error("body size does not match Content-Range");
    received = opts.keep ? opts.keep(start, end) : end + 1;
    if (received === total) return { status: 200, range: null, body: { id: "file123", name: "kit-marca-final.zip" } };
    return { status: 308, range: have(), body: null };
  };
  const fetch = vi.fn(async (input: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const body = init.body ?? null;
    const call: Call = {
      url: input,
      method: init.method ?? "GET",
      range: headers.get("content-range"),
      size: body instanceof Blob ? body.size : null,
      body: typeof body === "string" ? JSON.parse(body) : null,
    };
    calls.push(call);
    opts.fail?.(call, calls.length);
    if (input === "/api/admin/drive/uploads") {
      if (expired) [expired, received] = [false, 0];
      return json({ uploadUrl: UPLOAD_URL });
    }
    if (input === "/api/admin/drive/complete") return json({ project: { id: "p1", deliveryUrl: "https://drive.google.com/file/d/file123/view" } });
    if (input === UPLOAD_URL) {
      if (opts.corsBlocked) throw new TypeError("Failed to fetch");
      const r = google(call.range, body as Blob | null);
      return r.body ? json(r.body, r.status) : new Response(null, { status: r.status, headers: r.range && !opts.hideRange ? { range: r.range } : {} });
    }
    if (input === RELAY) return json(google(call.range, body as Blob | null));
    return json({ error: "not_found" }, 404);
  });
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    calls,
    chunks: () => calls.filter((c) => c.url === UPLOAD_URL || c.url === RELAY),
    expire: () => void (expired = true),
  };
}

const noDelay = () => {
  const delays: number[] = [];
  return { delays, delay: async (ms: number) => void delays.push(ms) };
};

describe("uploadToDrive", () => {
  it("uploads 20 MiB in three 8 MiB-aligned chunks and completes", async () => {
    const g = fakeGoogle();
    const progress: number[] = [];
    const out = await mod.uploadToDrive(target, file(), (f) => progress.push(f), undefined, { fetch: g.fetch, ...noDelay() });

    expect(g.calls[0]).toMatchObject({ url: "/api/admin/drive/uploads", method: "POST", body: { target, name: "kit-marca-final.zip", mimeType: "application/zip", size: TOTAL } });
    expect(g.chunks().map((c) => [c.method, c.range, c.size])).toEqual([
      ["PUT", "bytes 0-8388607/20971520", 8 * MiB],
      ["PUT", "bytes 8388608-16777215/20971520", 8 * MiB],
      ["PUT", "bytes 16777216-20971519/20971520", 4 * MiB],
    ]);
    expect(g.calls.at(-1)).toMatchObject({ url: "/api/admin/drive/complete", method: "POST", body: { target, fileId: "file123", name: "kit-marca-final.zip", size: TOTAL } });
    expect(out).toEqual({ fileId: "file123", project: { id: "p1", deliveryUrl: "https://drive.google.com/file/d/file123/view" } });
    expect(progress).toEqual([0, 0.4, 0.8, 1]);
  });

  it("follows the Range of a 308 when Google kept only part of a chunk", async () => {
    // Google se queda con 4 MiB de la primera parte: la siguiente sale desde ahí, otra vez de 8 MiB.
    const g = fakeGoogle({ keep: (start, end) => (start === 0 ? 4 * MiB : end + 1) });
    await mod.uploadToDrive(target, file(), undefined, undefined, { fetch: g.fetch, ...noDelay() });
    expect(g.chunks().map((c) => c.range)).toEqual(["bytes 0-8388607/20971520", "bytes 4194304-12582911/20971520", "bytes 12582912-20971519/20971520"]);
  });

  it("backs off when a chunk's 308 shows no progress, instead of looping", async () => {
    const t = noDelay();
    // Google contesta 308 sin guardar nada de la segunda parte, siempre.
    const g = fakeGoogle({ keep: (start, end) => (start === 8 * MiB ? 8 * MiB : end + 1) });
    await expect(mod.uploadToDrive(target, file(), undefined, undefined, { fetch: g.fetch, delay: t.delay })).rejects.toThrow();
    expect(t.delays).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it("resumes from the Range Google reports after a network error", async () => {
    const t = noDelay();
    // La segunda parte llega a medias a Google (12 MiB en total) y la respuesta se pierde.
    const g = fakeGoogle({ keep: (start, end) => (start === 8 * MiB ? 12 * MiB : end + 1) });
    const inner = g.fetch;
    const fetch = (async (input: string, init?: RequestInit) => {
      const res = await inner(input, init);
      if (new Headers(init?.headers).get("content-range") === "bytes 8388608-16777215/20971520") throw new TypeError("network down");
      return res;
    }) as typeof globalThis.fetch;

    const out = await mod.uploadToDrive(target, file(), undefined, undefined, { fetch, delay: t.delay });
    expect(g.chunks().map((c) => c.range)).toEqual([
      "bytes 0-8388607/20971520",
      "bytes 8388608-16777215/20971520",
      "bytes */20971520",
      "bytes 12582912-20971519/20971520",
    ]);
    const query = g.chunks()[2];
    expect(query.url).toBe(UPLOAD_URL);
    expect(query.size).toBeNull();
    expect(t.delays).toEqual([1000]);
    expect(out.fileId).toBe("file123");
  });

  it("gives up after 5 retries and rejects", async () => {
    const t = noDelay();
    const g = fakeGoogle({
      fail: (c) => {
        if (c.url === UPLOAD_URL && c.range !== "bytes 0-8388607/20971520") throw new TypeError("network down");
      },
    });
    await expect(mod.uploadToDrive(target, file(), undefined, undefined, { fetch: g.fetch, delay: t.delay })).rejects.toThrow();
    expect(t.delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    // La parte que falló y luego cinco consultas de estado, todas fallidas.
    expect(g.chunks().slice(1).map((c) => c.range)).toEqual(["bytes 8388608-16777215/20971520", ...Array(5).fill("bytes */20971520")]);
    expect(g.calls.some((c) => c.url === "/api/admin/drive/complete")).toBe(false);
  });

  it("switches to the relay when the direct PUT is blocked, asking Google first, and stays on it for the session", async () => {
    const g = fakeGoogle({ corsBlocked: true });
    const out = await mod.uploadToDrive(target, file(), undefined, undefined, { fetch: g.fetch, ...noDelay() });
    expect(g.chunks().map((c) => [c.url === RELAY ? "relay" : "direct", c.range, c.size])).toEqual([
      ["direct", "bytes 0-8388607/20971520", 8 * MiB],
      ["relay", "bytes */20971520", null],
      ["relay", "bytes 0-8388607/20971520", 8 * MiB],
      ["relay", "bytes 8388608-16777215/20971520", 8 * MiB],
      ["relay", "bytes 16777216-20971519/20971520", 4 * MiB],
    ]);
    expect(out.fileId).toBe("file123");

    const again = fakeGoogle({ corsBlocked: true });
    await mod.uploadToDrive(target, file(MiB, "video.mp4"), undefined, undefined, { fetch: again.fetch, ...noDelay() });
    expect(again.chunks().map((c) => [c.url === RELAY ? "relay" : "direct", c.range])).toEqual([["relay", "bytes 0-1048575/1048576"]]);
  });

  it("resumes through the relay with an empty status query", async () => {
    const t = noDelay();
    const g = fakeGoogle({ corsBlocked: true });
    let failed = false;
    const fetch = (async (input: string, init?: RequestInit) => {
      if (input === RELAY && !failed && new Headers(init?.headers).get("content-range")?.startsWith("bytes 8388608-")) {
        failed = true;
        throw new TypeError("network down");
      }
      return g.fetch(input, init);
    }) as typeof globalThis.fetch;
    await mod.uploadToDrive(target, file(), undefined, undefined, { fetch, delay: t.delay });
    const relayed = g.chunks().filter((c) => c.url === RELAY);
    expect(relayed.map((c) => c.range)).toEqual([
      "bytes */20971520",
      "bytes 0-8388607/20971520",
      "bytes */20971520",
      "bytes 8388608-16777215/20971520",
      "bytes 16777216-20971519/20971520",
    ]);
    expect(t.delays).toEqual([1000]);
  });

  it("switches to the relay instead of rewinding when a direct 308 hides the Range", async () => {
    const g = fakeGoogle({ hideRange: true });
    await mod.uploadToDrive(target, file(), undefined, undefined, { fetch: g.fetch, ...noDelay() });
    // Google ya tiene la primera parte: el relevo lo confirma y se sigue desde 8 MiB, sin volver a 0.
    expect(g.chunks().map((c) => [c.url === RELAY ? "relay" : "direct", c.range])).toEqual([
      ["direct", "bytes 0-8388607/20971520"],
      ["relay", "bytes */20971520"],
      ["relay", "bytes 8388608-16777215/20971520"],
      ["relay", "bytes 16777216-20971519/20971520"],
    ]);
  });

  it("retries /complete with the same backoff without uploading again", async () => {
    const t = noDelay();
    let completes = 0;
    const g = fakeGoogle({
      fail: (c) => {
        if (c.url === "/api/admin/drive/complete" && completes++ === 0) throw new TypeError("network down");
      },
    });
    const out = await mod.uploadToDrive(target, file(), undefined, undefined, { fetch: g.fetch, delay: t.delay });
    expect(out.fileId).toBe("file123");
    expect(g.chunks()).toHaveLength(3);
    expect(g.calls.filter((c) => c.url === "/api/admin/drive/complete")).toHaveLength(2);
    expect(t.delays).toEqual([1000]);
  });

  it("«Reintentar» resumes the same Google session from where it stopped", async () => {
    let down = true;
    const g = fakeGoogle({
      fail: (c) => {
        if (down && c.url === UPLOAD_URL && c.range !== "bytes 0-8388607/20971520") throw new TypeError("network down");
      },
    });
    const err = await mod.uploadToDrive(target, file(), undefined, undefined, { fetch: g.fetch, ...noDelay() }).catch((e) => e);
    expect(err).toBeInstanceOf(mod.DriveUploadInterrupted);
    expect(err.session).toEqual({ uploadUrl: UPLOAD_URL, offset: 8 * MiB });

    down = false;
    const before = g.calls.length;
    const progress: number[] = [];
    const out = await mod.uploadToDrive(target, file(), (f) => progress.push(f), undefined, { fetch: g.fetch, ...noDelay(), resume: err.session });
    const later = g.calls.slice(before);
    expect(later.some((c) => c.url === "/api/admin/drive/uploads")).toBe(false);
    expect(later.map((c) => c.range ?? c.url)).toEqual(["bytes */20971520", "bytes 8388608-16777215/20971520", "bytes 16777216-20971519/20971520", "/api/admin/drive/complete"]);
    expect(progress[0]).toBe(0.4);
    expect(out.fileId).toBe("file123");
  });

  it("starts a fresh session when Google says the stored one expired", async () => {
    const g = fakeGoogle();
    g.expire();
    const out = await mod.uploadToDrive(target, file(), undefined, undefined, { fetch: g.fetch, ...noDelay(), resume: { uploadUrl: UPLOAD_URL, offset: 8 * MiB } });
    expect(g.calls.map((c) => c.range ?? c.url)).toEqual([
      "bytes */20971520",
      "/api/admin/drive/uploads",
      "bytes 0-8388607/20971520",
      "bytes 8388608-16777215/20971520",
      "bytes 16777216-20971519/20971520",
      "/api/admin/drive/complete",
    ]);
    expect(out.fileId).toBe("file123");
  });

  it("goes straight to /complete when the stored session already finished", async () => {
    const g = fakeGoogle();
    await mod.uploadToDrive(target, file(MiB), undefined, undefined, { fetch: g.fetch, ...noDelay(), resume: { uploadUrl: UPLOAD_URL, offset: MiB, fileId: "file123" } });
    expect(g.calls.map((c) => c.url)).toEqual(["/api/admin/drive/complete"]);
  });

  it("does not retry when the panel refuses the upload", async () => {
    const fetch = vi.fn(async () => json({ error: "drive_not_connected" }, 409)) as unknown as typeof globalThis.fetch;
    await expect(mod.uploadToDrive(target, file(MiB), undefined, undefined, { fetch, ...noDelay() })).rejects.toMatchObject({ status: 409, code: "drive_not_connected" });
  });
});

describe("driveDocName", () => {
  const model = (kind: DocModel["kind"], voided: boolean) => ({ kind, number: kind === "receipt" ? "REC-0007" : "CC-0003", voided }) as DocModel;
  it("names the PDF by its number, keeping the void mark Drive already has", () => {
    expect(mod.driveDocName(model("collection", false), "CC-0003.pdf")).toBe("CC-0003.pdf");
    expect(mod.driveDocName(model("collection", true), "CC-0003.pdf")).toBe("CC-0003 (anulada).pdf");
    expect(mod.driveDocName(model("receipt", true), "REC-0007.pdf")).toBe("REC-0007 (anulado).pdf");
  });
});
