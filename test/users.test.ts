import { describe, expect, it } from "vitest";
import { handleUsers } from "../worker/api/users";
import type { Session } from "../worker/auth/session";
import { jsonRequest, makeEnv, OWNER } from "./helpers";

const owner: Session = { email: OWNER, role: "owner" };
const socio: Session = { email: "socio@example.com", role: "collaborator" };
const U = "https://panel.sdtechsystems.dev/api/admin/users";

describe("users API", () => {
  it("lets the owner add a collaborator once", async () => {
    const env = await makeEnv();
    const r1 = await handleUsers(jsonRequest("POST", U, { email: "Socio@Example.com", name: "Socio" }), env, owner, ["users"]);
    expect(r1.status).toBe(201);
    const r2 = await handleUsers(jsonRequest("POST", U, { email: "socio@example.com" }), env, owner, ["users"]);
    expect(r2.status).toBe(409);
    const list = (await (await handleUsers(jsonRequest("GET", U), env, owner, ["users"])).json()) as { users: { email: string; role: string }[] };
    expect(list.users).toContainEqual(expect.objectContaining({ email: "socio@example.com", role: "collaborator" }));
  });

  it("forbids collaborators from listing users", async () => {
    const r = await handleUsers(jsonRequest("GET", U), await makeEnv(), socio, ["users"]);
    expect(r.status).toBe(403);
  });

  it("refuses to remove the owner", async () => {
    const env = await makeEnv();
    await env.DB.prepare("INSERT INTO users (email, role, created_at) VALUES (?, 'owner', ?)").bind(OWNER, new Date().toISOString()).run();
    const r = await handleUsers(jsonRequest("DELETE", `${U}/${OWNER}`), env, owner, ["users", OWNER]);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "cannot_remove_owner" });
  });

  it("requires a JSON content type on mutations", async () => {
    const r = await handleUsers(jsonRequest("POST", U, "email=x@y.com", "text/plain"), await makeEnv(), owner, ["users"]);
    expect(r.status).toBe(415);
  });

  it("logs adding and removing a collaborator", async () => {
    const env = await makeEnv();
    await handleUsers(jsonRequest("POST", U, { email: "socio@example.com" }), env, owner, ["users"]);
    const del = await handleUsers(jsonRequest("DELETE", `${U}/socio@example.com`), env, owner, ["users", "socio@example.com"]);
    expect(del.status).toBe(200);
    const { results } = await env.DB.prepare("SELECT action, actor FROM activity_log WHERE entity_type = 'user' ORDER BY at, rowid").all<{ action: string; actor: string }>();
    expect(results).toEqual([
      { action: "create", actor: OWNER },
      { action: "delete", actor: OWNER },
    ]);
  });
});
