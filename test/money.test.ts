import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyInput } from "../shared/money";

describe("formatMoney", () => {
  it("formats COP pesos with dot thousands", () => {
    expect(formatMoney(650000, "COP")).toBe("$ 650.000");
    expect(formatMoney(0, "COP")).toBe("$ 0");
  });
  it("formats USD cents", () => {
    expect(formatMoney(123456, "USD")).toBe("US$ 1.234,56");
  });
});

describe("parseMoneyInput", () => {
  it("reads COP with separators or symbols", () => {
    expect(parseMoneyInput("650.000", "COP")).toBe(650000);
    expect(parseMoneyInput("$ 650.000", "COP")).toBe(650000);
    expect(parseMoneyInput("650000", "COP")).toBe(650000);
  });
  it("reads USD into cents", () => {
    expect(parseMoneyInput("1.234,56", "USD")).toBe(123456);
    expect(parseMoneyInput("1234.56", "USD")).toBe(123456);
    expect(parseMoneyInput("12", "USD")).toBe(1200);
  });
  it("rejects text and negatives", () => {
    expect(parseMoneyInput("abc", "COP")).toBeNull();
    expect(parseMoneyInput("-5", "COP")).toBeNull();
  });
});
