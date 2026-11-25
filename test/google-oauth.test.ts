import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "../worker/google/crypto";
import { getAccessToken, resetTokenCache } from "../worker/google/oauth";
import { handleGoogleAdmin, handleGoogleCallback, handleGoogleConnect } from "../worker/api/google";
import { jsonRequest, makeEnv } from "./helpers";
import { B, owner, socio } from "./fixtures";
import { googleEnv, mockGoogle, TEST_KEY } from "./google-mock";

afterEach(() => {
  vi.unstubAllGlobals();
  resetTokenCache();
});
const env = () => makeEnv(googleEnv);
const P = "https://panel.sdtechsystems.dev";

async function connect(e: Awaited<ReturnType<typeof env>>) {
  const r = await handleGoogleConnect(new Request(`${P}/api/google/connect`), e, owner, ["connect"]);
  expect(r.status).toBe(302);
  return new URL(r.headers.get("location")!);
}

describe("token encryption", () => {
  it("round-trips and uses a fresh IV each time", async () => {
    const a = await encryptToken("rt-secret", TEST_KEY);
    const b = await encryptToken("rt-secret", TEST_KEY);
    expect(a).not.toBe(b);
    expect(await decryptToken(a, TEST_KEY)).toBe("rt-secret");
  });
});

describe("Google OAuth", () => {
  it("sends Juan to Google asking for offline calendar access", async () => {
    const e = await env();
    const url = await connect(e);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.events");
    expect(url.searchParams.get("redirect_uri")).toBe("https://panel.sdtechsystems.dev/api/google/callback");
    const state = url.searchParams.get("state")!;
    expect(await e.DB.prepare("SELECT 1 AS ok FROM oauth_states WHERE state = ?").bind(state).first()).toEqual({ ok: 1 });
  });

  it("stores the refresh token encrypted after a valid callback", async () => {
    const e = await env();
    mockGoogle();
    const state = (await connect(e)).searchParams.get("state")!;
    const r = await handleGoogleCallback(new Request(`${P}/api/google/callback?code=abc&state=${state}`), e, owner, ["callback"]);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/ajustes?google=ok");
    const row = await e.DB.prepare("SELECT value FROM settings WHERE key = 'google'").first<{ value: string }>();
    expect(row!.value).not.toContain("rt-secret-456");
    const status = await (await handleGoogleAdmin(jsonRequest("GET", `${B}/google`), e, owner, ["google"])).json();
    expect(status).toMatchObject({ status: "ok" });
    expect(await getAccessToken(e)).toBe("at-123");
  });

  it.each([
    ["unknown", "nope"],
    ["expired", "old"],
  ])("rejects an %s state", async (_label, state) => {
    const e = await env();
    mockGoogle();
    if (state === "old") await e.DB.prepare("INSERT INTO oauth_states (state, created_at) VALUES ('old', ?)").bind(new Date(Date.now() - 11 * 60_000).toISOString()).run();
    const r = await handleGoogleCallback(new Request(`${P}/api/google/callback?code=abc&state=${state}`), e, owner, ["callback"]);
    expect(r.status).toBe(400);
    expect(await e.DB.prepare("SELECT 1 FROM settings WHERE key = 'google'").first()).toBeNull();
  });

  it("marks the connection for reconnecting when Google revokes it", async () => {
    const e = await env();
    mockGoogle();
    const state = (await connect(e)).searchParams.get("state")!;
    await handleGoogleCallback(new Request(`${P}/api/google/callback?code=abc&state=${state}`), e, owner, ["callback"]);
    resetTokenCache();
    mockGoogle((_m, url) => (url.startsWith("https://oauth2.googleapis.com/token") ? [400, { error: "invalid_grant" }] : undefined));
    expect(await getAccessToken(e)).toBeNull();
    expect(await (await handleGoogleAdmin(jsonRequest("GET", `${B}/google`), e, owner, ["google"])).json()).toMatchObject({ status: "reconnect" });
  });

  it("keeps connecting and disconnecting for the owner", async () => {
    const e = await env();
    expect((await handleGoogleConnect(new Request(`${P}/api/google/connect`), e, socio, ["connect"])).status).toBe(403);
    expect((await handleGoogleAdmin(jsonRequest("DELETE", `${B}/google`), e, socio, ["google"])).status).toBe(403);
    expect((await handleGoogleAdmin(jsonRequest("GET", `${B}/google`), e, socio, ["google"])).status).toBe(200);
  });

  it("forgets the connection when disconnected", async () => {
    const e = await env();
    mockGoogle();
    const state = (await connect(e)).searchParams.get("state")!;
    await handleGoogleCallback(new Request(`${P}/api/google/callback?code=abc&state=${state}`), e, owner, ["callback"]);
    await handleGoogleAdmin(jsonRequest("DELETE", `${B}/google`), e, owner, ["google"]);
    expect(await (await handleGoogleAdmin(jsonRequest("GET", `${B}/google`), e, owner, ["google"])).json()).toMatchObject({ status: "disconnected" });
  });
});

describe("Google routes", () => {
  it("require the panel login and are not served on the clients host", async () => {
    const { default: worker } = await import("../worker/index");
    const e = await env();
    const ctx = {} as ExecutionContext;
    expect((await worker.fetch(new Request(`${P}/api/google/connect`), e, ctx)).status).toBe(401);
    expect((await worker.fetch(new Request("https://clientes.sdtechsystems.dev/api/google/connect"), e, ctx)).status).toBe(404);
    const dev = { ...e, ACCESS_AUD: undefined, DEV_AUTH_EMAIL: "juan@example.com" };
    expect((await worker.fetch(new Request(`${P}/api/google/connect`), dev, ctx)).status).toBe(302);
  });
});
