import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet, apiSend } from "../src/lib/api";

afterEach(() => vi.unstubAllGlobals());

describe("panel API client", () => {
  it("sends JSON mutations with the JSON content type", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ client: { id: "1" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await apiSend<{ client: { id: string } }>("POST", "/api/admin/clients", { name: "Ana" });
    expect(out.client.id).toBe("1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/clients");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ name: "Ana" }));
  });

  it("throws ApiError with the server's error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "name_required" }), { status: 400 })));
    const err = await apiSend("POST", "/api/admin/clients", { name: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: "name_required" });
  });

  it("reloads the page when the Access session expired", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 })));
    await apiGet("/api/admin/me").catch(() => undefined);
    expect(reload).toHaveBeenCalled();
  });
});
