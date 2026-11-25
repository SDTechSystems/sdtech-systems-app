import { describe, expect, it } from "vitest";
import { scrollDeltaFor } from "../src/lib/keyboard-scroll";

// Pantalla visible sobre el teclado: 420 px. Margen inferior: max(120, 25% de 420) = 120.
const VH = 420;

describe("scrollDeltaFor", () => {
  it("does not move when the field is comfortably visible", () => {
    expect(scrollDeltaFor({ top: 100, bottom: 148 }, VH)).toBe(0);
  });

  it("scrolls a little as soon as the field gets near the keyboard edge", () => {
    // bottom 330 > 420 - 120 = 300 → sube 30 px, no lo centra
    expect(scrollDeltaFor({ top: 282, bottom: 330 }, VH)).toBe(30);
  });

  it("brings up a field already under the keyboard to the same comfortable spot", () => {
    expect(scrollDeltaFor({ top: 500, bottom: 548 }, VH)).toBe(248);
  });

  it("scrolls back down when the field is hidden under the top bar", () => {
    expect(scrollDeltaFor({ top: 20, bottom: 68 }, VH, { top: 72 })).toBe(-52);
  });

  it("uses a quarter of a tall screen as the margin", () => {
    // 800 px visibles → margen 200; bottom 650 > 600 → 50
    expect(scrollDeltaFor({ top: 602, bottom: 650 }, 800)).toBe(50);
  });
});
