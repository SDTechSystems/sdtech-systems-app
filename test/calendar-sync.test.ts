import { afterEach, describe, expect, it, vi } from "vitest";
import { syncCalendar } from "../worker/google/sync";
import { resetTokenCache } from "../worker/google/oauth";
import { handleProjects } from "../worker/api/projects";
import { handleProjectPayments } from "../worker/api/payments";
import { todayBogota } from "../shared/dates";
import { jsonRequest, makeEnv } from "./helpers";
import { approvedProject, B, owner, type TestEnv } from "./fixtures";
import { googleEnv, mockGoogle, type Call } from "./google-mock";
import { connectGoogle } from "./google-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  resetTokenCache();
});

const eventCalls = (calls: Call[]) => calls.filter((c) => c.url.includes("/calendar/v3/"));
const links = async (env: TestEnv) => (await env.DB.prepare("SELECT key FROM calendar_links ORDER BY key").all<{ key: string }>()).results.map((r) => r.key);

async function setup() {
  const env = await makeEnv(googleEnv);
  const g = mockGoogle();
  await connectGoogle(env);
  const p = await approvedProject(env);
  return { env, g, ...p };
}

describe("calendar sync", () => {
  it("creates an event for the advance payment at 9:00 with the reminders", async () => {
    const { env, g } = await setup();
    const r = await syncCalendar(env);
    expect(r).toMatchObject({ created: 1, updated: 0, deleted: 0, errors: 0 });
    expect((await links(env))[0]).toMatch(/^payment:/);
    const body = eventCalls(g.calls)[0].body as { summary: string; start: { dateTime: string }; reminders: { overrides: { minutes: number }[] } };
    expect(body.summary).toBe("Cobro: Anticipo $ 385.000 · María Gómez");
    expect(body.start.dateTime).toMatch(/T09:00:00-05:00$/);
    expect(body.reminders.overrides.map((o) => o.minutes)).toEqual([1440, 60, 15]);
  });

  it("does nothing on a second sync without changes", async () => {
    const { env, g } = await setup();
    await syncCalendar(env);
    const before = eventCalls(g.calls).length;
    expect(await syncCalendar(env)).toMatchObject({ created: 0, updated: 0, deleted: 0 });
    expect(eventCalls(g.calls).length).toBe(before);
  });

  it("adds, moves and removes the delivery date", async () => {
    const { env, g, projectId } = await setup();
    await handleProjects(jsonRequest("PATCH", `${B}/projects/${projectId}`, { dueDate: "2026-12-20" }), env, owner, ["projects", projectId]);
    expect(await syncCalendar(env)).toMatchObject({ created: 2 });
    await handleProjects(jsonRequest("PATCH", `${B}/projects/${projectId}`, { dueDate: "2026-12-22" }), env, owner, ["projects", projectId]);
    expect(await syncCalendar(env)).toMatchObject({ updated: 1 });
    expect(eventCalls(g.calls).some((c) => c.method === "PATCH")).toBe(true);
    await handleProjects(jsonRequest("PATCH", `${B}/projects/${projectId}`, { status: "cancelled" }), env, owner, ["projects", projectId]);
    expect(await syncCalendar(env)).toMatchObject({ deleted: 2 });
    expect(await links(env)).toEqual([]);
  });

  it("removes the payment event once the advance is paid in full", async () => {
    const { env, g, projectId } = await setup();
    await syncCalendar(env);
    const planId = (await env.DB.prepare("SELECT id FROM payment_plans").first<{ id: string }>())!.id;
    await handleProjectPayments(jsonRequest("POST", `${B}/projects/${projectId}/payments`, { amount: 385000, paidOn: todayBogota(), method: "breb", planId }), env, owner, ["projects", projectId, "payments"]);
    expect(await syncCalendar(env)).toMatchObject({ deleted: 1 });
    expect(eventCalls(g.calls).filter((c) => c.method === "DELETE")).toHaveLength(1);
    expect(await links(env)).toEqual([]);
  });

  it("keeps going when one event fails", async () => {
    const env = await makeEnv(googleEnv);
    let n = 0;
    mockGoogle((m, url) => (m === "POST" && url.includes("/events") && ++n === 1 ? [500, {}] : undefined));
    await connectGoogle(env);
    const { projectId } = await approvedProject(env);
    await handleProjects(jsonRequest("PATCH", `${B}/projects/${projectId}`, { dueDate: "2026-12-20" }), env, owner, ["projects", projectId]);
    expect(await syncCalendar(env)).toMatchObject({ created: 1, errors: 1 });
  });

  it("skips without calling Google when not connected", async () => {
    const env = await makeEnv(googleEnv);
    const g = mockGoogle();
    await approvedProject(env);
    expect(await syncCalendar(env)).toMatchObject({ skipped: "not_connected" });
    expect(eventCalls(g.calls)).toEqual([]);
  });

  it("recreates an event Juan deleted by hand in Google", async () => {
    const env = await makeEnv(googleEnv);
    mockGoogle((m) => (m === "PATCH" ? [404, { error: "notFound" }] : undefined));
    await connectGoogle(env);
    const { projectId } = await approvedProject(env);
    await syncCalendar(env);
    await handleProjects(jsonRequest("PATCH", `${B}/projects/${projectId}`, { dueDate: "2026-12-20" }), env, owner, ["projects", projectId]);
    await syncCalendar(env);
    await handleProjects(jsonRequest("PATCH", `${B}/projects/${projectId}`, { dueDate: "2026-12-22" }), env, owner, ["projects", projectId]);
    expect(await syncCalendar(env)).toMatchObject({ created: 1, errors: 0 });
  });
});

describe("sync triggers", () => {
  it("syncs in the background after a panel change and on the hourly schedule", async () => {
    const { default: worker } = await import("../worker/index");
    const env = { ...(await makeEnv(googleEnv)), ACCESS_AUD: undefined, DEV_AUTH_EMAIL: "juan@example.com" };
    const g = mockGoogle();
    await connectGoogle(env);
    const { projectId } = await approvedProject(env);
    const waits: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException: () => undefined } as unknown as ExecutionContext;
    await worker.fetch(new Request(`https://panel.sdtechsystems.dev/api/admin/projects/${projectId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dueDate: "2026-12-20" }) }), env, ctx);
    expect(waits).toHaveLength(1);
    await Promise.all(waits);
    expect(eventCalls(g.calls).length).toBeGreaterThan(0);
    const reads = await worker.fetch(new Request(`https://panel.sdtechsystems.dev/api/admin/projects/${projectId}`), env, ctx);
    expect(reads.status).toBe(200);
    expect(waits).toHaveLength(1);
    const scheduled: Promise<unknown>[] = [];
    await worker.scheduled({} as ScheduledController, env, { waitUntil: (p: Promise<unknown>) => scheduled.push(p) } as unknown as ExecutionContext);
    expect(scheduled).toHaveLength(1);
  });
});
