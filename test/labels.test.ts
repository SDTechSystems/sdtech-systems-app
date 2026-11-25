import { expect, it } from "vitest";
import { quoteWhatsAppText } from "../src/lib/labels";
import type { Quote } from "../shared/types";

it("writes the WhatsApp message for a quote", () => {
  const q = { number: "COT-0007", total: 650000, currency: "COP", validUntil: "2026-12-25" } as Quote;
  expect(quoteWhatsAppText(q, "María Gómez", "https://clientes.sdtechsystems.dev/c/abc")).toBe(
    "Hola María, te comparto la cotización COT-0007 por $ 650.000. Puedes verla y aprobarla aquí: https://clientes.sdtechsystems.dev/c/abc. Es válida hasta el 25 de diciembre de 2026.",
  );
});
