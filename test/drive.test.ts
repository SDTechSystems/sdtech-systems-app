import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/index";
import { handleClients } from "../worker/api/clients";
import { handleCollections } from "../worker/api/collections";
import { handleDrive } from "../worker/api/drive";
import { handleInvoices } from "../worker/api/invoices";
import { handleProjectPayments } from "../worker/api/payments";
import { handleProjects } from "../worker/api/projects";
import { handleQuotes } from "../worker/api/quotes";
import { ensureProjectFolder } from "../worker/google/drive";
import { resetTokenCache } from "../worker/google/oauth";
import { handlePortalApi } from "../worker/portal/api";
import type { Collection, Invoice, PaymentSummary, Project } from "../shared/types";
import { jsonRequest, makeEnv } from "./helpers";
import { approvedProject, B, newClient, owner, sentQuote, socio, type TestEnv } from "./fixtures";
import { googleEnv, mockGoogle, type Call } from "./google-mock";
import { connectGoogle } from "./google-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  resetTokenCache();
});

const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/** ExecutionContext de prueba: junta lo que el handler deja en waitUntil para esperarlo. */
function ctxStub() {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => undefined } as unknown as ExecutionContext;
  return { ctx, settle: () => Promise.all(pending) };
}

async function setup(handlers?: Parameters<typeof mockGoogle>[0]) {
  const env = await makeEnv(googleEnv);
  const g = mockGoogle(handlers);
  await connectGoogle(env);
  return { env, g };
}

const drive = (env: TestEnv, method: string, sub: string, body?: unknown, s = owner) => handleDrive(jsonRequest(method, `${B}/drive/${sub}`, body), env, s, ["drive", sub]);
const errorOf = async (r: Response) => ((await r.json()) as { error: string }).error;
const folderCreates = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.url.startsWith("https://www.googleapis.com/drive/v3/files?"));
const folderOf = async (env: TestEnv, table: "clients" | "projects", id: string) =>
  (await env.DB.prepare(`SELECT drive_folder_id AS f FROM ${table} WHERE id = ?`).bind(id).first<{ f: string | null }>())!.f;
const driveSettings = async (env: TestEnv) =>
  JSON.parse((await env.DB.prepare("SELECT value FROM settings WHERE key = 'drive'").first<{ value: string }>())!.value) as { rootId: string; clientsId: string };

/** Cuenta de cobro por la promesa del anticipo. */
async function issueAnticipo(env: TestEnv, pid: string, ctx?: ExecutionContext) {
  const plans = ((await (await handleProjectPayments(jsonRequest("GET", `${B}/projects/${pid}/payments`), env, owner, ["projects", pid, "payments"])).json()) as PaymentSummary).plans;
  const lines = [{ source: "plan", planId: plans[0].id, title: "Anticipo", detail: "", quantity: 1, unitPrice: 1 }];
  return handleProjects(jsonRequest("POST", `${B}/projects/${pid}/collections`, { lines }), env, owner, ["projects", pid, "collections"], ctx);
}

/** Registra el pago del anticipo y emite el recibo. */
async function issueReceipt(env: TestEnv, pid: string, ctx?: ExecutionContext) {
  await handleProjectPayments(jsonRequest("POST", `${B}/projects/${pid}/payments`, { amount: 385000, paidOn: "2026-11-25", method: "breb" }), env, owner, ["projects", pid, "payments"]);
  return handleProjects(jsonRequest("POST", `${B}/projects/${pid}/invoices`, {}), env, owner, ["projects", pid, "invoices"], ctx);
}

async function manualProject(env: TestEnv, clientName: string, title: string, ctx?: ExecutionContext) {
  const client = await newClient(env, clientName);
  const r = await handleProjects(jsonRequest("POST", `${B}/projects`, { clientId: client.id, service: "marca", title }), env, owner, ["projects"], ctx);
  expect(r.status).toBe(201);
  return { client, projectId: ((await r.json()) as { project: Project }).project.id };
}

