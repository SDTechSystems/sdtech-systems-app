import { describe, expect, it } from "vitest";
import { handleProjects, handlePhases } from "../worker/api/projects";
import { handleClients } from "../worker/api/clients";
import type { Session } from "../worker/auth/session";
import type { Client, Project } from "../shared/types";
import { jsonRequest, makeEnv, OWNER } from "./helpers";

type Env = Awaited<ReturnType<typeof makeEnv>>;
const owner: Session = { email: OWNER, role: "owner" };
const socio: Session = { email: "socio@example.com", role: "collaborator" };
const B = "https://panel.sdtechsystems.dev/api/admin";

async function newClient(env: Env) {
  const r = await handleClients(jsonRequest("POST", `${B}/clients`, { name: "Café Aroma" }), env, owner, ["clients"]);
  return ((await r.json()) as { client: Client }).client;
}
const proj = (env: Env, method: string, path: string[], body?: unknown, s: Session = owner) => handleProjects(jsonRequest(method, `${B}/${path.join("/")}`, body), env, s, path);
const phase = (env: Env, method: string, path: string[], body?: unknown, s: Session = owner) => handlePhases(jsonRequest(method, `${B}/${path.join("/")}`, body), env, s, path);
async function brandProject(env: Env) {
  const c = await newClient(env);
  const r = await proj(env, "POST", ["projects"], { clientId: c.id, service: "marca", title: "Logo Café Aroma", total: 450000 });
  expect(r.status).toBe(201);
  return ((await r.json()) as { project: Project }).project;
}
const get = async (env: Env, id: string, s: Session = owner) => ((await (await proj(env, "GET", ["projects", id], undefined, s)).json()) as { project: Project }).project;

describe("projects API", () => {
  it("creates a manual brand project with its six phases", async () => {
    const env = await makeEnv();
    const p = await brandProject(env);
    expect(p.phases.map((f) => f.name)).toEqual(["Brief", "Borrador (propuestas)", "Elección", "Ediciones y retoques", "Versión final", "Entrega"]);
    expect(p.phases.map((f) => f.status)).toEqual(["in_progress", "pending", "pending", "pending", "pending", "pending"]);
    expect(p.progress).toBe(0);
    expect(p.total).toBe(450000);
  });

  it("adds numbered rounds under edits without changing progress", async () => {
    const env = await makeEnv();
    const p = await brandProject(env);
    const edits = p.phases.find((f) => f.name === "Ediciones y retoques")!;
    await proj(env, "POST", ["projects", p.id, "phases"], { parentId: edits.id });
    await proj(env, "POST", ["projects", p.id, "phases"], { parentId: edits.id });
    const after = await get(env, p.id);
    expect(after.phases.filter((f) => f.parentId === edits.id).map((f) => f.name)).toEqual(["Ronda 1", "Ronda 2"]);
    expect(after.progress).toBe(0);
  });

  it("moves on to the next phase when the current one is done", async () => {
    const env = await makeEnv();
    const p = await brandProject(env);
    const r = await phase(env, "PATCH", ["phases", p.phases[0].id], { status: "done" });
    expect(r.status).toBe(200);
    const after = await get(env, p.id);
    expect(after.phases[0]).toMatchObject({ status: "done" });
    expect(after.phases[0].doneAt).not.toBeNull();
    expect(after.phases[1].status).toBe("in_progress");
    expect(after.progress).toBe(17);
  });

  it("hides money from collaborators but lets them move phases", async () => {
    const env = await makeEnv();
    const p = await brandProject(env);
    const seen = await get(env, p.id, socio);
    expect(seen).toMatchObject({ total: null, currency: null, advancePercent: null });
    expect((await phase(env, "PATCH", ["phases", p.phases[0].id], { status: "done" }, socio)).status).toBe(200);
    expect((await proj(env, "PATCH", ["projects", p.id], { total: 1 }, socio)).status).toBe(403);
  });

  it("validates dates", async () => {
    const env = await makeEnv();
    const p = await brandProject(env);
    const r = await proj(env, "PATCH", ["projects", p.id], { dueDate: "25/12/2026" });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "invalid_date" });
  });

  it("lists active work and leaves delivered projects out by default", async () => {
    const env = await makeEnv();
    const p = await brandProject(env);
    await proj(env, "PATCH", ["projects", p.id], { status: "delivered" });
    const list = ((await (await proj(env, "GET", ["projects"])).json()) as { projects: Project[] }).projects;
    expect(list).toEqual([]);
    const r = await handleProjects(jsonRequest("GET", `${B}/projects?status=all`), env, owner, ["projects"]);
    const all = ((await r.json()) as { projects: Project[] }).projects;
    expect(all).toHaveLength(1);
  });

  it("only lets the owner delete rounds, not template phases", async () => {
    const env = await makeEnv();
    const p = await brandProject(env);
    expect((await phase(env, "DELETE", ["phases", p.phases[0].id])).status).toBe(400);
  });
});
