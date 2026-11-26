import { describe, expect, it } from "vitest";
import { createTestDb } from "./d1";
import { MIGRATIONS } from "../worker/db/migrations";
import { ensureSchema, resetSchemaFlag } from "../worker/db/migrate";
import { handleSettings } from "../worker/api/settings";
import { handlePaymentPlans, handlePayments, handleProjectPayments } from "../worker/api/payments";
import { addDays, todayBogota } from "../shared/dates";
import type { PaymentSummary } from "../shared/types";
import { jsonRequest, makeEnv } from "./helpers";
import { getSettings } from "../worker/settings";
import { loadPayments } from "../worker/payments/repo";
import { approvedProject, B, owner, socio, type TestEnv } from "./fixtures";

const summary = async (r: Response) => (await r.json()) as PaymentSummary;
const getSummary = async (env: TestEnv, pid: string) => summary(await handleProjectPayments(jsonRequest("GET", `${B}/projects/${pid}/payments`), env, owner, ["projects", pid, "payments"]));
const pay = (env: TestEnv, pid: string, body: object, s = owner) =>
  handleProjectPayments(jsonRequest("POST", `${B}/projects/${pid}/payments`, { paidOn: todayBogota(), method: "breb", ...body }), env, s, ["projects", pid, "payments"]);

describe("payments", () => {
  it("creates the advance commitment when a quote is approved", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const s = await getSummary(env, projectId);
    expect(s).toMatchObject({ currency: "COP", total: 770000, paid: 0, balance: 770000 });
    expect(s.plans).toHaveLength(1);
    expect(s.plans[0]).toMatchObject({ label: "Anticipo", amount: 385000, dueDate: addDays(todayBogota(), 3), status: "pending", paidAmount: 0 });
  });

  it("does not create an advance when the advance is 0%", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env, { advancePercent: 0 });
    expect((await getSummary(env, projectId)).plans).toEqual([]);
  });

  it("tracks partial payments, completes the plan and reopens it when a payment is deleted", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const planId = (await getSummary(env, projectId)).plans[0].id;
    let s = await summary(await pay(env, projectId, { amount: 200000, planId }));
    expect(s.plans[0]).toMatchObject({ status: "pending", paidAmount: 200000 });
    expect(s.balance).toBe(570000);
    s = await summary(await pay(env, projectId, { amount: 185000, planId, method: "nequi" }));
    expect(s.plans[0].status).toBe("paid");
    expect(s.balance).toBe(385000);
    const last = s.payments.find((p) => p.amount === 185000)!;
    s = await summary(await handlePayments(jsonRequest("DELETE", `${B}/payments/${last.id}`), env, owner, ["payments", last.id]));
    expect(s.plans[0].status).toBe("pending");
  });

  it("shows overpayment as a negative balance", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const s = await summary(await pay(env, projectId, { amount: 900000 }));
    expect(s.balance).toBe(-130000);
  });

  it("marks a commitment from yesterday as overdue", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const r = await handleProjectPayments(
      jsonRequest("POST", `${B}/projects/${projectId}/payment-plans`, { label: "Saldo", amount: 385000, dueDate: addDays(todayBogota(), -1) }),
      env,
      owner,
      ["projects", projectId, "payment-plans"],
    );
    expect(r.status).toBe(201);
    expect((await summary(r)).plans.find((p) => p.label === "Saldo")!.status).toBe("overdue");
  });

  it("lets Juan mark a commitment paid by hand", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const planId = (await getSummary(env, projectId)).plans[0].id;
    const s = await summary(await handlePaymentPlans(jsonRequest("PATCH", `${B}/payment-plans/${planId}`, { paid: true }), env, owner, ["payment-plans", planId]));
    expect(s.plans[0].status).toBe("paid");
  });

  it("validates method, amount and plan", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    expect(await (await pay(env, projectId, { amount: 1, method: "paypal" })).json()).toEqual({ error: "invalid_method" });
    expect(await (await pay(env, projectId, { amount: 0 })).json()).toEqual({ error: "invalid_amount" });
    expect(await (await pay(env, projectId, { amount: 1, planId: "nope" })).json()).toEqual({ error: "invalid_plan" });
  });

  it("is owner-only", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    expect((await handleProjectPayments(jsonRequest("GET", `${B}/projects/${projectId}/payments`), env, socio, ["projects", projectId, "payments"])).status).toBe(403);
    expect((await pay(env, projectId, { amount: 1 }, socio)).status).toBe(403);
  });

  it("accepts any active configured method and rejects inactive or unknown ones", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const settings = await getSettings(env.DB);
    const methods = settings.payment.methods.map((m) => (m.id === "bancolombia" ? { ...m, active: false } : m));
    const put = await handleSettings(jsonRequest("PATCH", `${B}/settings`, { payment: { methods } }), env, owner, ["settings"]);
    expect(put.status).toBe(200);
    for (const [method, status] of [["bancolombia", 400], ["tarjeta", 201], ["zelle", 400]] as const) {
      const r = await pay(env, projectId, { amount: 1000, method });
      expect(r.status).toBe(status);
      if (status === 400) expect(await r.json()).toEqual({ error: "invalid_method" });
    }
  });

  it("keeps old payments readable after the payments table rebuild", async () => {
    const db = createTestDb();
    await db.prepare("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)").run();
    for (const m of MIGRATIONS.slice(0, -1)) {
      await db.batch([
        ...m.statements.map((st) => db.prepare(st)),
        db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").bind(m.id, "2026-01-01"),
      ]);
    }
    await db.prepare("INSERT INTO payments (id, project_id, plan_id, amount, paid_on, method, note, created_at) VALUES ('p1', 'proj', NULL, 5000, '2026-11-01', 'breb', NULL, '2026-11-01')").run();
    resetSchemaFlag();
    await ensureSchema(db);
    resetSchemaFlag();
    const s = await loadPayments(db, "proj");
    expect(s.payments).toMatchObject([{ id: "p1", amount: 5000, method: "breb" }]);
    await db.prepare("INSERT INTO payments (id, project_id, amount, paid_on, method, created_at) VALUES ('p2', 'proj', 1, '2026-11-02', 'tarjeta', 'x')").run();
  });
});
