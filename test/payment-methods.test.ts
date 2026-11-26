import { expect, it } from "vitest";
import { firstActiveMethod } from "../src/lib/payment-methods";
import type { PaymentMethodOption } from "../shared/types";

it("proposes the first active payment method from Ajustes", () => {
  const m = (id: string, active: boolean) => ({ id, name: id, detail: "", showOnDocs: true, active }) as PaymentMethodOption;
  expect(firstActiveMethod([m("breb", false), m("nequi", true), m("efectivo", true)])).toBe("nequi");
  expect(firstActiveMethod([])).toBe("");
});
