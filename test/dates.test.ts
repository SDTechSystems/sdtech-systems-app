import { expect, it } from "vitest";
import { addDays, isExpired, todayBogota } from "../shared/dates";

it("uses the Bogotá calendar day, not UTC", () => {
  expect(todayBogota(new Date("2026-11-26T01:30:00Z"))).toBe("2026-11-25");
  expect(todayBogota(new Date("2026-11-26T06:00:00Z"))).toBe("2026-11-26");
});

it("adds calendar days across months", () => {
  expect(addDays("2026-11-25", 30)).toBe("2026-12-25");
  expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
});

it("keeps a quote valid through its last day", () => {
  expect(isExpired("2026-12-25", "2026-12-25")).toBe(false);
  expect(isExpired("2026-12-25", "2026-12-26")).toBe(true);
});

it("turns an instant into the Bogotá calendar day", async () => {
  const { dayOf } = await import("../shared/dates");
  expect(dayOf("2026-11-26T01:30:00.000Z")).toBe("2026-11-25");
});
