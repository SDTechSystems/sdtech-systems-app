import { describe, expect, it } from "vitest";
import { handleReminders } from "../worker/api/reminders";
import { handleProjectPayments } from "../worker/api/payments";
import type { PaymentSummary } from "../shared/types";
import { jsonRequest, makeEnv } from "./helpers";
import { approvedProject, B, owner, socio } from "./fixtures";

describe("reminders", () => {
  it("logs a payment reminder on the plan's project", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const plans = ((await (await handleProjectPayments(jsonRequest("GET", `${B}/projects/${projectId}/payments`), env, owner, ["projects", projectId, "payments"])).json()) as PaymentSummary).plans;
    const r = await handleReminders(jsonRequest("POST", `${B}/reminders`, { entityType: "payment_plan", entityId: plans[0].id, kind: "payment" }), env, owner, ["reminders"]);
    expect(r.status).toBe(201);
    const row = await env.DB.prepare("SELECT entity_type, entity_id, action, detail FROM activity_log WHERE action = 'reminder'").first<Record<string, string>>();
    expect(row).toMatchObject({ entity_type: "project", entity_id: projectId, action: "reminder" });
    expect(JSON.parse(row!.detail)).toEqual({ kind: "payment", planId: plans[0].id });
  });

  it("keeps payment reminders for the owner", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const r = await handleReminders(jsonRequest("POST", `${B}/reminders`, { entityType: "project", entityId: projectId, kind: "payment" }), env, socio, ["reminders"]);
    expect(r.status).toBe(403);
    const ok = await handleReminders(jsonRequest("POST", `${B}/reminders`, { entityType: "project", entityId: projectId, kind: "progress" }), env, socio, ["reminders"]);
    expect(ok.status).toBe(201);
  });
});
