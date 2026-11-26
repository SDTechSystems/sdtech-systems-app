import { describe, expect, it } from "vitest";
import worker from "../worker/index";
import { handleClients } from "../worker/api/clients";
import { handleQuotes } from "../worker/api/quotes";
import { handleProjectPayments } from "../worker/api/payments";
import { handleProjects } from "../worker/api/projects";
import type { Session } from "../worker/auth/session";
import type { Client, Quote } from "../shared/types";
import { jsonRequest, makeEnv, OWNER } from "./helpers";
import { approvedProject } from "./fixtures";
import { renderDocHtml } from "../worker/portal/doc-html";
import type { DocModel } from "../shared/docs/model";

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

  describe("changes and adjustments", () => {
    async function setupProject(env: Awaited<ReturnType<typeof makeEnv>>) {
      const c = await newClient(env, "María Gómez");
      const q = await sentQuote(env, c.id);
      const token = tokenOf(await portalUrl(env, c.id));
      await approve(env, token, q.id, { name: "María Gómez" });
      const projectId = (await env.DB.prepare("SELECT project_id FROM quotes WHERE id = ?").bind(q.id).first<{ project_id: string }>())!.project_id;
      return { c, token, projectId };
    }
    const post = (env: Awaited<ReturnType<typeof makeEnv>>, path: string, body: unknown) =>
      fetchPortal(env, `${P}/api/portal/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    it("lets the client request an adjustment, shown escaped", async () => {
      const env = await makeEnv();
      const { token, projectId } = await setupProject(env);
      const r = await post(env, `${token}/projects/${projectId}/adjustments`, { text: "Cambiar el color del botón <b>" });
      expect(r.status).toBe(201);
      const html = await (await fetchPortal(env, `${P}/c/${token}`)).text();
      expect(html).toContain("Cambiar el color del botón &lt;b&gt;");
      expect(html).toContain("Recibido");
      expect((await post(env, `${token}/projects/${projectId}/adjustments`, { text: "ok" })).status).toBe(400);
    });

    it("lets the client approve a cost change once and updates the total", async () => {
      const env = await makeEnv();
      const { token, projectId } = await setupProject(env);
      const created = await handleProjects(jsonRequest("POST", `${B}/projects/${projectId}/changes`, { description: "Sección de blog", amount: 150000 }), env, owner, ["projects", projectId, "changes"]);
      const changeId = ((await created.json()) as { change: { id: string } }).change.id;
      let html = await (await fetchPortal(env, `${P}/c/${token}`)).text();
      expect(html).toContain("Cambios por aprobar");
      expect(html).toContain("+ $ 150.000");
      expect((await post(env, `${token}/changes/${changeId}/approve`, { name: "" })).status).toBe(400);
      expect((await post(env, `${token}/changes/${changeId}/approve`, { name: "María Gómez", comment: "De acuerdo" })).status).toBe(200);
      expect((await post(env, `${token}/changes/${changeId}/approve`, { name: "María Gómez" })).status).toBe(409);
      html = await (await fetchPortal(env, `${P}/c/${token}`)).text();
      expect(html).toContain("$ 1.040.000");
      expect(html).toContain("Cambios aprobados");
      const row = await env.DB.prepare("SELECT decided_by, approved_name, snapshot FROM change_requests WHERE id = ?").bind(changeId).first<Record<string, string>>();
      expect(row).toMatchObject({ decided_by: "client", approved_name: "María Gómez" });
      expect(JSON.parse(row!.snapshot)).toMatchObject({ description: "Sección de blog", amount: 150000, approvedName: "María Gómez", comment: "De acuerdo" });
    });

    it("does not let another client's link touch the project", async () => {
      const env = await makeEnv();
      const { projectId } = await setupProject(env);
      const other = await newClient(env, "Bruno Ruiz");
      const otherToken = tokenOf(await portalUrl(env, other.id));
      const created = await handleProjects(jsonRequest("POST", `${B}/projects/${projectId}/changes`, { description: "Blog", amount: 1000 }), env, owner, ["projects", projectId, "changes"]);
      const changeId = ((await created.json()) as { change: { id: string } }).change.id;
      expect((await post(env, `${otherToken}/projects/${projectId}/adjustments`, { text: "Hola mundo" })).status).toBe(404);
      expect((await post(env, `${otherToken}/changes/${changeId}/approve`, { name: "Bruno Ruiz" })).status).toBe(404);
    });
  });

  it("lists the client's active services", async () => {
    const env = await makeEnv();
    const c = await newClient(env, "María Gómez");
    await env.DB.prepare("INSERT INTO subscriptions (id, client_id, kind, name, amount, currency, cycle, next_due, status, created_at, updated_at) VALUES ('s1', ?, 'hosting', 'Hosting', 25000, 'COP', 'mensual', '2026-12-12', 'active', '', '')").bind(c.id).run();
    await env.DB.prepare("INSERT INTO subscriptions (id, client_id, kind, name, amount, currency, cycle, next_due, status, created_at, updated_at) VALUES ('s2', ?, 'dominio', 'Dominio viejo', 90000, 'COP', 'anual', '2026-12-12', 'cancelled', '', '')").bind(c.id).run();
    const html = await (await fetchPortal(env, await portalUrl(env, c.id))).text();
    expect(html).toContain("Tus servicios");
    expect(html).toContain("Hosting · $ 25.000/mes · próximo cobro el 12 de diciembre de 2026");
    expect(html).not.toContain("Dominio viejo");
  });

  it("links every client-facing logo to the portfolio", async () => {
    const env = await makeEnv();
    const c = await newClient(env, "María Gómez");
    await sentQuote(env, c.id);
    const url = await portalUrl(env, c.id);
    const portalHtml = await (await fetchPortal(env, url)).text();
    expect(portalHtml).toMatch(/<a [^>]*href="https:\/\/sdtechsystems\.dev\/es\/"[^>]*><img src="\/brand\/logo-white\.svg"/);
    const doc = await (await fetchPortal(env, `${url}/cotizacion/COT-0001`)).text();
    expect(doc).toMatch(/<a [^>]*href="https:\/\/sdtechsystems\.dev\/es\/"[^>]*><img src="\/brand\/logo-color\.svg"/);
    const verify = await (await fetchPortal(env, `${P}/verificar/ABCDEFGHJK`)).text();
    expect(verify).toContain('href="https://sdtechsystems.dev/es/"');
  });

  it("escapes '</script>' in a client name inside the embedded doc model", async () => {
    const env = await makeEnv();
    const name = "Ana</script><img src=x onerror=alert(1)>";
    const c = await newClient(env, name);
    await sentQuote(env, c.id);
    const html = await (await fetchPortal(env, `${await portalUrl(env, c.id)}/cotizacion/COT-0001`)).text();
    expect(html).not.toContain("</script><img");
    const json = html.match(/<script type="application\/json" id="doc-model">([\s\S]*?)<\/script>/)?.[1];
    expect(json).toBeTruthy();
    const model = JSON.parse(json!) as DocModel;
    expect(model.party.name).toBe(name);
    expect(model.number).toBe("COT-0001");
  });

  it("portal quote and FAC pages still render at their old URLs with the new layout", async () => {
    const env = await makeEnv();
    const { client, projectId } = await approvedProject(env);
    const issued = await handleProjects(jsonRequest("POST", `${B}/projects/${projectId}/invoices`, {}), env, owner, ["projects", projectId, "invoices"]);
    expect(issued.status).toBe(201);
    const url = await portalUrl(env, client.id);
    const quote = await fetchPortal(env, `${url}/cotizacion/COT-0001`);
    expect(quote.status).toBe(200);
    const quoteHtml = await quote.text();
    for (const t of ["COTIZACIÓN", "COT-0001", 'id="doc-model"', "Guardar PDF", "No responsable de IVA"]) expect(quoteHtml).toContain(t);
    const receipt = await fetchPortal(env, `${url}/factura/FAC-0001`);
    expect(receipt.status).toBe(200);
    const html = await receipt.text();
    for (const t of ["RECIBO DE PAGO", "FAC-0001", 'id="doc-model"', "Guardar PDF", "No responsable de IVA", "Código de verificación"]) expect(html).toContain(t);
    expect(html).not.toContain("FACTURA");
  });
});

describe("unified document page", () => {
  const model: DocModel = {
    kind: "collection",
    title: "CUENTA DE COBRO",
    number: "CC-0003",
    issuedOn: "2026-11-26",
    currency: "COP",
    voided: true,
    company: { name: "SD Tech Systems", nit: "901.234.567-8", phone: "+57 305 814 7293", email: "contacto@sdtechsystems.dev", website: "sdtechsystems.dev", taxNote: "No responsable de IVA" },
    party: { name: "Jennifer", lines: ["Jen Essence", "Medellín"] },
    from: "SD Tech Systems · NIT 901.234.567-8",
    intro: { text: "Por los servicios prestados, el valor a pagar es:", amount: 450000, words: "cuatrocientos cincuenta mil pesos" },
    lines: [{ title: "Kit de marca estándar", detail: "2 propuestas, logo y versiones", quantity: 1, unitPrice: 450000, total: 450000 }],
    totals: [{ label: "Total", amount: 450000, tone: "grand" }],
    facts: [{ label: "Fecha acordada de pago", value: "5 de diciembre de 2026" }],
    payment: { title: "Medios de pago", items: [{ name: "Bre-B", detail: "3058147293 · Davibank" }, { name: "Nequi", detail: "" }] },
    links: [{ label: "Pagar en línea", url: "https://bold.co/pay/x" }],
    note: "Nota <b>importante</b>",
    conditions: ["Condición uno"],
    thanks: "Gracias por confiar en SD Tech Systems.",
    footer: { qrUrl: "https://clientes.sdtechsystems.dev/c/abc", qrCaption: "Escanea para ver tu página.", verifyCode: null, verifyUrl: null },
  };
  const render = (pdf: boolean) => renderDocHtml(model, { backUrl: "https://clientes.sdtechsystems.dev/c/abc", pdf }).text();

  it("keeps the fixed block order", async () => {
    const html = await render(false);
    const body = html.slice(html.indexOf("<article"));
    const order = ["logo-color.svg", "NIT 901.234.567-8", "CUENTA DE COBRO", "CC-0003", "Para", "Jennifer", "De", "Fecha acordada de pago", "el valor a pagar es", "cuatrocientos cincuenta mil pesos", "Kit de marca estándar", "Total", "Medios de pago", "Pagar en línea", "Nota &lt;b&gt;importante&lt;/b&gt;", "Condición uno", "Gracias por confiar", "<svg", "No responsable de IVA"];
    let at = -1;
    for (const t of order) {
      const i = body.indexOf(t, at + 1);
      expect(i, t).toBeGreaterThan(at);
      at = i;
    }
    expect(body).toContain("ANULADA");
    expect(html).toContain('href="https://bold.co/pay/x"');
  });

  it("labels every table cell so rows can stack on a phone", async () => {
    const html = await render(false);
    for (const l of ["Cant.", "Valor unitario", "Total"]) expect(html).toContain(`data-label="${l}"`);
    expect(html).toMatch(/@media \(max-width:640px\)\{[^}]*\.doc-table thead\{display:none\}/);
  });

  it("offers Guardar PDF by default and an inert Descargar PDF button when the PDF is ready", async () => {
    const print = await render(false);
    expect(print).toContain("Guardar PDF");
    expect(print).toContain("window.print()");
    expect(print).not.toContain("download-pdf");
    const pdf = await render(true);
    expect(pdf).toContain('id="download-pdf"');
    expect(pdf).toContain("Descargar PDF");
    expect(pdf).not.toContain("window.print()");
  });
});
