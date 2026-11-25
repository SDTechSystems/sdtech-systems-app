import { describe, expect, it } from "vitest";
import worker from "../worker/index";
import { handleClients } from "../worker/api/clients";
import { handleQuotes } from "../worker/api/quotes";
import { handleProjectPayments } from "../worker/api/payments";
import type { Session } from "../worker/auth/session";
import type { Client, Quote } from "../shared/types";
import { jsonRequest, makeEnv, OWNER } from "./helpers";

type Env = Awaited<ReturnType<typeof makeEnv>>;
const owner: Session = { email: OWNER, role: "owner" };
const B = "https://panel.sdtechsystems.dev/api/admin";
const P = "https://clientes.sdtechsystems.dev";
const ctx = {} as ExecutionContext;

async function newClient(env: Env, name: string) {
  const r = await handleClients(jsonRequest("POST", `${B}/clients`, { name }), env, owner, ["clients"]);
  return ((await r.json()) as { client: Client }).client;
}
async function portalUrl(env: Env, clientId: string, regenerate = false) {
  const r = await handleClients(jsonRequest("POST", `${B}/clients/${clientId}/portal-link`, regenerate ? { regenerate: true } : {}), env, owner, ["clients", clientId, "portal-link"]);
  return ((await r.json()) as { url: string }).url;
}
async function sentQuote(env: Env, clientId: string, extra: object = {}) {
  const items = [
    { title: "Landing page", detail: "Una página con 6 secciones", quantity: 1, unitPrice: 650000 },
    { title: "Página adicional", detail: "", quantity: 2, unitPrice: 120000 },
  ];
  const r = await handleQuotes(jsonRequest("POST", `${B}/quotes`, { clientId, service: "web", items, ...extra }), env, owner, ["quotes"]);
  const q = ((await r.json()) as { quote: Quote }).quote;
  await handleQuotes(jsonRequest("POST", `${B}/quotes/${q.id}/send`, {}), env, owner, ["quotes", q.id, "send"]);
  return q;
}
const fetchPortal = (env: Env, url: string, init?: RequestInit) => worker.fetch(new Request(url, init), env, ctx);
const tokenOf = (url: string) => url.split("/c/")[1];
const approve = (env: Env, token: string, quoteId: string, body: unknown) =>
  fetchPortal(env, `${P}/api/portal/${token}/quotes/${quoteId}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("client portal", () => {
  it("creates a long private link and regenerating invalidates the old one", async () => {
    const env = await makeEnv();
    const c = await newClient(env, "María Gómez");
    const first = await portalUrl(env, c.id);
    expect(first).toMatch(/^https:\/\/clientes\.sdtechsystems\.dev\/c\/[A-Za-z0-9_-]{43}$/);
    expect(await portalUrl(env, c.id)).toBe(first);
    const second = await portalUrl(env, c.id, true);
    expect(second).not.toBe(first);
    expect((await fetchPortal(env, first)).status).toBe(404);
    expect((await fetchPortal(env, second)).status).toBe(200);
  });

  it("shows only the client's own sent quotes, never drafts", async () => {
    const env = await makeEnv();
    const a = await newClient(env, "Ana Pérez");
    const b = await newClient(env, "Bruno Ruiz");
    await sentQuote(env, a.id);
    await sentQuote(env, b.id);
    await handleQuotes(jsonRequest("POST", `${B}/quotes`, { clientId: a.id, service: "web", items: [{ title: "Borrador secreto", quantity: 1, unitPrice: 1 }] }), env, owner, ["quotes"]);
    const r = await fetchPortal(env, await portalUrl(env, a.id));
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    const html = await r.text();
    expect(html).toContain("Ana Pérez");
    expect(html).toContain("COT-0001");
    expect(html).not.toContain("COT-0002");
    expect(html).not.toContain("Borrador secreto");
  });

  it("renders the quote document with Bre-B key, validity, total and a QR", async () => {
    const env = await makeEnv();
    const c = await newClient(env, "María Gómez");
    await sentQuote(env, c.id);
    const url = await portalUrl(env, c.id);
    const r = await fetchPortal(env, `${url}/cotizacion/COT-0001`);
    expect(r.status).toBe(200);
    const html = await r.text();
    for (const text of ["Llave Bre-B 3058147293 · Davibank", "Válida hasta", "$ 890.000", "$ 445.000", "Una página con 6 secciones", "<svg"]) expect(html).toContain(text);
  });

  it("lets the client approve once with their name and then shows the project", async () => {
    const env = await makeEnv();
    const c = await newClient(env, "María Gómez");
    const q = await sentQuote(env, c.id);
    const token = tokenOf(await portalUrl(env, c.id));
    const r = await approve(env, token, q.id, { name: "  María Gómez ", comment: "¡Listo!" });
    expect(r.status).toBe(200);
    const row = await env.DB.prepare("SELECT approved_by, approved_name, client_comment, project_id FROM quotes WHERE id = ?").bind(q.id).first<Record<string, string>>();
    expect(row).toMatchObject({ approved_by: "client", approved_name: "María Gómez", client_comment: "¡Listo!" });
    expect(row!.project_id).toBeTruthy();
    expect((await approve(env, token, q.id, { name: "María Gómez" })).status).toBe(409);
    const html = await (await fetchPortal(env, `${P}/c/${token}`)).text();
    expect(html).toContain("Contenido");
    expect(html).toContain("25%");
  });

  it("requires a name to approve", async () => {
    const env = await makeEnv();
    const c = await newClient(env, "María Gómez");
    const q = await sentQuote(env, c.id);
    const r = await approve(env, tokenOf(await portalUrl(env, c.id)), q.id, { name: "" });
    expect(r.status).toBe(400);
  });

  it("does not let one client's link touch another client's quote", async () => {
    const env = await makeEnv();
    const a = await newClient(env, "Ana Pérez");
    const b = await newClient(env, "Bruno Ruiz");
    const qb = await sentQuote(env, b.id);
    const r = await approve(env, tokenOf(await portalUrl(env, a.id)), qb.id, { name: "Ana Pérez" });
    expect(r.status).toBe(404);
    const doc = await fetchPortal(env, `${await portalUrl(env, a.id)}/cotizacion/COT-0001`);
    expect(doc.status).toBe(404);
  });

  it("escapes text the client wrote", async () => {
    const env = await makeEnv();
    const c = await newClient(env, "María Gómez");
    const q = await sentQuote(env, c.id);
    const token = tokenOf(await portalUrl(env, c.id));
    await approve(env, token, q.id, { name: "María", comment: "<script>alert(1)</script>" });
    const html = await (await fetchPortal(env, `${P}/c/${token}`)).text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("answers an unknown link with a friendly 404 page", async () => {
    const env = await makeEnv();
    const r = await fetchPortal(env, `${P}/c/no-existe`);
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("Este enlace no es válido");
  });

  it("requires JSON for portal actions", async () => {
    const env = await makeEnv();
    const c = await newClient(env, "María Gómez");
    const q = await sentQuote(env, c.id);
    const token = tokenOf(await portalUrl(env, c.id));
    const r = await fetchPortal(env, `${P}/api/portal/${token}/quotes/${q.id}/approve`, { method: "POST", body: "name=x", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(r.status).toBe(415);
  });

  it("prints the issue date in Bogotá time, also when sent in the evening", async () => {
    const env = await makeEnv();
    const c = await newClient(env, "María Gómez");
    const q = await sentQuote(env, c.id);
    await env.DB.prepare("UPDATE quotes SET issued_at = '2026-11-26T01:30:00.000Z' WHERE id = ?").bind(q.id).run();
    const html = await (await fetchPortal(env, `${await portalUrl(env, c.id)}/cotizacion/COT-0001`)).text();
    expect(html).toContain("Emitida: 25 de noviembre de 2026");
  });

  it("shows payments, balance and the Bre-B key, but not internal payment notes", async () => {
    const env = await makeEnv();
    const c = await newClient(env, "María Gómez");
    const q = await sentQuote(env, c.id);
    const token = tokenOf(await portalUrl(env, c.id));
    await approve(env, token, q.id, { name: "María Gómez" });
    const projectId = (await env.DB.prepare("SELECT project_id FROM quotes WHERE id = ?").bind(q.id).first<{ project_id: string }>())!.project_id;
    const planId = (await env.DB.prepare("SELECT id FROM payment_plans WHERE project_id = ?").bind(projectId).first<{ id: string }>())!.id;
    await handleProjectPayments(
      jsonRequest("POST", `${B}/projects/${projectId}/payments`, { amount: 200000, paidOn: "2026-11-25", method: "breb", planId, note: "transferencia de la mamá" }),
      env,
      owner,
      ["projects", projectId, "payments"],
    );
    const html = await (await fetchPortal(env, `${P}/c/${token}`)).text();
    for (const text of ["Pagado", "$ 200.000", "Saldo", "$ 690.000", "Anticipo", "Llave Bre-B 3058147293 · Davibank", "Copiar llave"]) expect(html).toContain(text);
    expect(html).not.toContain("transferencia de la mamá");
  });

  it("shows the client's upcoming meetings with the Meet link and Bogotá time", async () => {
    const env = await makeEnv();
    const a = await newClient(env, "Ana Pérez");
    const b = await newClient(env, "Bruno Ruiz");
    await env.DB.prepare("INSERT INTO meetings (id, client_id, title, start_at, duration_min, meet_url, status, created_at, updated_at) VALUES ('m1', ?, 'Revisión de maqueta', '2099-12-10T19:30:00-05:00', 30, 'https://meet.google.com/abc-defg-hij', 'scheduled', '', '')").bind(a.id).run();
    const htmlA = await (await fetchPortal(env, await portalUrl(env, a.id))).text();
    expect(htmlA).toContain("Revisión de maqueta");
    expect(htmlA).toContain("7:30");
    expect(htmlA).toContain("https://meet.google.com/abc-defg-hij");
    expect(htmlA).not.toContain("Todavía no hay nada por aquí");
    const htmlB = await (await fetchPortal(env, await portalUrl(env, b.id))).text();
    expect(htmlB).not.toContain("Revisión de maqueta");
  });
});
