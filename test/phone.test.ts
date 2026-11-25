import { describe, expect, it } from "vitest";
import { normalizePhone, waLink } from "../shared/phone";

describe("normalizePhone", () => {
  it.each(["305 814 7293", "+57 305-814-7293", "3058147293", "(305) 8147293"])("normalizes %s to 573058147293", (v) => {
    expect(normalizePhone(v)).toBe("573058147293");
  });
  it("keeps foreign numbers written with +", () => {
    expect(normalizePhone("+1 (212) 555-0100")).toBe("12125550100");
  });
  it("returns null without digits", () => {
    expect(normalizePhone("sin número")).toBeNull();
  });
});

describe("waLink", () => {
  it("builds a wa.me link with encoded text", () => {
    expect(waLink("573058147293", "Hola, ¿cómo vas?")).toBe("https://wa.me/573058147293?text=Hola%2C%20%C2%BFc%C3%B3mo%20vas%3F");
  });
});
