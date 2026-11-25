import { describe, expect, it } from "vitest";
import { handleQuotes } from "../worker/api/quotes";
import { handleClients } from "../worker/api/clients";
import { approveQuote } from "../worker/quotes/approve";
import type { Session } from "../worker/auth/session";
import type { Client, Quote } from "../shared/types";
import { addDays, todayBogota } from "../shared/dates";
import { jsonRequest, makeEnv, OWNER } from "./helpers";

type Env = Awaited<ReturnType<typeof makeEnv>>;
const owner: Session = { email: OWNER, role: "owner" };
const socio: Session = { email: "socio@example.com", role: "collaborator" };
const B = "https://panel.sdtechsystems.dev/api/admin";

async function newClient(env: Env, name = "María Gómez") {
  const r = await handleClients(jsonRequest("POST", `${B}/clients`, { name, phone: "3058147293" }), env, owner, ["clients"]);
  return ((await r.json()) as { client: Client }).client;
}
const items = [
  { title: "Landing page", detail: "Una página con 6 secciones", quantity: 1, unitPrice: 650000, catalogItemId: "seed-landing" },
  { title: "Página adicional", detail: "", quantity: 2, unitPrice: 120000 },
];
async function call(env: Env, method: string, path: string[], body?: unknown, s: Session = owner) {
  return handleQuotes(jsonRequest(method, `${B}/${path.join("/")}`, body), env, s, path);
}
async function create(env: Env, clientId: string, extra: object = {}) {
  const r = await call(env, "POST", ["quotes"], { clientId, service: "web", items, ...extra });
  return { status: r.status, body: (await r.json()) as { quote: Quote; error?: string } };
}
async function countProjects(env: Env) {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM projects").first<{ n: number }>())!.n;
}

describe("quotes API", () => {
  it("creates numbered drafts with totals and advance", async () => {
    const env = await makeEnv();
    const c = await newClient(env);
    const { status, body } = await create(env, c.id);
    expect(status).toBe(201);
    expect(body.quote).toMatchObject({ number: "COT-0001", status: "draft", total: 890000, advancePercent: 50, advanceAmount: 445000, clientName: "María Gómez" });
    expect(body.quote.conditions.split("\n")).toHaveLength(6);
    expect((await create(env, c.id)).body.quote.number).toBe("COT-0002");
  });

  it("validates items and client", async () => {
    const env = await makeEnv();
    const c = await newClient(env);
    expect((await create(env, c.id, { items: [] })).body).toEqual({ error: "items_required" });
    expect((await create(env, c.id, { items: [{ title: "X", quantity: 0, unitPrice: 1 }] })).body).toEqual({ error: "invalid_items" });
    expect((await create(env, "nope")).body).toEqual({ error: "invalid_client" });
  });

  it("is owner-only", async () => {
    const env = await makeEnv();
    expect((await call(env, "GET", ["quotes"], undefined, socio)).status).toBe(403);
  });

  it("only edits drafts and sets the validity when sending", async () => {
    const env = await makeEnv();
    const c = await newClient(env);
    const q = (await create(env, c.id)).body.quote;
    const sent = (await (await call(env, "POST", ["quotes", q.id, "send"], {})).json()) as { quote: Quote };
    expect(sent.quote.status).toBe("sent");
    expect(sent.quote.validUntil).toBe(addDays(todayBogota(), 30));
    const r = await call(env, "PATCH", ["quotes", q.id], { notes: "x" });
    expect(r.status).toBe(409);
  });

  it("approves once into a project with the web phases", async () => {
    const env = await makeEnv();
    const c = await newClient(env);
    const q = (await create(env, c.id)).body.quote;
    await call(env, "POST", ["quotes", q.id, "send"], {});
    const r = await call(env, "POST", ["quotes", q.id, "approve"], { note: "Aceptó por WhatsApp" });
    expect(r.status).toBe(200);
    const { quote, projectId } = (await r.json()) as { quote: Quote; projectId: string };
    expect(quote).toMatchObject({ status: "approved", approvedBy: "owner", projectId });
    const { results } = await env.DB.prepare("SELECT name, status FROM phases WHERE project_id = ? ORDER BY position").bind(projectId).all<{ name: string; status: string }>();
    expect(results).toHaveLength(8);
    expect(results.slice(0, 3).map((p) => p.status)).toEqual(["done", "done", "in_progress"]);
    const project = await env.DB.prepare("SELECT total, currency, advance_percent FROM projects WHERE id = ?").bind(projectId).first();
    expect(project).toMatchObject({ total: 890000, currency: "COP", advance_percent: 50 });

    expect((await call(env, "POST", ["quotes", q.id, "approve"], {})).status).toBe(409);
    expect(await countProjects(env)).toBe(1);
  });

  it("refuses to approve after the last valid day", async () => {
    const env = await makeEnv();
    const c = await newClient(env);
    const q = (await create(env, c.id)).body.quote;
    const sent = ((await (await call(env, "POST", ["quotes", q.id, "send"], {})).json()) as { quote: Quote }).quote;
    const onLastDay = await approveQuote(env.DB, q.id, { by: "client", actor: "cliente (portal)", name: "Ana", today: addDays(sent.validUntil!, 1) });
    expect(onLastDay).toBeInstanceOf(Response);
    expect((onLastDay as Response).status).toBe(409);
    expect(await countProjects(env)).toBe(0);
  });

  it("shows a sent quote as expired after its last day, and renews it with current catalog prices", async () => {
    const env = await makeEnv();
    const c = await newClient(env);
    const q = (await create(env, c.id)).body.quote;
    await call(env, "POST", ["quotes", q.id, "send"], {});
    await env.DB.prepare("UPDATE quotes SET valid_until = '2020-01-01' WHERE id = ?").bind(q.id).run();
    await env.DB.prepare("UPDATE catalog_items SET price = 700000 WHERE id = 'seed-landing'").run();
    const got = ((await (await call(env, "GET", ["quotes", q.id])).json()) as { quote: Quote }).quote;
    expect(got.status).toBe("expired");
    const r = await call(env, "POST", ["quotes", q.id, "renew"], {});
    expect(r.status).toBe(201);
    const renewed = ((await r.json()) as { quote: Quote }).quote;
    expect(renewed).toMatchObject({ status: "draft", number: "COT-0002", total: 700000 + 240000 });
  });
});