describe("Drive folders", () => {
  it("creates SD Tech Systems/Clientes/<cliente>/<proyecto> once and reuses the ids", async () => {
    const { env, g } = await setup();
    const { ctx, settle } = ctxStub();
    const { client, projectId } = await manualProject(env, "  Jen Essence ", "Kit de marca / logo", ctx);
    await settle();

    const { rootId, clientsId } = await driveSettings(env);
    const clientFolder = (await folderOf(env, "clients", client.id))!;
    const projectFolder = (await folderOf(env, "projects", projectId))!;
    expect(g.drive.files.get(rootId)).toMatchObject({ name: "SD Tech Systems", parents: [], mimeType: "application/vnd.google-apps.folder" });
    expect(g.drive.files.get(clientsId)).toMatchObject({ name: "Clientes", parents: [rootId] });
    expect(g.drive.files.get(clientFolder)).toMatchObject({ name: "Jen Essence", parents: [clientsId] });
    expect(g.drive.files.get(projectFolder)).toMatchObject({ name: "Kit de marca / logo", parents: [clientFolder] });
    expect(folderCreates(g.calls)).toHaveLength(4);

    expect(await ensureProjectFolder(env, projectId)).toBe(projectFolder);
    expect(folderCreates(g.calls)).toHaveLength(4);

    // Aprobar en el panel y en el portal crea la carpeta del proyecto dentro de la del cliente, sin repetir las de arriba.
    const q1 = await sentQuote(env, client.id);
    const a = ctxStub();
    const r1 = await handleQuotes(jsonRequest("POST", `${B}/quotes/${q1.id}/approve`, {}), env, owner, ["quotes", q1.id, "approve"], a.ctx);
    await a.settle();
    const p1 = ((await r1.json()) as { projectId: string }).projectId;
    expect(g.drive.files.get((await folderOf(env, "projects", p1))!)).toMatchObject({ name: "Landing page", parents: [clientFolder] });

    const q2 = await sentQuote(env, client.id);
    const link = (await (await handleClients(jsonRequest("POST", `${B}/clients/${client.id}/portal-link`, {}), env, owner, ["clients", client.id, "portal-link"])).json()) as { url: string };
    const token = link.url.split("/c/")[1];
    const b = ctxStub();
    const r2 = await handlePortalApi(jsonRequest("POST", `https://clientes.sdtechsystems.dev/api/portal/${token}/quotes/${q2.id}/approve`, { name: "Jennifer" }), env, [token, "quotes", q2.id, "approve"], b.ctx);
    expect(r2.status).toBe(200);
    await b.settle();
    const p2 = (await env.DB.prepare("SELECT project_id FROM quotes WHERE id = ?").bind(q2.id).first<{ project_id: string }>())!.project_id;
    expect(g.drive.files.get((await folderOf(env, "projects", p2))!)).toMatchObject({ parents: [clientFolder] });
    expect(folderCreates(g.calls)).toHaveLength(6);
  });

  it("recreates a folder that was trashed", async () => {
    const { env, g } = await setup();
    const { ctx, settle } = ctxStub();
    const { client, projectId } = await manualProject(env, "Jen Essence", "Kit de marca", ctx);
    await settle();
    const clientFolder = (await folderOf(env, "clients", client.id))!;
    const old = (await folderOf(env, "projects", projectId))!;
    g.drive.files.get(old)!.trashed = true;

    const fresh = await ensureProjectFolder(env, projectId);
    expect(fresh).not.toBe(old);
    expect(g.drive.files.get(fresh)).toMatchObject({ name: "Kit de marca", parents: [clientFolder] });
    expect(await folderOf(env, "projects", projectId)).toBe(fresh);

    // Borrada del todo (404) la del cliente: se rehacen cliente y proyecto, la raíz sigue.
    g.drive.files.delete(clientFolder);
    g.drive.files.delete(fresh);
    const again = await ensureProjectFolder(env, projectId);
    const newClientFolder = (await folderOf(env, "clients", client.id))!;
    expect(newClientFolder).not.toBe(clientFolder);
    expect(g.drive.files.get(newClientFolder)).toMatchObject({ name: "Jen Essence", parents: [(await driveSettings(env)).clientsId] });
    expect(g.drive.files.get(again)!.parents).toEqual([newClientFolder]);
  });

  it("two uploads at once on a fresh project end up in the same folder", async () => {
    const { env, g } = await setup();
    const { client, projectId } = await manualProject(env, "Jen Essence", "Kit de marca");
    const [a, b] = await Promise.all([ensureProjectFolder(env, projectId), ensureProjectFolder(env, projectId)]);
    expect(a).toBe(b);
    expect(await folderOf(env, "projects", projectId)).toBe(a);
    const clientFolder = (await folderOf(env, "clients", client.id))!;
    const { rootId, clientsId } = await driveSettings(env);
    expect(g.drive.files.get(a)).toMatchObject({ parents: [clientFolder], trashed: false });
    expect(g.drive.files.get(clientFolder)).toMatchObject({ parents: [clientsId], trashed: false });
    expect(g.drive.files.get(clientsId)).toMatchObject({ parents: [rootId], trashed: false });
    // Lo que creó la que perdió quedó en la papelera: una sola carpeta viva por nivel.
    const live = [...g.drive.files.values()].filter((f) => !f.trashed && f.mimeType === "application/vnd.google-apps.folder");
    expect(live.map((f) => f.id).sort()).toEqual([rootId, clientsId, clientFolder, a].sort());
  });

  it("does not touch Drive without a context, or without the Drive scope", async () => {
    const { env, g } = await setup();
    await manualProject(env, "Jen Essence", "Kit de marca");
    expect(folderCreates(g.calls)).toHaveLength(0);

    const { env: calendarOnly, g: g2 } = await setup((_m, url) =>
      url.startsWith("https://oauth2.googleapis.com/token") ? [200, { access_token: "at-1", expires_in: 3599, refresh_token: "rt", scope: "https://www.googleapis.com/auth/calendar.events" }] : undefined,
    );
    const { ctx, settle } = ctxStub();
    const waits = vi.spyOn(ctx, "waitUntil");
    await manualProject(calendarOnly, "Jen Essence", "Kit de marca", ctx);
    await settle();
    expect(waits).not.toHaveBeenCalled();
    expect(g2.calls.some((c) => c.url.includes("/drive/v3/"))).toBe(false);
  });

  it("renames the folders and voided documents in Drive, best effort", async () => {
    const { env, g } = await setup();
    const { ctx, settle } = ctxStub();
    const { client, projectId } = await manualProject(env, "Jen Essence", "Kit de marca", ctx);
    await settle();
    const c = ctxStub();
    expect((await handleClients(jsonRequest("PATCH", `${B}/clients/${client.id}`, { name: "Jennifer Ríos" }), env, owner, ["clients", client.id], c.ctx)).status).toBe(200);
    expect((await handleProjects(jsonRequest("PATCH", `${B}/projects/${projectId}`, { title: "Kit de marca final" }), env, owner, ["projects", projectId], c.ctx)).status).toBe(200);
    await c.settle();
    expect(g.drive.files.get((await folderOf(env, "clients", client.id))!)!.name).toBe("Jennifer Ríos");
    expect(g.drive.files.get((await folderOf(env, "projects", projectId))!)!.name).toBe("Kit de marca final");

    const { projectId: pid } = await approvedProject(env);
    const plans = ((await (await handleProjectPayments(jsonRequest("GET", `${B}/projects/${pid}/payments`), env, owner, ["projects", pid, "payments"])).json()) as PaymentSummary).plans;
    const issued = await handleProjects(
      jsonRequest("POST", `${B}/projects/${pid}/collections`, { lines: [{ source: "plan", planId: plans[0].id, title: "Anticipo", detail: "", quantity: 1, unitPrice: 1 }] }),
      env,
      owner,
      ["projects", pid, "collections"],
    );
    const col = ((await issued.json()) as { collection: Collection }).collection;
    const fileId = g.drive.add(`${col.number}.pdf`, "somewhere");
    await env.DB.prepare("UPDATE collections SET drive_file_id = ? WHERE id = ?").bind(fileId, col.id).run();
    const v = ctxStub();
    expect((await handleCollections(jsonRequest("POST", `${B}/collections/${col.id}/void`, {}), env, owner, ["collections", col.id, "void"], v.ctx)).status).toBe(200);
    await v.settle();
    expect(g.drive.files.get(fileId)!.name).toBe(`${col.number} (anulada).pdf`);

    await handleProjectPayments(jsonRequest("POST", `${B}/projects/${pid}/payments`, { amount: 385000, paidOn: "2026-11-25", method: "breb" }), env, owner, ["projects", pid, "payments"]);
    const rec = ((await (await handleProjects(jsonRequest("POST", `${B}/projects/${pid}/invoices`, {}), env, owner, ["projects", pid, "invoices"])).json()) as { invoice: Invoice }).invoice;
    const recFile = g.drive.add(`${rec.number}.pdf`, "somewhere");
    await env.DB.prepare("UPDATE invoices SET drive_file_id = ? WHERE id = ?").bind(recFile, rec.id).run();
    const w = ctxStub();
    expect((await handleInvoices(jsonRequest("POST", `${B}/invoices/${rec.id}/void`, {}), env, owner, ["invoices", rec.id, "void"], w.ctx)).status).toBe(200);
    await w.settle();
    expect(g.drive.files.get(recFile)!.name).toBe(`${rec.number} (anulado).pdf`);

    // Si Drive falla, la petición igual sale bien.
    const { env: e2 } = await setup((m, url) => (m === "PATCH" && url.includes("/drive/v3/files/") ? [500, {}] : undefined));
    const { ctx: ctx2, settle: settle2 } = ctxStub();
    const { client: c2 } = await manualProject(e2, "Ana", "Web", ctx2);
    await settle2();
    const f = ctxStub();
    expect((await handleClients(jsonRequest("PATCH", `${B}/clients/${c2.id}`, { name: "Ana María" }), e2, owner, ["clients", c2.id], f.ctx)).status).toBe(200);
    await f.settle();
  });
});

