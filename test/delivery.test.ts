import { describe, expect, it } from "vitest";
import worker from "../worker/index";
import { handleProjects } from "../worker/api/projects";
import { handleClients } from "../worker/api/clients";
import type { Project } from "../shared/types";
import { jsonRequest, makeEnv } from "./helpers";
import { approvedProject, B, owner, socio, type TestEnv } from "./fixtures";

const DRIVE = "https://drive.google.com/drive/folders/abc123";
const patch = (env: TestEnv, id: string, body: object, s = owner) => handleProjects(jsonRequest("PATCH", `${B}/projects/${id}`, body), env, s, ["projects", id]);
const release = (env: TestEnv, id: string, value: boolean, s = owner) => handleProjects(jsonRequest("POST", `${B}/projects/${id}/delivery`, { release: value }), env, s, ["projects", id, "delivery"]);
async function portalHtml(env: TestEnv, clientId: string) {
  const url = ((await (await handleClients(jsonRequest("POST", `${B}/clients/${clientId}/portal-link`, {}), env, owner, ["clients", clientId, "portal-link"])).json()) as { url: string }).url;
  return (await worker.fetch(new Request(url), env, {} as ExecutionContext)).text();
}

describe("delivery link", () => {
  it("accepts only https links", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    expect(await (await patch(env, projectId, { deliveryUrl: "ftp://x" })).json()).toEqual({ error: "invalid_url" });
  });

  it("keeps the link out of the portal until it is released", async () => {
    const env = await makeEnv();
    const { projectId, client } = await approvedProject(env);
    const r = await patch(env, projectId, { deliveryUrl: DRIVE });
    expect(((await r.json()) as { project: Project }).project).toMatchObject({ deliveryUrl: DRIVE, deliveryReleased: false });
    expect(await portalHtml(env, client.id)).not.toContain("drive.google.com");
    expect((await release(env, projectId, true)).status).toBe(200);
    const html = await portalHtml(env, client.id);
    expect(html).toContain("Descargar entrega");
    expect(html).toContain(DRIVE);
    await release(env, projectId, false);
    expect(await portalHtml(env, client.id)).not.toContain("drive.google.com");
  });

  it("needs a link before releasing", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    expect(await (await release(env, projectId, true)).json()).toEqual({ error: "delivery_url_required" });
  });

  it("is owner-only and hidden from collaborators", async () => {
    const env = await makeEnv();
    const { projectId } = await approvedProject(env);
    await patch(env, projectId, { deliveryUrl: DRIVE });
    expect((await release(env, projectId, true, socio)).status).toBe(403);
    expect((await patch(env, projectId, { deliveryUrl: DRIVE }, socio)).status).toBe(403);
    const seen = ((await (await handleProjects(jsonRequest("GET", `${B}/projects/${projectId}`), env, socio, ["projects", projectId])).json()) as { project: Project }).project;
    expect(seen.deliveryUrl).toBeNull();
  });
});
