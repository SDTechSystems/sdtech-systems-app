import { describe, expect, it } from "vitest";
import { authenticate } from "../worker/auth/session";
import { makeTestToken, testJwks } from "./access-keys";
import { makeEnv } from "./helpers";

const req = (token?: string) =>
  new Request("https://panel.sdtechsystems.dev/api/admin/me", { headers: token ? { "Cf-Access-Jwt-Assertion": token } : {} });

describe("authenticate", () => {
  it("recognizes the owner case-insensitively and records them", async () => {
    const env = await makeEnv();
    const s = await authenticate(req(await makeTestToken({ email: "juan@example.com" })), env, testJwks);
    expect(s).toEqual({ email: "juan@example.com", role: "owner" });
    const row = await env.DB.prepare("SELECT role FROM users WHERE email = ?").bind("juan@example.com").first<{ role: string }>();
    expect(row?.role).toBe("owner");
  });

  it("rejects a request without token with 401", async () => {
    const r = (await authenticate(req(), await makeEnv(), testJwks)) as Response;
    expect(r.status).toBe(401);
  });

  it("rejects a token for another audience with 401", async () => {
    const r = (await authenticate(req(await makeTestToken({ email: "juan@example.com", aud: "other" })), await makeEnv(), testJwks)) as Response;
    expect(r.status).toBe(401);
  });

  it("rejects an expired token with 401", async () => {
    const r = (await authenticate(req(await makeTestToken({ email: "juan@example.com", expSeconds: -60 })), await makeEnv(), testJwks)) as Response;
    expect(r.status).toBe(401);
  });

  it("rejects an unknown email with 403 not_allowed", async () => {
    const r = (await authenticate(req(await makeTestToken({ email: "intruso@example.com" })), await makeEnv(), testJwks)) as Response;
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "not_allowed" });
  });

  it("gives a registered collaborator their role", async () => {
    const env = await makeEnv();
    await env.DB.prepare("INSERT INTO users (email, role, created_at) VALUES (?, 'collaborator', ?)").bind("socio@example.com", new Date().toISOString()).run();
    const s = await authenticate(req(await makeTestToken({ email: "socio@example.com" })), env, testJwks);
    expect(s).toEqual({ email: "socio@example.com", role: "collaborator" });
  });

  it("uses DEV_AUTH_EMAIL only when Access is not configured", async () => {
    const env = await makeEnv({ ACCESS_AUD: undefined, DEV_AUTH_EMAIL: "juan@example.com" });
    expect(await authenticate(req(), env, testJwks)).toEqual({ email: "juan@example.com", role: "owner" });
  });

  it("answers 503 when neither Access nor dev login is configured", async () => {
    const r = (await authenticate(req(), await makeEnv({ ACCESS_AUD: undefined }), testJwks)) as Response;
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "access_not_configured" });
  });
});
