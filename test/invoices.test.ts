import { describe, expect, it } from "vitest";
import worker from "../worker/index";
import { handleInvoices } from "../worker/api/invoices";
import { handleCollections } from "../worker/api/collections";
import { handleProjects } from "../worker/api/projects";
import { handleChanges } from "../worker/api/changes";
import { handleProjectPayments } from "../worker/api/payments";
import { handleClients } from "../worker/api/clients";
import type { ChangeRequest, Collection, Invoice, PaymentSummary, Project } from "../shared/types";
import { jsonRequest, makeEnv } from "./helpers";
import { approvedProject, B, newClient, owner, socio, type TestEnv } from "./fixtures";

const ctx = {} as ExecutionContext;
const P = "https://clientes.sdtechsystems.dev";

async function billedProject(env: TestEnv) {
  const { projectId, client } = await approvedProject(env);
  const ch = ((await (await handleProjects(jsonRequest("POST", `${B}/projects/${projectId}/changes`, { description: "Sección de blog", amount: 150000 }), env, owner, ["projects", projectId, "changes"])).json()) as { change: ChangeRequest }).change;
  await handleChanges(jsonRequest("POST", `${B}/changes/${ch.id}/approve`, {}), env, owner, ["changes", ch.id, "approve"]);
  await handleProjectPayments(jsonRequest("POST", `${B}/projects/${projectId}/payments`, { amount: 385000, paidOn: "2026-11-25", method: "breb" }), env, owner, ["projects", projectId, "payments"]);
  return { projectId, client };
}
const issue = (env: TestEnv, pid: string, s = owner, body: object = {}) => handleProjects(jsonRequest("POST", `${B}/projects/${pid}/invoices`, body), env, s, ["projects", pid, "invoices"]);
const issued = async (env: TestEnv, pid: string, body: object = {}) => {
  const r = await issue(env, pid, owner, body);
  expect(r.status).toBe(201);
  return ((await r.json()) as { invoice: Invoice }).invoice;
};
const errorOf = async (r: Response) => ((await r.json()) as { error: string }).error;
const pay = async (env: TestEnv, pid: string, body: object) =>
  (await (await handleProjectPayments(jsonRequest("POST", `${B}/projects/${pid}/payments`, { paidOn: "2026-11-26", method: "breb", ...body }), env, owner, ["projects", pid, "payments"])).json()) as PaymentSummary;
/** Proyecto manual, sin cotización; con total solo si se da. */
async function manualProject(env: TestEnv, extra: object = {}) {
  const client = await newClient(env, "Jennifer Ríos");
  const r = await handleProjects(jsonRequest("POST", `${B}/projects`, { clientId: client.id, service: "marca", title: "Jen Essence", ...extra }), env, owner, ["projects"]);
  return { client, projectId: ((await r.json()) as { project: Project }).project.id };
}
const free = (title: string, unitPrice: number) => ({ source: "free", title, detail: "", quantity: 1, unitPrice });
async function portal(env: TestEnv, clientId: string) {
  return ((await (await handleClients(jsonRequest("POST", `${B}/clients/${clientId}/portal-link`, {}), env, owner, ["clients", clientId, "portal-link"])).json()) as { url: string }).url;
}

