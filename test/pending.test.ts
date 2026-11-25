import { describe, expect, it } from "vitest";
import { handlePending } from "../worker/api/pending";
import { handleReminders } from "../worker/api/reminders";
import { handleMeetings } from "../worker/api/meetings";
import { handleClients } from "../worker/api/clients";
import worker from "../worker/index";
import type { Pending, PendingItem } from "../shared/types";
import { jsonRequest, makeEnv } from "./helpers";
import { approvedProject, B, newClient, owner, sentQuote, socio, type TestEnv } from "./fixtures";

const TODAY = "2026-12-10";
async function pending(env: TestEnv, s = owner, today: string | null = TODAY): Promise<Pending> {
  const r = await handlePending(jsonRequest("GET", `${B}/pending${today ? `?today=${today}` : ""}`), env, s, ["pending"]);
  return (await r.json()) as Pending;
}
const fresh = (env: TestEnv) => env.DB.prepare("UPDATE activity_log SET at = '2026-12-09T15:00:00.000Z'").run();
async function setPlanDue(env: TestEnv, projectId: string, due: string) {
  await env.DB.prepare("UPDATE payment_plans SET due_date = ? WHERE project_id = ?").bind(due, projectId).run();
}
const kinds = (p: Pending, kind: PendingItem["kind"]) => p.items.filter((i) => i.kind === kind);

