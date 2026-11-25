import { afterEach, describe, expect, it, vi } from "vitest";
import { handleExport } from "../worker/api/export";
import { resetTokenCache } from "../worker/google/oauth";
import { jsonRequest, makeEnv } from "./helpers";
import { approvedProject, B, owner, socio } from "./fixtures";
import { googleEnv, mockGoogle } from "./google-mock";
import { connectGoogle } from "./google-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  resetTokenCache();
});

describe("export", () => {
  it("downloads every business table but no Google secrets", async () => {
    const env = await makeEnv(googleEnv);
    mockGoogle();
    await connectGoogle(env);
    await approvedProject(env);
    const r = await handleExport(jsonRequest("GET", `${B}/export`), env, owner, ["export"]);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toMatch(/attachment; filename="sdtech-systems-\d{4}-\d{2}-\d{2}\.json"/);
    const text = await r.text();
    const data = JSON.parse(text) as { version: number; tables: Record<string, unknown[]> };
    expect(data.version).toBe(1);
    for (const t of ["clients", "quotes", "projects", "payments", "payment_plans", "subscriptions", "invoices", "activity_log"]) expect(data.tables).toHaveProperty(t);
    expect(data.tables.clients).toHaveLength(1);
    expect(text).not.toContain("refreshToken");
    expect(data.tables).not.toHaveProperty("oauth_states");
  });

  it("is owner-only", async () => {
    const env = await makeEnv();
    expect((await handleExport(jsonRequest("GET", `${B}/export`), env, socio, ["export"])).status).toBe(403);
  });
});