describe("Drive uploads", () => {
  async function withProject() {
    const s = await setup();
    const { ctx, settle } = ctxStub();
    const p = await manualProject(s.env, "Jen Essence", "Kit de marca", ctx);
    await settle();
    return { ...s, ...p, folder: (await folderOf(s.env, "projects", p.projectId))!, clientFolder: (await folderOf(s.env, "clients", p.client.id))! };
  }

  it("opens a resumable upload in the project folder and returns the Location URL", async () => {
    const { env, g, projectId, folder } = await withProject();
    const r = await drive(env, "POST", "uploads", { target: { type: "delivery", projectId }, name: "kit-marca-final.zip", mimeType: "application/zip", size: 248_000_000 });
    expect(r.status).toBe(200);
    const { uploadUrl } = (await r.json()) as { uploadUrl: string };
    expect(uploadUrl).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?uploadType=resumable&upload_id=up\d+$/);
    const call = g.calls.find((c) => c.url.startsWith(UPLOAD))!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${UPLOAD}?uploadType=resumable&fields=id`);
    expect(call.body).toEqual({ name: "kit-marca-final.zip", parents: [folder] });
    expect(call.headers).toMatchObject({ "x-upload-content-type": "application/zip", "x-upload-content-length": "248000000", origin: "https://panel.sdtechsystems.dev" });
    expect(call.headers.authorization).toBe("Bearer at-123");

    // Un archivo sin tipo (el navegador da "") sube como binario.
    await drive(env, "POST", "uploads", { target: { type: "delivery", projectId }, name: "fuentes.rar", mimeType: "", size: 10 });
    expect(g.calls.filter((c) => c.url.startsWith(UPLOAD))[1].headers["x-upload-content-type"]).toBe("application/octet-stream");
  });

  it("creates the project folder on the first upload when it does not exist yet", async () => {
    const { env, g } = await setup();
    const { projectId } = await manualProject(env, "Jen Essence", "Kit de marca");
    expect(await folderOf(env, "projects", projectId)).toBeNull();
    const r = await drive(env, "POST", "uploads", { target: { type: "delivery", projectId }, name: "a.zip", mimeType: "application/zip", size: 5 });
    expect(r.status).toBe(200);
    const folder = (await folderOf(env, "projects", projectId))!;
    expect(g.calls.find((c) => c.url.startsWith(UPLOAD))!.body).toMatchObject({ parents: [folder] });
  });

  it("rejects bad targets and files", async () => {
    const { env, projectId } = await withProject();
    const ok = { name: "a.zip", mimeType: "application/zip", size: 5 };
    expect(await errorOf(await drive(env, "POST", "uploads", { ...ok, target: { type: "delivery", projectId: "nope" } }))).toBe("invalid_target");
    expect(await errorOf(await drive(env, "POST", "uploads", { ...ok, target: { type: "other", id: projectId } }))).toBe("invalid_target");
    expect(await errorOf(await drive(env, "POST", "uploads", { ...ok, mimeType: "application/pdf", target: { type: "collection", id: "nope" } }))).toBe("invalid_target");
    expect(await errorOf(await drive(env, "POST", "uploads", { ...ok, target: { type: "delivery", projectId }, size: 0 }))).toBe("invalid_file");
    expect(await errorOf(await drive(env, "POST", "uploads", { ...ok, target: { type: "delivery", projectId }, name: "  " }))).toBe("invalid_file");
    expect(await errorOf(await drive(env, "POST", "uploads", { ...ok, target: { type: "delivery", projectId }, size: 1.5 }))).toBe("invalid_file");
  });

  it("one delivery file → file link shared with anyone; two → folder link shared with anyone", async () => {
    const { env, g, projectId, folder, clientFolder } = await withProject();
    const f1 = g.drive.add("kit-marca-final.zip", folder);
    const r1 = await drive(env, "POST", "complete", { target: { type: "delivery", projectId }, fileId: f1, name: "kit-marca-final.zip", size: 248_000_000 });
    expect(r1.status).toBe(200);
    expect(((await r1.json()) as { project: Project }).project.deliveryUrl).toBe(`https://drive.google.com/file/d/${f1}/view`);
    expect(g.drive.permissions).toEqual([{ fileId: f1, body: { role: "reader", type: "anyone" } }]);

    const f2 = g.drive.add("video-promo.mp4", folder);
    const r2 = await drive(env, "POST", "complete", { target: { type: "delivery", projectId }, fileId: f2, name: "video-promo.mp4", size: 1_200_000_000 });
    const project = ((await r2.json()) as { project: Project }).project;
    expect(project.deliveryUrl).toBe(`https://drive.google.com/drive/folders/${folder}`);
    expect(project.deliveryReleased).toBe(false);
    expect(g.drive.permissions.map((p) => p.fileId)).toEqual([f1, f2, folder]);

    // Solo «cualquiera con el link»: nunca a un correo, nunca la raíz, «Clientes» ni la carpeta del cliente.
    const { rootId, clientsId } = await driveSettings(env);
    const permCalls = g.calls.filter((c) => c.url.includes("/permissions"));
    for (const c of permCalls) {
      expect(c.body).toEqual({ role: "reader", type: "anyone" });
      expect(c.url).not.toContain("sendNotificationEmail");
      for (const id of [rootId, clientsId, clientFolder]) expect(c.url).not.toContain(`/files/${id}/`);
    }
    // Un archivo que no está en la carpeta del proyecto no se comparte.
    expect(await errorOf(await drive(env, "POST", "complete", { target: { type: "delivery", projectId }, fileId: clientFolder, name: "x", size: 1 }))).toBe("invalid_file");
    expect(g.calls.filter((c) => c.url.includes("/permissions"))).toHaveLength(permCalls.length);

    const files = ((await (await handleProjects(jsonRequest("GET", `${B}/projects/${projectId}/files`), env, owner, ["projects", projectId, "files"])).json()) as {
      files: { driveFileId: string; name: string; size: number; url: string }[];
    }).files;
    expect(files.map((f) => [f.driveFileId, f.name, f.size, f.url])).toEqual([
      [f1, "kit-marca-final.zip", 248_000_000, `https://drive.google.com/file/d/${f1}/view`],
      [f2, "video-promo.mp4", 1_200_000_000, `https://drive.google.com/file/d/${f2}/view`],
    ]);
    const logged = await env.DB.prepare("SELECT COUNT(*) AS n FROM activity_log WHERE entity_id = ? AND action = 'drive_upload'").bind(projectId).first<{ n: number }>();
    expect(logged!.n).toBe(2);
    // Repetir el mismo complete no duplica el archivo.
    await drive(env, "POST", "complete", { target: { type: "delivery", projectId }, fileId: f2, name: "video-promo.mp4", size: 1_200_000_000 });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM project_files WHERE project_id = ?").bind(projectId).first<{ n: number }>())!.n).toBe(2);
  });

  it("replaces a document PDF in place when it already has a Drive file", async () => {
    const { env, g } = await setup();
    const client = await newClient(env, "Jen Essence");
    const quote = await sentQuote(env, client.id);
    const pdf = { name: `${quote.number}.pdf`, mimeType: "application/pdf", size: 120_000 };

    // Cotización sin proyecto: va a la carpeta del cliente.
    expect((await drive(env, "POST", "uploads", { target: { type: "quote", id: quote.id }, ...pdf })).status).toBe(200);
    const clientFolder = (await folderOf(env, "clients", client.id))!;
    expect(g.calls.filter((c) => c.url.startsWith(UPLOAD))[0].body).toEqual({ name: pdf.name, parents: [clientFolder] });

    // Un archivo fuera de la carpeta esperada (o inexistente) no se guarda en el documento.
    const elsewhere = g.drive.add(pdf.name, "otra-carpeta");
    expect(await errorOf(await drive(env, "POST", "complete", { target: { type: "quote", id: quote.id }, fileId: elsewhere, ...pdf }))).toBe("invalid_file");
    expect(await errorOf(await drive(env, "POST", "complete", { target: { type: "quote", id: quote.id }, fileId: "noexiste", ...pdf }))).toBe("invalid_file");
    expect(await errorOf(await drive(env, "POST", "complete", { target: { type: "collection", id: "nope" }, fileId: elsewhere, ...pdf }))).toBe("invalid_target");
    expect((await env.DB.prepare("SELECT drive_file_id AS f FROM quotes WHERE id = ?").bind(quote.id).first<{ f: string | null }>())!.f).toBeNull();

    const fileId = g.drive.add(pdf.name, clientFolder);
    expect(await (await drive(env, "POST", "complete", { target: { type: "quote", id: quote.id }, fileId, ...pdf })).json()).toEqual({ ok: true });
    expect((await env.DB.prepare("SELECT drive_file_id AS f FROM quotes WHERE id = ?").bind(quote.id).first<{ f: string }>())!.f).toBe(fileId);

    expect((await drive(env, "POST", "uploads", { target: { type: "quote", id: quote.id }, ...pdf })).status).toBe(200);
    const replace = g.calls.filter((c) => c.url.startsWith(UPLOAD))[1];
    expect(replace.method).toBe("PATCH");
    expect(replace.url).toBe(`${UPLOAD}/${fileId}?uploadType=resumable`);
    expect(replace.headers).toMatchObject({ "x-upload-content-type": "application/pdf", "x-upload-content-length": "120000" });
    expect(g.drive.permissions).toEqual([]);

    // Si borraron el archivo en Drive, se sube uno nuevo.
    g.drive.files.delete(fileId);
    expect((await drive(env, "POST", "uploads", { target: { type: "quote", id: quote.id }, ...pdf })).status).toBe(200);
    const uploads = g.calls.filter((c) => c.url.startsWith(UPLOAD));
    expect(uploads.at(-1)).toMatchObject({ method: "POST", body: { name: pdf.name, parents: [clientFolder] } });

    // Los documentos solo son PDF.
    expect(await errorOf(await drive(env, "POST", "uploads", { target: { type: "quote", id: quote.id }, ...pdf, mimeType: "application/zip" }))).toBe("invalid_file");
  });

  it("uploads a fresh PDF in the project folder when the stored one is in the client folder (quote approved after saving)", async () => {
    const { env, g } = await setup();
    const client = await newClient(env, "Jen Essence");
    const quote = await sentQuote(env, client.id);
    const pdf = { name: `${quote.number}.pdf`, mimeType: "application/pdf", size: 120_000 };
    expect((await drive(env, "POST", "uploads", { target: { type: "quote", id: quote.id }, ...pdf })).status).toBe(200);
    const clientFolder = (await folderOf(env, "clients", client.id))!;
    const old = g.drive.add(pdf.name, clientFolder);
    expect((await drive(env, "POST", "complete", { target: { type: "quote", id: quote.id }, fileId: old, ...pdf })).status).toBe(200);

    const approve = await handleQuotes(jsonRequest("POST", `${B}/quotes/${quote.id}/approve`, {}), env, owner, ["quotes", quote.id, "approve"]);
    const { projectId } = (await approve.json()) as { projectId: string };
    expect((await drive(env, "POST", "uploads", { target: { type: "quote", id: quote.id }, ...pdf })).status).toBe(200);
    const folder = (await folderOf(env, "projects", projectId))!;
    const open = g.calls.filter((c) => c.url.startsWith(UPLOAD)).at(-1)!;
    expect(open).toMatchObject({ method: "POST", url: `${UPLOAD}?uploadType=resumable&fields=id`, body: { name: pdf.name, parents: [folder] } });

    const fresh = g.drive.add(pdf.name, folder);
    expect(await (await drive(env, "POST", "complete", { target: { type: "quote", id: quote.id }, fileId: fresh, ...pdf })).json()).toEqual({ ok: true });
    expect((await env.DB.prepare("SELECT drive_file_id AS f FROM quotes WHERE id = ?").bind(quote.id).first<{ f: string }>())!.f).toBe(fresh);
  });

  it("uploads a fresh PDF in the recreated project folder when the old folder (and its file) went to the trash", async () => {
    const { env, g } = await setup();
    const { projectId } = await approvedProject(env);
    const c = ((await (await issueAnticipo(env, projectId)).json()) as { collection: Collection }).collection;
    const pdf = { name: `${c.number}.pdf`, mimeType: "application/pdf", size: 90_000 };
    expect((await drive(env, "POST", "uploads", { target: { type: "collection", id: c.id }, ...pdf })).status).toBe(200);
    const oldFolder = (await folderOf(env, "projects", projectId))!;
    const old = g.drive.add(pdf.name, oldFolder);
    expect((await drive(env, "POST", "complete", { target: { type: "collection", id: c.id }, fileId: old, ...pdf })).status).toBe(200);

    // Drive marca como en la papelera la carpeta y lo que tiene dentro.
    g.drive.files.get(oldFolder)!.trashed = true;
    g.drive.files.get(old)!.trashed = true;
    expect((await drive(env, "POST", "uploads", { target: { type: "collection", id: c.id }, ...pdf })).status).toBe(200);
    const folder = (await folderOf(env, "projects", projectId))!;
    expect(folder).not.toBe(oldFolder);
    expect(g.calls.filter((x) => x.url.startsWith(UPLOAD)).at(-1)).toMatchObject({ method: "POST", body: { name: pdf.name, parents: [folder] } });
    expect(g.calls.some((x) => x.method === "PATCH" && x.url.startsWith(`${UPLOAD}/${old}`))).toBe(false);
  });

  it("returns 409 drive_not_connected without the Drive scope, and issuing a collection or a receipt still works", async () => {
    const { env, g } = await setup((_m, url) =>
      url.startsWith("https://oauth2.googleapis.com/token") ? [200, { access_token: "at-1", expires_in: 3599, refresh_token: "rt", scope: "https://www.googleapis.com/auth/calendar.events" }] : undefined,
    );
    const { ctx, settle } = ctxStub();
    const { projectId } = await approvedProject(env);
    const target = { type: "delivery", projectId };
    expect(await errorOf(await drive(env, "POST", "uploads", { target, name: "a.zip", mimeType: "application/zip", size: 5 }))).toBe("drive_not_connected");
    expect(await errorOf(await drive(env, "POST", "complete", { target, fileId: "abc", name: "a.zip", size: 5 }))).toBe("drive_not_connected");
    const files = await handleProjects(jsonRequest("GET", `${B}/projects/${projectId}/files`), env, owner, ["projects", projectId, "files"]);
    expect(files.status).toBe(409);
    const relay = await handleDrive(new Request(`${B}/drive/relay?url=${encodeURIComponent(`${UPLOAD}?uploadType=resumable&upload_id=x`)}`, { method: "PUT", body: "x" }), env, owner, ["drive", "relay"]);
    expect(await errorOf(relay)).toBe("drive_not_connected");

    const issued = await issueAnticipo(env, projectId, ctx);
    expect(issued.status).toBe(201);
    expect((await issueReceipt(env, projectId, ctx)).status).toBe(201);
    await settle();
    expect(g.calls.some((c) => c.url.includes("/drive/v3/"))).toBe(false);

    // Sin conexión alguna, igual.
    const bare = await makeEnv(googleEnv);
    expect(await errorOf(await drive(bare, "POST", "uploads", { target, name: "a.zip", mimeType: "application/zip", size: 5 }))).toBe("drive_not_connected");
    const { projectId: bareProject } = await approvedProject(bare);
    const b = ctxStub();
    expect((await issueAnticipo(bare, bareProject, b.ctx)).status).toBe(201);
    expect((await issueReceipt(bare, bareProject, b.ctx)).status).toBe(201);
    await b.settle();
  });

  it("collaborator gets 403 on Drive routes", async () => {
    const { env, projectId } = await withProject();
    expect((await drive(env, "POST", "uploads", { target: { type: "delivery", projectId }, name: "a.zip", mimeType: "application/zip", size: 5 }, socio)).status).toBe(403);
    expect((await drive(env, "POST", "complete", { target: { type: "delivery", projectId }, fileId: "abc", name: "a.zip", size: 5 }, socio)).status).toBe(403);
    expect((await handleDrive(new Request(`${B}/drive/relay?url=x`, { method: "PUT", body: "x" }), env, socio, ["drive", "relay"])).status).toBe(403);
    expect((await handleProjects(jsonRequest("GET", `${B}/projects/${projectId}/files`), env, socio, ["projects", projectId, "files"])).status).toBe(403);
  });

  it("is routed under /api/admin/drive", async () => {
    const env = { ...(await makeEnv(googleEnv)), ACCESS_AUD: "", DEV_AUTH_EMAIL: "socio@example.com" };
    await env.DB.prepare("INSERT INTO users (email, role, created_at) VALUES ('socio@example.com', 'collaborator', '2026-11-26')").run();
    const r = await worker.fetch(jsonRequest("POST", `${B}/drive/uploads`, {}), env, {} as ExecutionContext);
    expect(r.status).toBe(403);
  });
});

