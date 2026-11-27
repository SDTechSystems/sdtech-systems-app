import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DocLineRow } from "../src/components/DocLineRow";
import type { EditorLine } from "../src/lib/doc-lines";

it("a promise line says its value and date are changed in the promise (Pagos)", () => {
  const line: EditorLine = { key: "plan:p1", source: "plan", planId: "p1", title: "Anticipo", detail: "", quantity: "1", price: "450.000", locked: true };
  const html = renderToStaticMarkup(createElement(DocLineRow, { line, index: 0, count: 1, currency: "COP", checked: false, onChange: () => {}, onMove: () => {}, onRemove: () => {} }));
  expect(html).toContain("$ 450.000");
  expect(html).toContain("el valor y la fecha se cambian en la promesa (Pagos)");
});
