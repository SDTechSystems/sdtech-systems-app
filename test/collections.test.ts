import { describe, expect, it } from "vitest";
import worker from "../worker/index";
import { handleClients } from "../worker/api/clients";
import { handlePaymentPlans, handlePayments, handleProjectPayments } from "../worker/api/payments";
import { formatLongDate, todayBogota } from "../shared/dates";
import { handleProjects } from "../worker/api/projects";
import type { Collection, PaymentSummary, Project } from "../shared/types";
import { jsonRequest, makeEnv } from "./helpers";
import { approvedProject, B, newClient, owner, socio, type TestEnv } from "./fixtures";

const ctx = {} as ExecutionContext;
const DELIVERY = "https://drive.google.com/drive/folders/entrega-jen";

/** Proyecto manual sin cotización ni total, con una promesa «Pago» de $ 450.000 al 5 dic (caso Jen Essence). */
async function jenEssence(env: TestEnv) {
  const client = await newClient(env, "Jennifer Ríos");
  const r = await handleProjects(jsonRequest("POST", `${B}/projects`, { clientId: client.id, service: "marca", title: "Jen Essence" }), env, owner, ["projects"]);
  const projectId = ((await r.json()) as { project: Project }).project.id;
  const s = (await (
    await handleProjectPayments(jsonRequest("POST", `${B}/projects/${projectId}/payment-plans`, { label: "Pago", amount: 450000, dueDate: "2026-12-05" }), env, owner, ["projects", projectId, "payment-plans"])
  ).json()) as PaymentSummary;
  return { client, projectId, planId: s.plans[0].id };
}

const issue = (env: TestEnv, pid: string, body: object, s = owner) => handleProjects(jsonRequest("POST", `${B}/projects/${pid}/collections`, body), env, s, ["projects", pid, "collections"]);
const issued = async (env: TestEnv, pid: string, body: object) => {
  const r = await issue(env, pid, body);
  expect(r.status).toBe(201);
  return ((await r.json()) as { collection: Collection }).collection;
};
const planLine = (planId: string) => ({ source: "plan", planId, title: "Pago", detail: "", quantity: 1, unitPrice: 1 });
const freeLine = (unitPrice: number, source = "free") => ({ source, title: "Ronda de ajustes", detail: "", quantity: 1, unitPrice });
const pay = (env: TestEnv, pid: string, body: object) =>
  handleProjectPayments(jsonRequest("POST", `${B}/projects/${pid}/payments`, { paidOn: "2026-11-26", method: "breb", ...body }), env, owner, ["projects", pid, "payments"]);
const getCollection = async (env: TestEnv, id: string) =>
  ((await (await worker.fetch(adminRequest("GET", `/collections/${id}`), env, ctx)).json()) as { collection: Collection }).collection;
const projectTotal = async (env: TestEnv, pid: string) =>
  (await env.DB.prepare("SELECT total FROM projects WHERE id = ?").bind(pid).first<{ total: number | null }>())!.total;
const plansOf = async (env: TestEnv, pid: string) =>
  ((await (await handleProjectPayments(jsonRequest("GET", `${B}/projects/${pid}/payments`), env, owner, ["projects", pid, "payments"])).json()) as PaymentSummary).plans;
const portalUrl = async (env: TestEnv, clientId: string) =>
  ((await (await handleClients(jsonRequest("POST", `${B}/clients/${clientId}/portal-link`, {}), env, owner, ["clients", clientId, "portal-link"])).json()) as { url: string }).url;
const adminRequest = (method: string, path: string, body?: object) => jsonRequest(method, `${B}${path}`, body);

/** Los pagos anteriores a la cuenta se separan por created_at: deja pasar un milisegundo. */
const tick = () => new Promise((r) => setTimeout(r, 2));
const voidCollection = (env: TestEnv, id: string) => worker.fetch(adminRequest("POST", `/collections/${id}/void`, {}), env, ctx);
const errorOf = async (r: Response) => ((await r.json()) as { error: string }).error;

/** El worker en pruebas autentica con DEV_AUTH_EMAIL (sin Access). */
const devEnv = async (email = "juan@example.com") => makeEnv({ ACCESS_AUD: "", DEV_AUTH_EMAIL: email });

