import { describe, expect, it } from "vitest";
import { handleSettings } from "../worker/api/settings";
import { DEFAULT_SETTINGS, getSettings, nextNumber } from "../worker/settings";
import type { Session } from "../worker/auth/session";
import type { Settings } from "../shared/types";
import { jsonRequest, makeEnv, OWNER } from "./helpers";

const owner: Session = { email: OWNER, role: "owner" };
const socio: Session = { email: "socio@example.com", role: "collaborator" };
const U = "https://panel.sdtechsystems.dev/api/admin/settings";

describe("settings", () => {
  it("starts from the defaults with the Bre-B key and six conditions", async () => {
    const env = await makeEnv();
    const s = await getSettings(env.DB);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.payment).toMatchObject({ brebKey: "3058147293", bank: "Davibank" });
    expect(s.quotes.conditions.split("\n")).toHaveLength(6);
    expect(s.quotes).toMatchObject({ validityDays: 30, advancePercent: 50 });
    expect(s.phaseTemplates.web).toHaveLength(8);
  });

  it("merges a partial update by section", async () => {
    const env = await makeEnv();
    const r = await handleSettings(jsonRequest("PATCH", U, { quotes: { advancePercent: 40 } }), env, owner, ["settings"]);
    expect(r.status).toBe(200);
    const { settings } = (await r.json()) as { settings: Settings };
    expect(settings.quotes.advancePercent).toBe(40);
    expect(settings.quotes.validityDays).toBe(30);
    expect((await getSettings(env.DB)).quotes.advancePercent).toBe(40);
  });

  it("rejects an advance above 100%", async () => {
    const r = await handleSettings(jsonRequest("PATCH", U, { quotes: { advancePercent: 120 } }), await makeEnv(), owner, ["settings"]);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "invalid_settings" });
  });

  it("rejects an empty phase template", async () => {
    const r = await handleSettings(jsonRequest("PATCH", U, { phaseTemplates: { web: [] } }), await makeEnv(), owner, ["settings"]);
    expect(r.status).toBe(400);
  });

  it("is owner-only", async () => {
    const r = await handleSettings(jsonRequest("GET", U), await makeEnv(), socio, ["settings"]);
    expect(r.status).toBe(403);
  });
});

describe("nextNumber", () => {
  it("counts up, also under concurrency", async () => {
    const env = await makeEnv();
    expect(await nextNumber(env.DB, "quote")).toBe(1);
    expect(await nextNumber(env.DB, "quote")).toBe(2);
    const [a, b] = await Promise.all([nextNumber(env.DB, "quote"), nextNumber(env.DB, "quote")]);
    expect(new Set([a, b]).size).toBe(2);
    expect(await nextNumber(env.DB, "invoice")).toBe(1);
  });
});
