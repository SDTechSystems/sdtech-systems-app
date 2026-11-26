import { describe, expect, it } from "vitest";
import { amountInWords } from "../shared/words";

describe("amountInWords", () => {
  it("writes pesos in Spanish", () => {
    expect(amountInWords(450000, "COP")).toBe("cuatrocientos cincuenta mil pesos");
    expect(amountInWords(1_000_000, "COP")).toBe("un millón de pesos");
    expect(amountInWords(2_521_000, "COP")).toBe("dos millones quinientos veintiún mil pesos");
    expect(amountInWords(0, "COP")).toBe("cero pesos");
  });

  it("writes dollars from cents", () => {
    expect(amountInWords(12050, "USD")).toBe("ciento veinte dólares con cincuenta centavos");
  });

  it("handles the irregular forms", () => {
    expect(amountInWords(1, "COP")).toBe("un peso");
    expect(amountInWords(100, "COP")).toBe("cien pesos");
    expect(amountInWords(101, "COP")).toBe("ciento un pesos");
    expect(amountInWords(1000, "COP")).toBe("mil pesos");
    expect(amountInWords(16_000, "COP")).toBe("dieciséis mil pesos");
    expect(amountInWords(21_000, "COP")).toBe("veintiún mil pesos");
    expect(amountInWords(31_500, "COP")).toBe("treinta y un mil quinientos pesos");
    expect(amountInWords(890_000, "COP")).toBe("ochocientos noventa mil pesos");
    expect(amountInWords(3_000_000, "COP")).toBe("tres millones de pesos");
    expect(amountInWords(1_250_000, "COP")).toBe("un millón doscientos cincuenta mil pesos");
    expect(amountInWords(1_000_000_000, "COP")).toBe("mil millones de pesos");
    expect(amountInWords(100, "USD")).toBe("un dólar");
    expect(amountInWords(12000, "USD")).toBe("ciento veinte dólares");
    expect(amountInWords(1, "USD")).toBe("cero dólares con un centavo");
    expect(amountInWords(-5000, "COP")).toBe("menos cinco mil pesos");
  });
});
