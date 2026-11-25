import { describe, expect, it } from "vitest";
import { handleClients } from "../worker/api/clients";
import type { Session } from "../worker/auth/session";
import type { Client } from "../shared/types";
import { jsonRequest, makeEnv, OWNER } from "./helpers";

const s: Session = { email: OWNER, role: "collaborator" };
const U = "https://panel.sdtechsystems.dev/api/admin/clients";

async function create(env: Awaited<ReturnType<typeof makeEnv>>, body: unknown) {
  return handleClients(jsonRequest("POST", U, body), env, s, ["clients"]);
}
async function list(env: Awaited<ReturnType<typeof makeEnv>>, query = "") {
  const r = await handleClients(jsonRequest("GET", `${U}${query}`), env, s, ["clients"]);
  return ((await r.json()) as { clients: Client[] }).clients;
}

describe("clients API", () => {
  it("trims the name and normalizes the phone", async () => {
    const env = await makeEnv();
    const r = await create(env, { name: "  María Gómez ", phone: "305 814 7293" });
    expect(r.status).toBe(201);
    const { client } = (await r.json()) as { client: Client };
    expect(client.name).toBe("María Gómez");
    expect(client.phone).toBe("573058147293");
    expect(client.archived).toBe(false);
  });

  it("finds clients ignoring accents and case", async () => {
    const env = await makeEnv();
    await create(env, { name: "María Gómez" });
    expect((await list(env, "?q=maria")).map((c) => c.name)).toEqual(["María Gómez"]);
    expect((await list(env, "?q=GOMEZ")).map((c) => c.name)).toEqual(["María Gómez"]);
    expect(await list(env, "?q=pedro")).toEqual([]);
  });

  it("requires a name", async () => {
    const r = await create(await makeEnv(), { name: "" });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "name_required" });
  });

  it("rejects a phone without digits", async () => {
    const r = await create(await makeEnv(), { name: "Ana", phone: "abc" });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "invalid_phone" });
  });

  it("rejects an email without @", async () => {
    const r = await create(await makeEnv(), { name: "Ana", email: "ana.example.com" });
    expect(await r.json()).toEqual({ error: "invalid_email" });
  });

  it("archives and lists archived clients separately", async () => {
    const env = await makeEnv();
    const { client } = (await (await create(env, { name: "María Gómez" })).json()) as { client: Client };
    const r = await handleClients(jsonRequest("PATCH", `${U}/${client.id}`, { archived: true }), env, s, ["clients", client.id]);
    expect(r.status).toBe(200);
    expect(await list(env)).toEqual([]);
    expect((await list(env, "?archived=1")).map((c) => c.id)).toEqual([client.id]);

    const detail = (await (await handleClients(jsonRequest("GET", `${U}/${client.id}`), env, s, ["clients", client.id])).json()) as {
      activity: { action: string; actor: string }[];
    };
    expect(detail.activity.map((a) => a.action).sort()).toEqual(["create", "update"]);
    expect(detail.activity.every((a) => a.actor === OWNER)).toBe(true);
  });

  it("requires JSON on mutations", async () => {
    const r = await handleClients(jsonRequest("POST", U, "name=Ana", "text/plain"), await makeEnv(), s, ["clients"]);
    expect(r.status).toBe(415);
  });

  it("answers 404 for an unknown client", async () => {
    const r = await handleClients(jsonRequest("GET", `${U}/nope`), await makeEnv(), s, ["clients", "nope"]);
    expect(r.status).toBe(404);
  });
});