describe("invoices", () => {
  it("bills quote items plus approved changes, with payments and balance, frozen at issue time", async () => {
    const env = await makeEnv();
    const { projectId } = await billedProject(env);
    const r = await issue(env, projectId);
    expect(r.status).toBe(201);
    const inv = ((await r.json()) as { invoice: Invoice }).invoice;
    expect(inv).toMatchObject({ number: "REC-0001", total: 920000, paid: 385000, balance: 535000, projectBalance: 535000, collectionId: null, collectionNumber: null, voided: false });
    expect(inv.lines.map((l) => l.title)).toEqual(["Landing page", "Fotos de producto", "Cambio aprobado: Sección de blog"]);
    expect(inv.verifyCode).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    await handleProjectPayments(jsonRequest("POST", `${B}/projects/${projectId}/payments`, { amount: 100000, paidOn: "2026-11-26", method: "nequi" }), env, owner, ["projects", projectId, "payments"]);
    const list = ((await (await handleProjects(jsonRequest("GET", `${B}/projects/${projectId}/invoices`), env, owner, ["projects", projectId, "invoices"])).json()) as { invoices: Invoice[] }).invoices;
    expect(list[0]).toMatchObject({ paid: 385000, balance: 535000 });
  });

  it("renders the receipt at /recibo and /factura only for its own client", async () => {
    const env = await makeEnv();
    const { projectId, client } = await billedProject(env);
    const inv = ((await (await issue(env, projectId)).json()) as { invoice: Invoice }).invoice;
    const url = await portal(env, client.id);
    for (const path of ["recibo", "factura"]) {
      const html = await (await worker.fetch(new Request(`${url}/${path}/REC-0001`), env, ctx)).text();
      for (const t of ["RECIBO DE PAGO", "REC-0001", "Cambio aprobado", "Saldo del proyecto: $ 535.000", "Emitido: ", inv.verifyCode, "<svg"]) expect(html).toContain(t);
      expect(html).not.toContain("Emitida");
    }
    const home = await (await worker.fetch(new Request(url), env, ctx)).text();
    expect(home).toContain("Recibos de pago");
    expect(home).toContain(`/recibo/REC-0001`);
    expect(home).toContain(`<span class="badge ok">Emitido</span>`);
    await handleInvoices(jsonRequest("POST", `${B}/invoices/${inv.id}/void`, {}), env, owner, ["invoices", inv.id, "void"]);
    expect(await (await worker.fetch(new Request(url), env, ctx)).text()).toContain(`<span class="badge off">Anulado</span>`);
    expect(await (await worker.fetch(new Request(`${url}/recibo/REC-0001`), env, ctx)).text()).toContain(`<div class="void">ANULADO</div>`);
    expect(home).not.toMatch(/factura/i);
    const other = await newClient(env, "Bruno Ruiz");
    for (const path of ["recibo", "factura"]) expect((await worker.fetch(new Request(`${await portal(env, other.id)}/${path}/REC-0001`), env, ctx)).status).toBe(404);
  });

  it("verifies an invoice publicly without exposing private data", async () => {
    const env = await makeEnv();
    const { projectId } = await billedProject(env);
    const inv = ((await (await issue(env, projectId)).json()) as { invoice: Invoice }).invoice;
    let r = await worker.fetch(new Request(`${P}/verificar/${inv.verifyCode}`), env, ctx);
    let html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain("Verificación de recibo");
    expect(html).not.toMatch(/factura/i);
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    for (const t of ["Válido", "<dt>Emitido</dt>", "Emitido por SD Tech Systems", "María G."]) expect(html).toContain(t);
    expect(html).not.toMatch(/Válida|Emitida/);
    expect(html).not.toContain("/c/");
    expect(html).not.toContain("3058147293");
    await handleInvoices(jsonRequest("POST", `${B}/invoices/${inv.id}/void`, {}), env, owner, ["invoices", inv.id, "void"]);
    html = await (await worker.fetch(new Request(`${P}/verificar/${inv.verifyCode}`), env, ctx)).text();
    expect(html).toContain("Anulado");
    expect(html).not.toContain("Anulada");
    r = await worker.fetch(new Request(`${P}/verificar/ABCDEFGHJK`), env, ctx);
    expect(r.status).toBe(404);
    html = await r.text();
    expect(html).toContain("No encontramos este recibo. Revisa el código o escríbenos.");
    expect(html).toContain("NO ENCONTRADO<");
    expect(html).not.toMatch(/factura/i);
  });

  it("is owner-only", async () => {
    const env = await makeEnv();
    const { projectId } = await billedProject(env);
    expect((await issue(env, projectId, socio)).status).toBe(403);
  });

  it("issues REC-0001 from a paid collection with its lines and only its payments", async () => {
    const env = await makeEnv();
    const { projectId } = await manualProject(env, { total: 450000 });
    const cr = await handleProjects(jsonRequest("POST", `${B}/projects/${projectId}/collections`, { lines: [{ ...free("Anticipo 50%", 225000), source: "advance" }] }), env, owner, ["projects", projectId, "collections"]);
    const c = ((await cr.json()) as { collection: Collection }).collection;
    const s = await pay(env, projectId, { amount: 225000, collectionId: c.id });
    const inv = await issued(env, projectId, { collectionId: c.id });
    expect(inv).toMatchObject({ number: "REC-0001", total: 225000, paid: 225000, balance: 0, projectBalance: 225000, collectionId: c.id, collectionNumber: c.number });
    expect(inv.lines).toEqual([{ title: "Anticipo 50%", detail: "", quantity: 1, unitPrice: 225000, total: 225000 }]);
    expect(inv.paymentIds).toEqual([s.payments[0].id]);
    expect(inv.payments).toEqual([{ paidOn: "2026-11-26", method: "breb", amount: 225000 }]);
  });

  it("issues a receipt for a project with no quote and no total when lines are given (contado)", async () => {
    const env = await makeEnv();
    const { projectId } = await manualProject(env);
    await pay(env, projectId, { amount: 120000 });
    const inv = await issued(env, projectId, { lines: [free("Diseño de logo", 120000)] });
    expect(inv).toMatchObject({ number: "REC-0001", total: 120000, paid: 120000, balance: 0, projectBalance: null });
    expect(inv.lines).toEqual([{ title: "Diseño de logo", detail: "", quantity: 1, unitPrice: 120000, total: 120000 }]);
  });

  it("adds what collections added to the total as their own lines in a later receipt", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    const cc = (body: object) => handleProjects(jsonRequest("POST", `${B}/projects/${projectId}/collections`, body), env, owner, ["projects", projectId, "collections"]);
    expect((await cc({ lines: [free("Ronda de ajustes", 40000), { ...free("Saldo pendiente", 100000), source: "balance" }], addToTotal: true })).status).toBe(201);
    const voided = ((await (await cc({ lines: [free("Fotos extra", 30000)], addToTotal: true })).json()) as { collection: Collection }).collection;
    await handleCollections(jsonRequest("POST", `${B}/collections/${voided.id}/void`, { revertTotal: true }), env, owner, ["collections", voided.id, "void"]);
    const inv = await issued(env, projectId);
    expect(inv.lines.map((l) => [l.title, l.total])).toEqual([
      ["Landing page", 650000],
      ["Fotos de producto", 120000],
      ["Ronda de ajustes", 40000],
    ]);
    expect(inv.total).toBe(810000);
  });

  it("without a quote, the project-total line leaves out what collections added (no double count)", async () => {
    const env = await makeEnv();
    const { projectId } = await manualProject(env, { total: 450000 });
    expect((await handleProjects(jsonRequest("POST", `${B}/projects/${projectId}/collections`, { lines: [free("Ronda de ajustes", 40000)], addToTotal: true }), env, owner, ["projects", projectId, "collections"])).status).toBe(201);
    const inv = await issued(env, projectId);
    expect(inv.lines.map((l) => [l.title, l.total])).toEqual([
      ["Jen Essence", 450000],
      ["Ronda de ajustes", 40000],
    ]);
  });

  it("returns lines_required, not nothing_to_bill, when there is nothing to bill", async () => {
    const env = await makeEnv();
    const { projectId } = await manualProject(env);
    expect(await errorOf(await issue(env, projectId))).toBe("lines_required");
    expect(await errorOf(await issue(env, projectId, owner, { lines: [] }))).toBe("lines_required");
  });

  it("defaults to payments not already in another receipt", async () => {
    const env = await makeEnv();
    const { projectId, client } = await billedProject(env);
    const first = await issued(env, projectId);
    const s = await pay(env, projectId, { amount: 100000, method: "nequi" });
    const second = await issued(env, projectId);
    // La columna balance se guarda (total − pagado), pero el documento solo muestra el saldo del proyecto.
    expect(second).toMatchObject({ number: "REC-0002", total: 920000, paid: 100000, balance: 820000, projectBalance: 435000 });
    const doc = await (await worker.fetch(new Request(`${await portal(env, client.id)}/recibo/REC-0002`), env, ctx)).text();
    expect(doc).toContain("Saldo del proyecto: $ 435.000");
    expect(doc).not.toContain("820.000");
    expect(second.paymentIds).toEqual([s.payments[0].id]);
    expect(first.paymentIds).toEqual([s.payments[1].id]);
    await handleInvoices(jsonRequest("POST", `${B}/invoices/${first.id}/void`, {}), env, owner, ["invoices", first.id, "void"]);
    expect((await issued(env, projectId)).paymentIds).toEqual([s.payments[1].id]);
    const none = await issued(env, projectId, { paymentIds: [] });
    expect(none).toMatchObject({ paid: 0, balance: 920000, payments: [], paymentIds: [] });
  });

  it("takes chosen payments and plan lines at the plan's full amount, and validates them", async () => {
    const env = await makeEnv();
    const { projectId } = await manualProject(env, { total: 450000 });
    const plans = (await (await handleProjectPayments(jsonRequest("POST", `${B}/projects/${projectId}/payment-plans`, { label: "Pago", amount: 450000, dueDate: "2026-12-05" }), env, owner, ["projects", projectId, "payment-plans"])).json()) as PaymentSummary;
    const planId = plans.plans[0].id;
    const s = await pay(env, projectId, { amount: 450000, planId });
    const inv = await issued(env, projectId, { lines: [{ source: "plan", planId, title: "Pago", detail: "", quantity: 1, unitPrice: 1 }], paymentIds: [s.payments[0].id] });
    expect(inv).toMatchObject({ total: 450000, paid: 450000, balance: 0, projectBalance: 0 });
    const other = await manualProject(env);
    const foreign = await pay(env, other.projectId, { amount: 1000 });
    expect(await errorOf(await issue(env, projectId, owner, { paymentIds: [foreign.payments[0].id] }))).toBe("invalid_payment");
    expect(await errorOf(await issue(env, projectId, owner, { paymentIds: [s.payments[0].id, s.payments[0].id] }))).toBe("invalid_payment");
    expect(await errorOf(await issue(env, projectId, owner, { paymentIds: "x" }))).toBe("invalid_payment");
    expect(await errorOf(await issue(env, projectId, owner, { lines: [{ source: "plan", planId: "nope", title: "Pago", detail: "", quantity: 1, unitPrice: 1 }] }))).toBe("invalid_plan");
    expect(await errorOf(await issue(env, projectId, owner, { lines: [free("", 1000)] }))).toBe("invalid_line");
    expect(await errorOf(await issue(env, projectId, owner, { lines: [{ ...free("Ajuste", 1000), detail: "a".repeat(2001) }] }))).toBe("detail_too_long");
    expect(await errorOf(await issue(env, projectId, owner, { collectionId: "nope" }))).toBe("invalid_collection");
  });

  it("rejects a voided collection or one from another project", async () => {
    const env = await makeEnv();
    const { projectId } = await manualProject(env, { total: 450000 });
    const make = async (pid: string) =>
      ((await (await handleProjects(jsonRequest("POST", `${B}/projects/${pid}/collections`, { lines: [free("Anticipo", 225000)] }), env, owner, ["projects", pid, "collections"])).json()) as { collection: Collection }).collection;
    const c = await make(projectId);
    const other = await manualProject(env);
    const foreign = await make(other.projectId);
    expect(await errorOf(await issue(env, projectId, owner, { collectionId: foreign.id }))).toBe("invalid_collection");
    expect((await handleCollections(jsonRequest("POST", `${B}/collections/${c.id}/void`, {}), env, owner, ["collections", c.id, "void"])).status).toBe(200);
    expect(await errorOf(await issue(env, projectId, owner, { collectionId: c.id }))).toBe("invalid_collection");
  });

  it("keeps FAC-0001 viewable and verifiable after the rename", async () => {
    const env = await makeEnv();
    const { projectId, client } = await billedProject(env);
    const snapshot = {
      lines: [{ title: "Landing page", detail: "", quantity: 1, unitPrice: 920000, total: 920000 }],
      payments: [{ paidOn: "2026-11-25", method: "breb", amount: 385000 }],
      projectTitle: "Tienda Jen",
      client: { name: "María Gómez", company: null, document: null, city: null, phone: "573058147293", email: null },
    };
    await env.DB.prepare("INSERT INTO invoices (id, number, project_id, client_id, issued_at, currency, snapshot, total, paid, balance, verify_code, created_at) VALUES ('old', 'FAC-0001', ?, ?, '2026-11-20T15:00:00.000Z', 'COP', ?, 920000, 385000, 535000, 'OLDFACCODE', '2026-11-20T15:00:00.000Z')")
      .bind(projectId, client.id, JSON.stringify(snapshot))
      .run();
    const r = await worker.fetch(new Request(`${P}/verificar/OLDFACCODE`), env, ctx);
    const html = await r.text();
    expect(r.status).toBe(200);
    for (const t of ["Verificación de recibo", "Válido", "FAC-0001", "María G."]) expect(html).toContain(t);
    const list = ((await (await handleProjects(jsonRequest("GET", `${B}/projects/${projectId}/invoices`), env, owner, ["projects", projectId, "invoices"])).json()) as { invoices: Invoice[] }).invoices;
    expect(list[0]).toMatchObject({ number: "FAC-0001", projectBalance: null, collectionId: null, collectionNumber: null, paymentIds: [] });
    const doc = await (await worker.fetch(new Request(`${await portal(env, client.id)}/recibo/FAC-0001`), env, ctx)).text();
    for (const t of ["RECIBO DE PAGO", "FAC-0001", "$ 535.000"]) expect(doc).toContain(t);
    expect(doc).not.toContain("Saldo del proyecto");
    // Un FAC- viejo no tiene paymentIds: no cubre pagos, así que el primer REC- los toma todos.
    expect((await issued(env, projectId)).paid).toBe(385000);
  });

  it("answers nothing_paid for a collection with no payments, and does not repeat a collection's payments in a second receipt", async () => {
    const env = await makeEnv();
    const { projectId } = await manualProject(env, { total: 450000 });
    const cr = await handleProjects(jsonRequest("POST", `${B}/projects/${projectId}/collections`, { lines: [free("Kit de marca", 450000)] }), env, owner, ["projects", projectId, "collections"]);
    const c = ((await cr.json()) as { collection: Collection }).collection;
    const r = await issue(env, projectId, owner, { collectionId: c.id });
    expect(r.status).toBe(409);
    expect(await errorOf(r)).toBe("nothing_paid");
    const first = await pay(env, projectId, { amount: 200000, collectionId: c.id });
    expect((await issued(env, projectId, { collectionId: c.id })).paymentIds).toEqual([first.payments[0].id]);
    const second = await pay(env, projectId, { amount: 250000, collectionId: c.id, method: "nequi" });
    const again = await issued(env, projectId, { collectionId: c.id });
    expect(again).toMatchObject({ number: "REC-0002", paid: 250000, paymentIds: [second.payments[0].id], projectBalance: 0 });
  });

  it("bills Jen Essence: promise → collection → payment → receipt, with nothing billable before", async () => {
    const env = await makeEnv();
    const { projectId } = await manualProject(env);
    // Sin campos: el panel siempre manda JSON (readJson exige application/json en todo POST).
    const empty = await issue(env, projectId);
    expect(empty.status).toBe(400);
    expect(await errorOf(empty)).toBe("lines_required");
    const plans = (await (await handleProjectPayments(jsonRequest("POST", `${B}/projects/${projectId}/payment-plans`, { label: "Pago", amount: 450000, dueDate: "2026-12-05" }), env, owner, ["projects", projectId, "payment-plans"])).json()) as PaymentSummary;
    const planId = plans.plans[0].id;
    const cr = await handleProjects(jsonRequest("POST", `${B}/projects/${projectId}/collections`, { lines: [{ source: "plan", planId, title: "Pago", detail: "", quantity: 1, unitPrice: 1 }], setTotal: true }), env, owner, ["projects", projectId, "collections"]);
    const c = ((await cr.json()) as { collection: Collection }).collection;
    await pay(env, projectId, { amount: 450000, collectionId: c.id });
    const inv = await issued(env, projectId, { collectionId: c.id });
    expect(inv).toMatchObject({ number: "REC-0001", total: 450000, paid: 450000, projectBalance: 0, collectionNumber: "CC-0001", collectionId: c.id });
  });
});
