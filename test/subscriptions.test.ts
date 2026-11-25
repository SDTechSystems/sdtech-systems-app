import { afterEach, describe, expect, it, vi } from "vitest";
import { handleSubscriptions } from "../worker/api/subscriptions";
import { handlePending } from "../worker/api/pending";
import { syncCalendar } from "../worker/google/sync";
import { resetTokenCache } from "../worker/google/oauth";
import type { Pending, Subscription } from "../shared/types";
import { jsonRequest, makeEnv } from "./helpers";
import { B, newClient, owner, socio, type TestEnv } from "./fixtures";
import { googleEnv, mockGoogle } from "./google-mock";
import { connectGoogle } from "./google-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  resetTokenCache();
});

const call = (env: TestEnv, method: string, path: string[], body?: unknown, s = owner) => handleSubscriptions(jsonRequest(method, `${B}/${path.join("/")}`, body), env, s, path);
async function hosting(env: TestEnv) {
  const c = await newClient(env);
  const r = await call(env, "POST", ["subscriptions"], { clientId: c.id, kind: "hosting", name: "Hosting", amount: 25000, cycle: "mensual", nextDue: "2026-12-12", provider: "Hostinger" });
  expect(r.status).toBe(201);
  return ((await r.json()) as { subscription: Subscription }).subscription;
}
const pending = async (env: TestEnv) => (await (await handlePending(jsonRequest("GET", `${B}/pending?today=2026-12-10`), env, owner, ["pending"])).json()) as Pending;

describe("subscriptions", () => {
  it("shows a due subscription in pending and moves it one cycle when paid", async () => {
    const env = await makeEnv();
    const sub = await hosting(env);
    const item = (await pending(env)).items.find((i) => i.kind === "subscription");
    expect(item).toMatchObject({ title: "Cobro: Hosting", amount: 25000, urgency: "soon", subscriptionId: sub.id });
    const paid = ((await (await call(env, "POST", ["subscriptions", sub.id, "pay"], { method: "nequi", paidOn: "2026-12-10" })).json()) as { subscription: Subscription }).subscription;
    expect(paid).toMatchObject({ nextDue: "2027-01-12", lastPaidOn: "2026-12-10" });
    expect((await pending(env)).items.some((i) => i.kind === "subscription")).toBe(false);
  });

  it("leaves paused subscriptions out of pending", async () => {
    const env = await makeEnv();
    const sub = await hosting(env);
    await call(env, "PATCH", ["subscriptions", sub.id], { status: "paused" });
    expect((await pending(env)).items.some((i) => i.kind === "subscription")).toBe(false);
  });

  it("puts active subscriptions in the calendar and removes cancelled ones", async () => {
    const env = await makeEnv(googleEnv);
    const g = mockGoogle();
    await connectGoogle(env);
    const sub = await hosting(env);
    expect(await syncCalendar(env)).toMatchObject({ created: 1 });
    const body = g.calls.find((c) => c.method === "POST" && c.url.includes("/events"))!.body as { summary: string };
    expect(body.summary).toBe("Cobro suscripción: Hosting $ 25.000 · María Gómez");
    await call(env, "PATCH", ["subscriptions", sub.id], { status: "cancelled" });
    expect(await syncCalendar(env)).toMatchObject({ deleted: 1 });
  });

  it("validates and is owner-only", async () => {
    const env = await makeEnv();
    const c = await newClient(env);
    expect(await (await call(env, "POST", ["subscriptions"], { clientId: c.id, kind: "hosting", name: "X", amount: 0, cycle: "mensual", nextDue: "2026-12-12" })).json()).toEqual({ error: "invalid_amount" });
    expect(await (await call(env, "POST", ["subscriptions"], { clientId: c.id, kind: "vps", name: "X", amount: 1, cycle: "mensual", nextDue: "2026-12-12" })).json()).toEqual({ error: "invalid_kind" });
    expect((await call(env, "GET", ["subscriptions"], undefined, socio)).status).toBe(403);
  });
});
