import { describe, expect, it } from "vitest";
import { handleChanges } from "../worker/api/changes";
import { handleProjectPayments } from "../worker/api/payments";
import { handleProjects } from "../worker/api/projects";
import type { ChangeRequest, PaymentSummary } from "../shared/types";
import { jsonRequest, makeEnv } from "./helpers";
import { approvedProject, B, owner, socio, type TestEnv } from "./fixtures";

const summary = async (env: TestEnv, pid: string) =>
  (await (await handleProjectPayments(jsonRequest("GET", `${B}/projects/${pid}/payments`), env, owner, ["projects", pid, "payments"])).json()) as PaymentSummary;
const createChange = (env: TestEnv, pid: string, body: object, s = owner) => handleProjects(jsonRequest("POST", `${B}/projects/${pid}/changes`, body), env, s, ["projects", pid, "changes"]);
const listChanges = async (env: TestEnv, pid: string, s = owner) =>
  ((await (await handleProjects(jsonRequest("GET", `${B}/projects/${pid}/changes`), env, s, ["projects", pid, "changes"])).json()) as { changes: ChangeRequest[] }).changes;
const act = (env: TestEnv, id: string, action: string, body: object = {}, s = owner) => handleChanges(jsonRequest("POST", `${B}/changes/${id}/${action}`, body), env, s, ["changes", id, action]);

async function insertAdjustment(env: TestEnv, pid: string) {
  await env.DB.prepare("INSERT INTO change_requests (id, project_id, kind, description, status, requested_by, created_at) VALUES ('adj1', ?, 'adjustment', 'Cambiar el color del botón', 'pending', 'client', ?)").bind(pid, new Date().toISOString()).run();
}

describe("cost changes", () => {
  it("adds an approved increase to the total and balance, only once", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const r = await createChange(env, projectId, { description: "Sección de blog", amount: 150000 });
    expect(r.status).toBe(201);
    const change = ((await r.json()) as { change: ChangeRequest }).change;
    expect(change).toMatchObject({ kind: "cost", status: "pending", amount: 150000, requestedBy: "owner" });
    expect((await summary(env, projectId)).total).toBe(770000);
    expect((await act(env, change.id, "approve", { note: "Aceptó por WhatsApp" })).status).toBe(200);
    expect(await summary(env, projectId)).toMatchObject({ baseTotal: 770000, changesTotal: 150000, total: 920000, balance: 920000 });
    expect((await act(env, change.id, "approve")).status).toBe(409);
    expect((await summary(env, projectId)).total).toBe(920000);
  });

  it("lowers the total with an approved reduction", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const change = ((await (await createChange(env, projectId, { description: "Sin fotos de producto", amount: -120000 })).json()) as { change: ChangeRequest }).change;
    await act(env, change.id, "approve");
    expect((await summary(env, projectId)).total).toBe(650000);
  });

  it("rejects a zero amount and a missing description", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    expect(await (await createChange(env, projectId, { description: "x", amount: 0 })).json()).toEqual({ error: "invalid_amount" });
    expect(await (await createChange(env, projectId, { description: " ", amount: 5 })).json()).toEqual({ error: "description_required" });
  });

  it("does not count rejected changes", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const change = ((await (await createChange(env, projectId, { description: "Extra", amount: 50000 })).json()) as { change: ChangeRequest }).change;
    await act(env, change.id, "reject");
    expect((await summary(env, projectId)).total).toBe(770000);
  });
});

describe("adjustment requests", () => {
  it("turns a client adjustment into a pending cost change", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    await insertAdjustment(env, projectId);
    const r = await act(env, "adj1", "convert", { amount: 80000 });
    expect(r.status).toBe(201);
    const changes = await listChanges(env, projectId);
    expect(changes.find((c) => c.id === "adj1")!.status).toBe("converted");
    expect(changes.find((c) => c.kind === "cost")).toMatchObject({ status: "pending", amount: 80000, description: "Cambiar el color del botón" });
    const src = await env.DB.prepare("SELECT source_id FROM change_requests WHERE kind = 'cost'").first<{ source_id: string }>();
    expect(src!.source_id).toBe("adj1");
  });

  it("lets collaborators see and resolve adjustments, but not cost changes", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    await insertAdjustment(env, projectId);
    await createChange(env, projectId, { description: "Blog", amount: 100000 });
    expect((await listChanges(env, projectId, socio)).map((c) => c.kind)).toEqual(["adjustment"]);
    expect((await createChange(env, projectId, { description: "Blog", amount: 1 }, socio)).status).toBe(403);
    expect((await act(env, "adj1", "resolve", {}, socio)).status).toBe(200);
    expect((await listChanges(env, projectId)).find((c) => c.id === "adj1")!.status).toBe("resolved");
  });
});
