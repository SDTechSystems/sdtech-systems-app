import { describe, expect, it } from "vitest";
import worker from "../worker/index";
import { makeEnv } from "./helpers";

const ctx = {} as ExecutionContext;
const get = async (url: string) => worker.fetch(new Request(url), await makeEnv(), ctx);

describe("router", () => {
  it("never serves the admin API on the clients host", async () => {
    expect((await get("https://clientes.sdtechsystems.dev/api/admin/me")).status).toBe(404);
  });

  it("sends the bare clients host to the portfolio and 404s unknown links", async () => {
    expect((await get("https://clientes.sdtechsystems.dev/c/abc")).status).toBe(404);
    const r = await get("https://clientes.sdtechsystems.dev/");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://sdtechsystems.dev/es/");
  });

  it("serves brand images on the clients host, since the panel host sits behind Access", async () => {
    expect(await (await get("https://clientes.sdtechsystems.dev/brand/logo-white.svg")).text()).toBe("asset");
    const page = await (await get("https://clientes.sdtechsystems.dev/c/abc")).text();
    expect(page).not.toContain("panel.sdtechsystems.dev");
    expect(page).toContain('href="https://sdtechsystems.dev/es/"');
  });

  it("requires Access on the panel API", async () => {
    expect((await get("https://panel.sdtechsystems.dev/api/admin/me")).status).toBe(401);
  });

  it("serves the SPA assets for panel pages", async () => {
    expect(await (await get("https://panel.sdtechsystems.dev/clientes")).text()).toBe("asset");
  });

  it("does not expose data on other hosts without a token", async () => {
    expect((await get("https://x.workers.dev/api/admin/clients")).status).toBe(401);
  });
});
