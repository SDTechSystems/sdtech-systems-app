import { expect, it } from "vitest";
import { firstActiveMethod } from "../src/lib/payment-methods";
import type { Collection, PaymentMethodOption, PaymentPlan } from "../shared/types";

it("proposes the first active payment method from Ajustes", () => {
  const m = (id: string, active: boolean) => ({ id, name: id, detail: "", showOnDocs: true, active }) as PaymentMethodOption;
  expect(firstActiveMethod([m("breb", false), m("nequi", true), m("efectivo", true)])).toBe("nequi");
  expect(firstActiveMethod([])).toBe("");
});

it("from a collection, the payment is split across its promises unless Juan picks one", async () => {
  const { defaultPlanChoice, planIdToSend } = await import("../src/lib/payment-methods");
  const plan = { id: "p1" } as PaymentPlan;
  const collection = { id: "c1" } as Collection;
  const choices = [{ id: "a" }, { id: "b" }] as PaymentPlan[];
  expect(defaultPlanChoice({ collection }, choices)).toBe("split");
  expect(planIdToSend({ collection }, "split")).toBeNull();
  expect(planIdToSend({ collection }, "b")).toBe("b");
  expect(defaultPlanChoice({ plan }, choices)).toBe("p1");
  expect(planIdToSend({ plan }, "split")).toBe("p1");
  expect(defaultPlanChoice({}, choices)).toBe("a");
  expect(defaultPlanChoice({}, [])).toBe("none");
  expect(planIdToSend({}, "none")).toBeNull();
});

it("does not let Juan deactivate the last active payment method", async () => {
  const { isLastActive } = await import("../src/lib/payment-methods");
  const m = (id: string, active: boolean) => ({ id, name: id, detail: "", showOnDocs: true, active }) as PaymentMethodOption;
  const list = [m("breb", true), m("nequi", false), m("efectivo", true)];
  expect(isLastActive(list, 0)).toBe(false);
  expect(isLastActive([m("breb", true), m("nequi", false)], 0)).toBe(true);
  expect(isLastActive([m("breb", true), m("nequi", false)], 1)).toBe(false);
});
