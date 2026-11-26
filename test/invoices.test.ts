import { describe, expect, it } from "vitest";
import worker from "../worker/index";
import { handleInvoices } from "../worker/api/invoices";
import { handleProjects } from "../worker/api/projects";
import { handleChanges } from "../worker/api/changes";
import { handleProjectPayments } from "../worker/api/payments";
import { handleClients } from "../worker/api/clients";
import type { ChangeRequest, Invoice } from "../shared/types";
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
const issue = (env: TestEnv, pid: string, s = owner) => handleProjects(jsonRequest("POST", `${B}/projects/${pid}/invoices`, {}), env, s, ["projects", pid, "invoices"]);
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
    expect(inv).toMatchObject({ number: "FAC-0001", total: 920000, paid: 385000, balance: 535000, voided: false });
    expect(inv.lines.map((l) => l.title)).toEqual(["Landing page", "Fotos de producto", "Cambio aprobado: Sección de blog"]);
    expect(inv.verifyCode).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    await handleProjectPayments(jsonRequest("POST", `${B}/projects/${projectId}/payments`, { amount: 100000, paidOn: "2026-11-26", method: "nequi" }), env, owner, ["projects", projectId, "payments"]);
    const list = ((await (await handleProjects(jsonRequest("GET", `${B}/projects/${projectId}/invoices`), env, owner, ["projects", projectId, "invoices"])).json()) as { invoices: Invoice[] }).invoices;
    expect(list[0]).toMatchObject({ paid: 385000, balance: 535000 });
  });

  it("renders the invoice only for its own client", async () => {
    const env = await makeEnv();
    const { projectId, client } = await billedProject(env);
    const inv = ((await (await issue(env, projectId)).json()) as { invoice: Invoice }).invoice;
    const html = await (await worker.fetch(new Request(`${await portal(env, client.id)}/factura/FAC-0001`), env, ctx)).text();
    for (const t of ["RECIBO DE PAGO", "FAC-0001", "Cambio aprobado", "$ 535.000", inv.verifyCode, "<svg"]) expect(html).toContain(t);
    const other = await newClient(env, "Bruno Ruiz");
    expect((await worker.fetch(new Request(`${await portal(env, other.id)}/factura/FAC-0001`), env, ctx)).status).toBe(404);
  });

  it("verifies an invoice publicly without exposing private data", async () => {
    const env = await makeEnv();
    const { projectId } = await billedProject(env);
    const inv = ((await (await issue(env, projectId)).json()) as { invoice: Invoice }).invoice;
    let r = await worker.fetch(new Request(`${P}/verificar/${inv.verifyCode}`), env, ctx);
    let html = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    expect(html).toContain("Válida");
    expect(html).toContain("María G.");
    expect(html).not.toContain("/c/");
    expect(html).not.toContain("3058147293");
    await handleInvoices(jsonRequest("POST", `${B}/invoices/${inv.id}/void`, {}), env, owner, ["invoices", inv.id, "void"]);
    html = await (await worker.fetch(new Request(`${P}/verificar/${inv.verifyCode}`), env, ctx)).text();
    expect(html).toContain("Anulada");
    r = await worker.fetch(new Request(`${P}/verificar/ABCDEFGHJK`), env, ctx);
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("No encontramos esta factura");
  });

  it("is owner-only", async () => {
    const env = await makeEnv();
    const { projectId } = await billedProject(env);
    expect((await issue(env, projectId, socio)).status).toBe(403);
  });
});