describe("Drive upload relay", () => {
  const SESSION = `${UPLOAD}?uploadType=resumable&upload_id=up1`;
  const relay = (env: TestEnv, url: string, init: RequestInit = {}) =>
    handleDrive(new Request(`${B}/drive/relay?url=${encodeURIComponent(url)}`, { method: "PUT", ...init }), env, owner, ["drive", "relay"]);

  it("only relays to Google's Drive upload endpoint", async () => {
    const { env, g } = await setup();
    const before = g.calls.length;
    for (const bad of [
      "https://evil.example.com/upload/drive/v3/files?upload_id=1",
      "http://www.googleapis.com/upload/drive/v3/files?upload_id=1",
      "https://www.googleapis.com.evil.com/upload/drive/v3/files",
      "https://www.googleapis.com:8443/upload/drive/v3/files",
      "https://user:pw@www.googleapis.com/upload/drive/v3/files",
      "https://www.googleapis.com/drive/v3/files/abc",
      "https://www.googleapis.com/upload/drive/v2/files",
      "not a url",
    ]) {
      const r = await relay(env, bad, { body: "x", headers: { "content-length": "1" } });
      expect(r.status, bad).toBe(400);
      expect(await errorOf(r)).toBe("invalid_upload_url");
    }
    expect(g.calls.length).toBe(before);
    expect(await errorOf(await relay(env, SESSION, { body: "x" }))).toBe("length_required");
    expect((await relay(env, SESSION, { body: "x", headers: { "content-length": String(8 * 1024 * 1024 + 1) } })).status).toBe(413);
  });

  it("streams a chunk to the session URL and passes 308 and the final file back", async () => {
    let final = false;
    const { env, g } = await setup((m, url) => {
      if (m !== "PUT") return undefined;
      return final ? Response.json({ id: "file9", name: "a.zip" }, { status: 200 }) : new Response(null, { status: 308, headers: { range: "bytes=0-4" } });
    });
    const r = await relay(env, SESSION, { body: "hello", headers: { "content-length": "5", "content-range": "bytes 0-4/10", "content-type": "application/octet-stream" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 308, range: "bytes=0-4", body: null });
    const put = g.calls.find((c) => c.method === "PUT")!;
    expect(put.url).toBe(SESSION);
    expect(put.headers).toMatchObject({ "content-range": "bytes 0-4/10", "content-length": "5" });
    expect(put.headers.authorization).toBeUndefined();
    expect(put.rawBody).toBeInstanceOf(ReadableStream);

    final = true;
    const done = await relay(env, SESSION, { body: "world", headers: { "content-length": "5", "content-range": "bytes 5-9/10" } });
    expect(await done.json()).toEqual({ status: 200, range: null, body: { id: "file9", name: "a.zip" } });
  });

  it("passes Google's errors through in the envelope", async () => {
    const { env } = await setup((m) => (m === "PUT" ? [404, { error: { code: 404, message: "gone" } }] : undefined));
    const r = await relay(env, SESSION, { body: "hello", headers: { "content-length": "5", "content-range": "bytes 0-4/10" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 404, range: null, body: { error: { code: 404, message: "gone" } } });
  });
});