describe("pending", () => {
  it.each([
    ["2026-12-09", "overdue"],
    ["2026-12-10", "today"],
    ["2026-12-15", "soon"],
  ])("lists a payment due %s as %s", async (due, urgency) => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    await setPlanDue(env, projectId, due);
    await fresh(env);
    const items = kinds(await pending(env), "payment");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ urgency, amount: 385000, currency: "COP", projectId, clientName: "María Gómez", clientPhone: "573058147293" });
  });

  it("leaves out payments further away than the window", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    await setPlanDue(env, projectId, "2026-12-30");
    expect(kinds(await pending(env), "payment")).toEqual([]);
  });

  it("lists a delivery date coming soon", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    await env.DB.prepare("UPDATE projects SET due_date = '2026-12-12' WHERE id = ?").bind(projectId).run();
    expect(kinds(await pending(env), "delivery")[0]).toMatchObject({ urgency: "soon", date: "2026-12-12" });
  });

  it("lists a quote about to expire", async () => {
    const env = await makeEnv();
    const c = await newClient(env);
    const q = await sentQuote(env, c.id);
    await env.DB.prepare("UPDATE quotes SET valid_until = '2026-12-13' WHERE id = ?").bind(q.id).run();
    expect(kinds(await pending(env), "quote_expiring")[0]).toMatchObject({ quoteId: q.id, urgency: "soon" });
  });

  it("shows portal news until Juan marks them seen", async () => {
    const env = await makeEnv();
    const c = await newClient(env);
    const q = await sentQuote(env, c.id);
    const linkRes = await handleClients(jsonRequest("POST", `${B}/clients/${c.id}/portal-link`, {}), env, owner, ["clients", c.id, "portal-link"]);
    const tokenUrl = ((await linkRes.json()) as { url: string }).url;
    const token = tokenUrl.split("/c/")[1];
    await worker.fetch(
      new Request(`https://clientes.sdtechsystems.dev/api/portal/${token}/quotes/${q.id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "María Gómez" }) }),
      env,
      {} as ExecutionContext,
    );
    const news = kinds(await pending(env, owner, null), "portal");
    expect(news).toHaveLength(1);
    expect(news[0].title).toBe(`María Gómez aprobó ${q.number}`);
    await handlePending(jsonRequest("POST", `${B}/pending/seen`, {}), env, owner, ["pending", "seen"]);
    expect(kinds(await pending(env, owner, null), "portal")).toEqual([]);
  });

  it("flags active projects without movement, but not paused ones", async () => {
    const env = await makeEnv();
    const a = await approvedProject(env);
    await env.DB.prepare("UPDATE activity_log SET at = '2026-11-30T12:00:00.000Z'").run();
    await env.DB.prepare("UPDATE projects SET created_at = '2026-11-30T12:00:00.000Z'").run();
    expect(kinds(await pending(env), "stale").map((i) => i.projectId)).toEqual([a.projectId]);
    await env.DB.prepare("UPDATE projects SET status = 'paused'").run();
    expect(kinds(await pending(env), "stale")).toEqual([]);
  });

  it("counts any logged movement as activity", async () => {
    const env = await makeEnv();
    await approvedProject(env);
    await env.DB.prepare("UPDATE activity_log SET at = '2026-11-30T12:00:00.000Z'").run();
    await env.DB.prepare("UPDATE projects SET created_at = '2026-11-30T12:00:00.000Z'").run();
    await env.DB.prepare("UPDATE activity_log SET at = '2026-12-08T12:00:00.000Z' WHERE rowid = (SELECT MAX(rowid) FROM activity_log WHERE entity_type = 'project')").run();
    expect(kinds(await pending(env), "stale")).toEqual([]);
  });

  it("remembers the last payment reminder", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    await setPlanDue(env, projectId, "2026-12-10");
    const planId = (await env.DB.prepare("SELECT id FROM payment_plans").first<{ id: string }>())!.id;
    await handleReminders(jsonRequest("POST", `${B}/reminders`, { entityType: "payment_plan", entityId: planId, kind: "payment" }), env, owner, ["reminders"]);
    expect(kinds(await pending(env), "payment")[0].lastReminderAt).toBeTruthy();
  });

  it("hides money from collaborators", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    await setPlanDue(env, projectId, "2026-12-10");
    const p = await pending(env, socio);
    expect(p.items.filter((i) => i.kind === "payment" || i.kind.startsWith("quote"))).toEqual([]);
  });

  it("orders overdue before today before soon", async () => {
    const env = await makeEnv();
    const a = await approvedProject(env);
    await setPlanDue(env, a.projectId, "2026-12-10");
    await env.DB.prepare("UPDATE projects SET due_date = '2026-12-01' WHERE id = ?").bind(a.projectId).run();
    await fresh(env);
    const order = (await pending(env)).items.map((i) => i.urgency);
    expect(order.indexOf("overdue")).toBeLessThan(order.indexOf("today"));
  });

  it("keeps chasing payments after a project is delivered or paused, but not cancelled", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    await setPlanDue(env, projectId, "2026-12-09");
    for (const [status, expected] of [["delivered", 1], ["paused", 1], ["cancelled", 0]] as const) {
      await env.DB.prepare("UPDATE projects SET status = ? WHERE id = ?").bind(status, projectId).run();
      expect(kinds(await pending(env), "payment")).toHaveLength(expected);
    }
  });

  it("lists today's and tomorrow's meetings, not later or cancelled ones", async () => {
    const env = await makeEnv();
    const c = await newClient(env);
    const add = (start: string, title: string) =>
      handleMeetings(jsonRequest("POST", `${B}/meetings`, { clientId: c.id, title, start }), env, owner, ["meetings"]);
    await add("2026-12-10T19:30", "Hoy en la noche");
    await add("2026-12-11T09:00", "Mañana");
    await add("2026-12-12T09:00", "Pasado mañana");
    const cancelled = ((await (await add("2026-12-10T08:00", "Cancelada")).json()) as { meeting: { id: string } }).meeting.id;
    await handleMeetings(jsonRequest("DELETE", `${B}/meetings/${cancelled}`), env, owner, ["meetings", cancelled]);
    const p = await pending(env);
    expect(p.meetings.map((m) => m.title)).toEqual(["Hoy en la noche", "Mañana"]);
    expect(p.google).toEqual({ status: "disconnected" });
  });

  it("shows adjustment requests from the portal as news", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const c = (await env.DB.prepare("SELECT client_id FROM projects WHERE id = ?").bind(projectId).first<{ client_id: string }>())!.client_id;
    const url = ((await (await handleClients(jsonRequest("POST", `${B}/clients/${c}/portal-link`, {}), env, owner, ["clients", c, "portal-link"])).json()) as { url: string }).url;
    await worker.fetch(
      new Request(`https://clientes.sdtechsystems.dev/api/portal/${url.split("/c/")[1]}/projects/${projectId}/adjustments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Otro tono de azul" }) }),
      env,
      {} as ExecutionContext,
    );
    const news = kinds(await pending(env, owner, null), "portal");
    expect(news.map((n) => n.title)).toContain("María Gómez pidió un ajuste en Landing page");
  });
});
