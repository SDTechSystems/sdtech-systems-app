import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, fillTemplate, TEMPLATE_VARS } from "../shared/templates";
import { getSettings } from "../worker/settings";
import { handleSettings } from "../worker/api/settings";
import { jsonRequest, makeEnv } from "./helpers";
import { B, owner } from "./fixtures";

describe("fillTemplate", () => {
  it("leaves empty values empty instead of printing undefined", () => {
    expect(fillTemplate("Hola {nombre}, {link}", { nombre: "María", link: null })).toBe("Hola María, ");
  });
  it("keeps unknown placeholders as written", () => {
    expect(fillTemplate("{nombr} {monto}", { monto: "$ 5" })).toBe("{nombr} $ 5");
  });
  it("replaces every occurrence", () => {
    expect(fillTemplate("{a}-{a}", { a: "x" })).toBe("x-x");
  });
});

describe("collection and receipt templates", () => {
  it("has collection and receipt templates with their variables", () => {
    expect(TEMPLATE_VARS.collection).toEqual(expect.arrayContaining(["nombre", "numero", "monto", "fecha", "link"]));
    expect(TEMPLATE_VARS.receipt).toEqual(expect.arrayContaining(["nombre", "numero", "monto", "link"]));
    expect(DEFAULT_TEMPLATES.collection).toContain("{numero}");
    expect(DEFAULT_TEMPLATES.receipt).toContain("¡Gracias por tu pago!");
  });
});

describe("template settings", () => {
  it("ships the eight default templates and alert days", async () => {
    const s = await getSettings((await makeEnv()).DB);
    expect(Object.keys(s.templates).sort()).toEqual(["collection", "delivery", "meeting", "payment", "progress", "quote", "receipt", "subscription"]);
    expect(s.templates.payment).toBe(DEFAULT_TEMPLATES.payment);
    expect(s.alerts).toEqual({ staleDays: 7, dueSoonDays: 7, quoteExpiringDays: 5 });
  });
  it("rejects an empty template and out-of-range alerts", async () => {
    const env = await makeEnv();
    const call = (body: object) => handleSettings(jsonRequest("PATCH", `${B}/settings`, body), env, owner, ["settings"]);
    expect((await call({ templates: { payment: "" } })).status).toBe(400);
    expect((await call({ alerts: { staleDays: 0 } })).status).toBe(400);
    expect((await call({ alerts: { staleDays: 10 } })).status).toBe(200);
  });
});
