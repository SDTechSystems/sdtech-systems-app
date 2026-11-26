import { expect, it } from "vitest";
import { catalogLine } from "../src/lib/catalog-pick";
import type { CatalogItem } from "../shared/types";

it("catalogLine leaves the price empty and suggests the catalog price", () => {
  const l = catalogLine({ id: "x", name: "Landing page", description: "Una página", price: 650000, currency: "COP" } as CatalogItem);
  expect(l).toMatchObject({ title: "Landing page", detail: "Una página", quantity: "1", price: "", suggested: "650.000", catalogItemId: "x" });
  expect(catalogLine({ id: "y", name: "Asesoría", description: "", price: 0, currency: "COP" } as CatalogItem).suggested).toBe("");
});
