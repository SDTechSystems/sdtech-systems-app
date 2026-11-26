import type { CatalogItem } from "../../shared/types";
import { priceText } from "./money-input";

/** Línea nueva desde un ítem del catálogo: el valor lo escribe la persona; el del catálogo solo se sugiere. */
export function catalogLine(item: CatalogItem) {
  return {
    title: item.name,
    detail: item.description,
    quantity: "1" as const,
    price: "" as const,
    suggested: item.price === 0 ? "" : priceText(item.price, item.currency),
    catalogItemId: item.id,
  };
}
