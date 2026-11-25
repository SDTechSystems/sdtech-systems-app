import { afterEach, describe, expect, it, vi } from "vitest";
import { handleMeetings } from "../worker/api/meetings";
import { handleClients } from "../worker/api/clients";
import { resetTokenCache } from "../worker/google/oauth";
import type { Client, Meeting } from "../shared/types";
import { jsonRequest, makeEnv } from "./helpers";
import { B, owner, socio, type TestEnv } from "./fixtures";
import { googleEnv, mockGoogle } from "./google-mock";
import { connectGoogle } from "./google-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  resetTokenCache();
});

async function client(env: TestEnv, email: string | null = "maria@example.com") {
  const r = await handleClients(jsonRequest("POST", `${B}/clients`, { name: "María Gómez", phone: "3058147293", email }), env, owner, ["clients"]);
  return ((await r.json()) as { client: Client }).client;
}
const create = (env: TestEnv, body: object, s = owner) => handleMeetings(jsonRequest("POST", `${B}/meetings`, body), env, s, ["meetings"]);

describe("meetings", () => {
  it("creates a Meet event in Bogotá time with the three reminders", async () => {
    const env = await makeEnv(googleEnv);
    const g = mockGoogle();
    await connectGoogle(env);
    const c = await client(env);
    const r = await create(env, { clientId: c.id, title: "Revisión de maqueta", start: "2026-12-10T19:30", durationMin: 45 });
    expect(r.status).toBe(201);
    const { meeting, googleError } = (await r.json()) as { meeting: Meeting; googleError: string | null };
    expect(googleError).toBeNull();
    expect(meeting).toMatchObject({ startAt: "2026-12-10T19:30:00-05:00", durationMin: 45, meetUrl: "https://meet.google.com/abc-defg-hij", googleEventId: "evt1" });
    const call = g.calls.find((c) => c.url.includes("/events") && c.method === "POST")!;
    expect(call.url).toContain("conferenceDataVersion=1");
    expect(call.url).toContain("sendUpdates=none");
    const body = call.body as { start: { dateTime: string; timeZone: string }; end: { dateTime: string }; reminders: { overrides: { minutes: number }[] }; attendees?: unknown };
    expect(body.start).toEqual({ dateTime: "2026-12-10T19:30:00-05:00", timeZone: "America/Bogota" });
    expect(body.end.dateTime).toBe("2026-12-10T20:15:00-05:00");
    expect(body.reminders.overrides.map((o) => o.minutes)).toEqual([1440, 60, 15]);
    expect(body.attendees).toBeUndefined();
  });

  it("invites the client by email when asked", async () => {
    const env = await makeEnv(googleEnv);
    const g = mockGoogle();
    await connectGoogle(env);
    const c = await client(env);
    await create(env, { clientId: c.id, title: "Kickoff", start: "2026-12-10T10:00", inviteClient: true });
    const call = g.calls.find((x) => x.url.includes("/events") && x.method === "POST")!;
    expect(call.url).toContain("sendUpdates=all");
    expect((call.body as { attendees: { email: string }[] }).attendees).toEqual([{ email: "maria@example.com" }]);
  });

  it("refuses to invite a client without email", async () => {
    const env = await makeEnv(googleEnv);
    const c = await client(env, null);
    const r = await create(env, { clientId: c.id, title: "Kickoff", start: "2026-12-10T10:00", inviteClient: true });
    expect(await r.json()).toEqual({ error: "client_without_email" });
  });

  it("still saves the meeting when Google is not connected or fails", async () => {
    const env = await makeEnv(googleEnv);
    const c = await client(env);
    const a = await create(env, { clientId: c.id, title: "Llamada", start: "2026-12-10T10:00" });
    expect(a.status).toBe(201);
    expect(await a.json()).toMatchObject({ meeting: { meetUrl: null }, googleError: "not_connected" });
    mockGoogle((m, url) => (m === "POST" && url.includes("/events") ? [500, { error: "boom" }] : undefined));
    await connectGoogle(env);
    const b = await create(env, { clientId: c.id, title: "Llamada 2", start: "2026-12-11T10:00" });
    expect(b.status).toBe(201);
    expect(await b.json()).toMatchObject({ googleError: "google_error" });
  });

  it("cancels the meeting and deletes its event", async () => {
    const env = await makeEnv(googleEnv);
    const g = mockGoogle();
    await connectGoogle(env);
    const c = await client(env);
    const { meeting } = (await (await create(env, { clientId: c.id, title: "Llamada", start: "2026-12-10T10:00" })).json()) as { meeting: Meeting };
    const r = await handleMeetings(jsonRequest("DELETE", `${B}/meetings/${meeting.id}`), env, owner, ["meetings", meeting.id]);
    expect(((await r.json()) as { meeting: Meeting }).meeting.status).toBe("cancelled");
    expect(g.calls.some((x) => x.method === "DELETE" && x.url.includes("/events/evt1"))).toBe(true);
  });

  it("lets a collaborator schedule meetings", async () => {
    const env = await makeEnv(googleEnv);
    const c = await client(env);
    expect((await create(env, { clientId: c.id, title: "Llamada", start: "2026-12-10T10:00" }, socio)).status).toBe(201);
  });

  it("validates the start", async () => {
    const env = await makeEnv(googleEnv);
    const c = await client(env);
    expect(await (await create(env, { clientId: c.id, title: "Llamada", start: "10/12/2026 7pm" })).json()).toEqual({ error: "invalid_start" });
  });
});