describe("collections", () => {
  it("bills a project with no quote and no total from its payment promise (Jen Essence)", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const c = await issued(env, projectId, { lines: [planLine(planId)], setTotal: true });
    expect(c).toMatchObject({ number: "CC-0001", total: 450000, planIds: [planId], status: "pending", paid: 0, currency: "COP", projectTitle: "Jen Essence", dueDate: null });
    const row = await env.DB.prepare("SELECT own_plan_id FROM collections WHERE id = ?").bind(c.id).first<{ own_plan_id: string | null }>();
    expect(row!.own_plan_id).toBeNull();
    expect(await projectTotal(env, projectId)).toBe(450000);
    const log = await env.DB.prepare("SELECT detail FROM activity_log WHERE action = 'collection_total'").first<{ detail: string }>();
    expect(JSON.parse(log!.detail)).toEqual({ number: "CC-0001", before: null, after: 450000 });
    expect((await plansOf(env, projectId)).map((p) => p.label)).toEqual(["Pago"]);
  });

  it("creates its own promise when it has a due date and non-plan lines", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const c = await issued(env, projectId, { lines: [planLine(planId), freeLine(200000)], dueDate: "2026-12-05" });
    expect(c.total).toBe(650000);
    const own = (await plansOf(env, projectId)).find((p) => p.label === "CC-0001")!;
    expect(own).toMatchObject({ amount: 200000, dueDate: "2026-12-05" });
    expect(c.planIds.sort()).toEqual([planId, own.id].sort());
    expect(c.dueDate).toBe("2026-12-05");
  });

  it("adds catalog and free lines to the project total only with addToTotal", async () => {
    const env = await devEnv();
    const { projectId } = await approvedProject(env);
    await issued(env, projectId, { lines: [freeLine(40000, "catalog")], setTotal: true });
    expect(await projectTotal(env, projectId)).toBe(770000);
    await issued(env, projectId, { lines: [freeLine(100000, "balance")], addToTotal: true });
    expect(await projectTotal(env, projectId)).toBe(770000);
    await issued(env, projectId, { lines: [freeLine(40000, "catalog"), freeLine(100000, "balance")], addToTotal: true });
    expect(await projectTotal(env, projectId)).toBe(810000);
    const logs = await env.DB.prepare("SELECT detail FROM activity_log WHERE action = 'collection_total'").all<{ detail: string }>();
    expect(logs.results.map((l) => JSON.parse(l.detail))).toEqual([{ number: "CC-0003", before: 770000, after: 810000 }]);
  });

  it("is paid when a payment is recorded from Pagos against a linked promise, and pending again when it is deleted", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const c = await issued(env, projectId, { lines: [planLine(planId)] });
    const s = (await (await pay(env, projectId, { amount: 450000, planId })).json()) as PaymentSummary;
    expect(await getCollection(env, c.id)).toMatchObject({ status: "paid", paid: 450000 });
    await handlePayments(jsonRequest("DELETE", `${B}/payments/${s.payments[0].id}`), env, owner, ["payments", s.payments[0].id]);
    expect(await getCollection(env, c.id)).toMatchObject({ status: "pending", paid: 0 });
  });

  it("counts a payment registered from the collection once, even if it also names a linked plan", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const c = await issued(env, projectId, { lines: [planLine(planId)] });
    expect((await pay(env, projectId, { amount: 150000, planId, collectionId: c.id })).status).toBe(201);
    const s = (await (await pay(env, projectId, { amount: 100000, collectionId: c.id })).json()) as PaymentSummary;
    expect(s.payments.every((p) => p.planId === planId)).toBe(true);
    expect(await getCollection(env, c.id)).toMatchObject({ status: "partial", paid: 250000 });
    const other = await jenEssence(env);
    expect((await pay(env, other.projectId, { amount: 1000, collectionId: c.id })).status).toBe(400);
  });

  it("shows 'partial' with an abono", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const c = await issued(env, projectId, { lines: [planLine(planId)] });
    await pay(env, projectId, { amount: 200000, planId });
    expect(await getCollection(env, c.id)).toMatchObject({ status: "partial", paid: 200000, total: 450000 });
  });

  it("never takes the client's price for a plan line", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    await pay(env, projectId, { amount: 50000, planId });
    await tick();
    const c = await issued(env, projectId, { lines: [{ ...planLine(planId), quantity: 3 }] });
    expect(c.total).toBe(400000);
    expect(c.lines[0]).toMatchObject({ quantity: 1, unitPrice: 400000, total: 400000 });
    expect(c).toMatchObject({ paid: 0, status: "pending" });
    await pay(env, projectId, { amount: 400000, planId });
    expect(await getCollection(env, c.id)).toMatchObject({ paid: 400000, status: "paid" });
    expect((await issue(env, projectId, { lines: [planLine(planId)] })).status).toBe(400);
  });

  it("does not count payments made to a linked promise before the collection was issued", async () => {
    const env = await devEnv();
    const { client, projectId, planId } = await jenEssence(env);
    await pay(env, projectId, { amount: 50000, planId });
    await tick();
    const c = await issued(env, projectId, { lines: [planLine(planId)] });
    expect(c).toMatchObject({ total: 400000, paid: 0, status: "pending" });
    await pay(env, projectId, { amount: 350000, planId });
    expect(await getCollection(env, c.id)).toMatchObject({ paid: 350000, status: "partial" });
    expect(await (await worker.fetch(new Request(await portalUrl(env, client.id)), env, ctx)).text()).toContain("Abonada · falta $ 50.000");
    await pay(env, projectId, { amount: 50000, planId });
    expect(await getCollection(env, c.id)).toMatchObject({ paid: 400000, status: "paid" });
    expect((await plansOf(env, projectId))[0].status).toBe("paid");
  });

  it("rejects a promise already billed in another open collection, until that one is voided", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const first = await issued(env, projectId, { lines: [planLine(planId)] });
    const r = await issue(env, projectId, { lines: [planLine(planId)] });
    expect(r.status).toBe(400);
    expect(await errorOf(r)).toBe("plan_already_billed");
    await voidCollection(env, first.id);
    expect((await issue(env, projectId, { lines: [planLine(planId)] })).status).toBe(201);
  });

  it("rejects a payment from a collection that names a promise the collection does not bill", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const s = (await (
      await handleProjectPayments(jsonRequest("POST", `${B}/projects/${projectId}/payment-plans`, { label: "Saldo", amount: 100000, dueDate: "2026-12-20" }), env, owner, ["projects", projectId, "payment-plans"])
    ).json()) as PaymentSummary;
    const unlinked = s.plans.find((p) => p.label === "Saldo")!.id;
    const c = await issued(env, projectId, { lines: [planLine(planId)] });
    const r = await pay(env, projectId, { amount: 1000, collectionId: c.id, planId: unlinked });
    expect(r.status).toBe(400);
    expect(await errorOf(r)).toBe("invalid_plan");
  });

  it("does not let a promise billed in an open collection be deleted", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const c = await issued(env, projectId, { lines: [planLine(planId)] });
    const del = () => handlePaymentPlans(jsonRequest("DELETE", `${B}/payment-plans/${planId}`), env, owner, ["payment-plans", planId]);
    const r = await del();
    expect(r.status).toBe(409);
    expect(await errorOf(r)).toBe("plan_in_collection");
    await voidCollection(env, c.id);
    expect((await del()).status).toBe(200);
  });

  it("keeps its own promise on void when it was marked paid by hand", async () => {
    const env = await devEnv();
    const { projectId } = await jenEssence(env);
    const c = await issued(env, projectId, { lines: [freeLine(100000)], dueDate: "2026-12-10" });
    const own = (await plansOf(env, projectId)).find((p) => p.label === c.number)!;
    await handlePaymentPlans(jsonRequest("PATCH", `${B}/payment-plans/${own.id}`, { paid: true }), env, owner, ["payment-plans", own.id]);
    await voidCollection(env, c.id);
    expect((await plansOf(env, projectId)).map((p) => p.id)).toContain(own.id);
  });

  it("treats an empty due date as no date", async () => {
    const env = await devEnv();
    const { projectId } = await jenEssence(env);
    const c = await issued(env, projectId, { lines: [freeLine(100000)], dueDate: "" });
    expect(c.dueDate).toBeNull();
    expect((await plansOf(env, projectId)).map((p) => p.label)).toEqual(["Pago"]);
  });

  it("validates lines, plans, dates and links", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const other = await jenEssence(env);
    const code = async (body: object) => ((await (await issue(env, projectId, body)).json()) as { error: string }).error;
    expect(await code({ lines: [] })).toBe("lines_required");
    expect(await code({ lines: [{ ...freeLine(1000), title: " " }] })).toBe("invalid_line");
    expect(await code({ lines: [{ ...freeLine(1000), quantity: 0 }] })).toBe("invalid_line");
    expect(await code({ lines: [freeLine(-1)] })).toBe("invalid_line");
    expect(await code({ lines: [planLine(other.planId)] })).toBe("invalid_plan");
    expect(await code({ lines: [planLine(planId), planLine(planId)] })).toBe("invalid_plan");
    expect(await code({ lines: [freeLine(1000)], dueDate: "5 dic" })).toBe("invalid_date");
    expect(await code({ lines: [freeLine(1000)], paymentUrl: "http://bold.co/x" })).toBe("invalid_url");
    expect(await code({ lines: [freeLine(0)] })).toBe("invalid_amount");
  });

  it("rejects includeDelivery without a delivery link", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const r = await issue(env, projectId, { lines: [planLine(planId)], includeDelivery: true });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "delivery_url_required" });
  });

  it("voiding deletes its own unpaid promise and keeps linked ones", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const c = await issued(env, projectId, { lines: [planLine(planId), freeLine(200000)], dueDate: "2026-12-05" });
    const r = await worker.fetch(adminRequest("POST", `/collections/${c.id}/void`, {}), env, ctx);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { collection: Collection }).collection.status).toBe("voided");
    expect((await plansOf(env, projectId)).map((p) => p.id)).toEqual([planId]);
    const log = await env.DB.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE action = 'collection_voided'").first<{ n: number }>();
    expect(log!.n).toBe(1);
    expect((await pay(env, projectId, { amount: 1000, collectionId: c.id })).status).toBe(400);

    const paidOwn = await issued(env, projectId, { lines: [freeLine(100000)], dueDate: "2026-12-10" });
    const own = (await plansOf(env, projectId)).find((p) => p.label === paidOwn.number)!;
    await pay(env, projectId, { amount: 50000, collectionId: paidOwn.id });
    await worker.fetch(adminRequest("POST", `/collections/${paidOwn.id}/void`, {}), env, ctx);
    expect((await plansOf(env, projectId)).map((p) => p.id)).toContain(own.id);
  });

  it("lists a project's collections newest first", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    await issued(env, projectId, { lines: [planLine(planId)] });
    await issued(env, projectId, { lines: [freeLine(1000)] });
    const r = await handleProjects(jsonRequest("GET", `${B}/projects/${projectId}/collections`), env, owner, ["projects", projectId, "collections"]);
    expect(((await r.json()) as { collections: Collection[] }).collections.map((c) => c.number)).toEqual(["CC-0002", "CC-0001"]);
  });

  it("collaborator gets 403", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    const c = await issued(env, projectId, { lines: [planLine(planId)] });
    expect((await issue(env, projectId, { lines: [planLine(planId)] }, socio)).status).toBe(403);
    expect((await handleProjects(jsonRequest("GET", `${B}/projects/${projectId}/collections`), env, socio, ["projects", projectId, "collections"])).status).toBe(403);
    await env.DB.prepare("INSERT INTO users (email, role, created_at) VALUES (?, 'collaborator', ?)").bind(socio.email, "2026-11-26T00:00:00Z").run();
    const asSocio = { ...env, DEV_AUTH_EMAIL: socio.email };
    expect((await worker.fetch(adminRequest("GET", `/collections/${c.id}`), asSocio, ctx)).status).toBe(403);
    expect((await worker.fetch(adminRequest("POST", `/collections/${c.id}/void`, {}), asSocio, ctx)).status).toBe(403);
  });

  it("portal shows the collection with the delivery link when included, while the project delivery stays hidden", async () => {
    const env = await devEnv();
    const { client, projectId, planId } = await jenEssence(env);
    await handleProjects(jsonRequest("PATCH", `${B}/projects/${projectId}`, { deliveryUrl: DELIVERY }), env, owner, ["projects", projectId]);
    await issued(env, projectId, { lines: [planLine(planId)], includeDelivery: true, paymentUrl: "https://bold.co/pay/jen", note: "Gracias, Jen", dueDate: "2026-12-05" });
    const url = await portalUrl(env, client.id);
    const doc = await worker.fetch(new Request(`${url}/cobro/CC-0001`), env, ctx);
    expect(doc.status).toBe(200);
    const html = await doc.text();
    for (const t of [
      "CUENTA DE COBRO",
      "CC-0001",
      "Por los servicios prestados, el valor a pagar es:",
      "cuatrocientos cincuenta mil pesos",
      "Fecha acordada de pago: 5 de diciembre de 2026",
      "Proyecto: Jen Essence",
      "Medios de pago",
      "<li><strong>Bre-B</strong>: 3058147293 · Davibank</li>",
      "Tarjeta",
      "Pagar en línea",
      `href="${DELIVERY}"`,
      "Tu entrega",
      "Gracias, Jen",
      "Gracias por confiar en SD Tech Systems.",
    ])
      expect(html).toContain(t);
    expect(html).not.toContain("Bancolombia");
    expect(html).not.toContain("DEBE A");

    const home = await (await worker.fetch(new Request(url), env, ctx)).text();
    expect(home).toContain("Cuentas de cobro");
    expect(home).toContain(`/cobro/CC-0001`);
    expect(home).toContain("Pendiente");
    expect(home).not.toContain("Tu entrega está lista");
    expect(home).not.toContain(DELIVERY);

    await handleProjects(jsonRequest("POST", `${B}/projects/${projectId}/delivery`, { release: true }), env, owner, ["projects", projectId, "delivery"]);
    expect(await (await worker.fetch(new Request(url), env, ctx)).text()).toContain("Tu entrega está lista");
  });

  it("portal lists abonada and paid collections and hides voided ones", async () => {
    const env = await devEnv();
    const { client, projectId, planId } = await jenEssence(env);
    await issued(env, projectId, { lines: [planLine(planId)] });
    const voided = await issued(env, projectId, { lines: [freeLine(1000)] });
    await worker.fetch(adminRequest("POST", `/collections/${voided.id}/void`, {}), env, ctx);
    await issued(env, projectId, { lines: [freeLine(1000)], dueDate: "2026-12-20" });
    await pay(env, projectId, { amount: 200000, planId });
    const url = await portalUrl(env, client.id);
    let home = await (await worker.fetch(new Request(url), env, ctx)).text();
    expect(home).toContain("Abonada · falta $ 250.000");
    expect(home).toContain(`Jen Essence · Emitida el ${formatLongDate(todayBogota())}</div>`);
    expect(home).toContain(`Emitida el ${formatLongDate(todayBogota())} · Fecha acordada de pago: 20 de diciembre de 2026`);
    expect(home).not.toContain("CC-0002");
    await pay(env, projectId, { amount: 250000, planId });
    home = await (await worker.fetch(new Request(url), env, ctx)).text();
    expect(home).toContain("Pagada");
  });

  it("portal returns 404 for another client's collection", async () => {
    const env = await devEnv();
    const { projectId, planId } = await jenEssence(env);
    await issued(env, projectId, { lines: [planLine(planId)] });
    const other = await newClient(env, "Bruno Ruiz");
    const r = await worker.fetch(new Request(`${await portalUrl(env, other.id)}/cobro/CC-0001`), env, ctx);
    expect(r.status).toBe(404);
  });

  it("uses the USD text as the only payment method for a project in dollars", async () => {
    const env = await devEnv();
    const client = await newClient(env, "Ana USD");
    const r = await handleProjects(jsonRequest("POST", `${B}/projects`, { clientId: client.id, service: "web", title: "Landing USD", total: 50000, currency: "USD" }), env, owner, ["projects"]);
    const pid = ((await r.json()) as { project: Project }).project.id;
    const c = await issued(env, pid, { lines: [freeLine(50000, "balance")] });
    expect(c.currency).toBe("USD");
    expect(c.methods).toEqual([{ name: "Pago", detail: "" }]);
  });
});
