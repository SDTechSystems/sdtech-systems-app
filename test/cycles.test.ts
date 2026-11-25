import { expect, it } from "vitest";
import { addCycle } from "../shared/cycles";

it("advances one billing cycle, clamping to the last day of the month", () => {
  expect(addCycle("2026-01-31", "mensual")).toBe("2026-02-28");
  expect(addCycle("2026-02-28", "mensual")).toBe("2026-03-28");
  expect(addCycle("2028-02-29", "anual")).toBe("2029-02-28");
  expect(addCycle("2026-12-15", "mensual")).toBe("2027-01-15");
});
