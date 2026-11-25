import { describe, expect, it } from "vitest";
import { handleCatalog } from "../worker/api/catalog";
import type { Session } from "../worker/auth/session";
import type { CatalogItem } from "../shared/types";
import { jsonRequest, makeEnv, OWNER } from "./helpers";

const owner: Session = { email: OWNER, role: "owner" };
const socio: Session = { email: "socio@example.com", role: "collaborator" };
const U = "https://panel.sdtechsystems.dev/api/admin/catalog";

async function items(env: Awaited<ReturnType<typeof makeEnv>>, query = "") {
  const r = await handleCatalog(jsonRequest("GET", `${U}${query}`), env, owner, ["catalog"]);
  return ((await r.json()) as { items: CatalogItem[] }).items;
}

describe("catalog API", () => {
  it("lists the 14 seeded items for the owner", async () => {
    const list = await items(await makeEnv());
    expect(list).toHaveLength(14);
    expect(list.find((i) => i.name === "Tienda en línea")).toMatchObject({ price: 2200000, priceFrom: true, currency: "COP", active: true });
  });

  it("is hidden from collaborators", async () => {
    const r = await handleCatalog(jsonRequest("GET", U), await makeEnv(), socio, ["catalog"]);
    expect(r.status).toBe(403);
  });

  it("creates an item", async () => {
    const env = await makeEnv();
    const r = await handleCatalog(
      jsonRequest("POST", U, { service: "web", name: "Landing express", price: 400000, currency: "COP", billing: "unico" }),
      env,
      owner,
      ["catalog"],
    );
    expect(r.status).toBe(201);
    expect(await items(env)).toHaveLength(15);
  });

  it.each([-1, 10.5])("rejects price %s", async (price) => {
    const r = await handleCatalog(jsonRequest("POST", U, { service: "web", name: "X", price }), await makeEnv(), owner, ["catalog"]);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "invalid_price" });
  });

  it("rejects an unknown service", async () => {
    const r = await handleCatalog(jsonRequest("POST", U, { service: "video", name: "X", price: 1 }), await makeEnv(), owner, ["catalog"]);
    expect(await r.json()).toEqual({ error: "invalid_service" });
  });

  it("deactivates instead of deleting", async () => {
    const env = await makeEnv();
    const landing = (await items(env)).find((i) => i.name === "Landing page")!;
    await handleCatalog(jsonRequest("PATCH", `${U}/${landing.id}`, { active: false }), env, owner, ["catalog", landing.id]);
    expect((await items(env)).some((i) => i.id === landing.id)).toBe(false);
    expect((await items(env, "?all=1")).find((i) => i.id === landing.id)?.active).toBe(false);
  });

  it("logs the old and new price", async () => {
    const env = await makeEnv();
    const landing = (await items(env)).find((i) => i.name === "Landing page")!;
    const r = await handleCatalog(jsonRequest("PATCH", `${U}/${landing.id}`, { price: 700000 }), env, owner, ["catalog", landing.id]);
    expect(((await r.json()) as { item: CatalogItem }).item.price).toBe(700000);
    const row = await env.DB.prepare("SELECT detail FROM activity_log WHERE entity_type = 'catalog_item' AND entity_id = ?").bind(landing.id).first<{ detail: string }>();
    expect(JSON.parse(row!.detail)).toMatchObject({ price: { from: 650000, to: 700000 } });
  });
});
