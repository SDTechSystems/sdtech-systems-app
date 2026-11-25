import { expect, it } from "vitest";
import { fillTemplate, DEFAULT_TEMPLATES } from "../shared/templates";
import { paymentVars, progressVars } from "../src/lib/whatsapp";
import type { PaymentPlan, Project } from "../shared/types";

const settings = { payment: { brebKey: "3058147293", bank: "Davibank", usdText: "" } };
const url = "https://clientes.sdtechsystems.dev/c/abc";

it("fills the payment reminder", () => {
  const plan = { label: "Anticipo", amount: 385000, paidAmount: 0, dueDate: "2026-12-13" } as PaymentPlan;
  const vars = paymentVars(plan, "COP", "María Gómez", settings, url);
  expect(fillTemplate(DEFAULT_TEMPLATES.payment, vars)).toBe(
    "Hola María, te recuerdo el pago de Anticipo por $ 385.000, acordado para el 13 de diciembre de 2026. Puedes pagar con la llave Bre-B 3058147293 (Davibank). Aquí ves el detalle: https://clientes.sdtechsystems.dev/c/abc. ¡Gracias!",
  );
});

it("asks only for what is still missing on a partly paid commitment", () => {
  const plan = { label: "Anticipo", amount: 385000, paidAmount: 200000, dueDate: "2026-12-13" } as PaymentPlan;
  expect(paymentVars(plan, "COP", "María Gómez", settings, url).monto).toBe("$ 185.000");
});

it("fills the progress message with the current phase", () => {
  const project = {
    title: "Landing page",
    progress: 38,
    phases: [
      { name: "Contenido", status: "done", parentId: null },
      { name: "Maqueta", status: "in_progress", parentId: null },
    ],
  } as unknown as Project;
  expect(fillTemplate(DEFAULT_TEMPLATES.progress, progressVars(project, "María Gómez", url))).toBe(
    "Hola María, te cuento cómo va Landing page: ya estamos en «Maqueta» (38%). Puedes verlo aquí: https://clientes.sdtechsystems.dev/c/abc",
  );
});

it("fills the meeting reminder in Bogotá time", async () => {
  const { meetingVars } = await import("../src/lib/whatsapp");
  const meeting = { startAt: "2026-12-10T19:30:00-05:00", meetUrl: "https://meet.google.com/abc-defg-hij" } as Parameters<typeof meetingVars>[0];
  expect(fillTemplate(DEFAULT_TEMPLATES.meeting, meetingVars(meeting, "María Gómez"))).toBe(
    "Hola María, te recuerdo nuestra reunión el jueves 10 de diciembre a las 19:30. Enlace: https://meet.google.com/abc-defg-hij",
  );
});

it("fills the subscription reminder", async () => {
  const { subscriptionVars } = await import("../src/lib/whatsapp");
  const sub = { name: "Hosting", amount: 25000, currency: "COP", nextDue: "2026-12-12", clientName: "María Gómez" } as Parameters<typeof subscriptionVars>[0];
  expect(fillTemplate(DEFAULT_TEMPLATES.subscription, subscriptionVars(sub, settings))).toBe(
    "Hola María, te recuerdo el pago de Hosting por $ 25.000, que vence el 12 de diciembre de 2026. Llave Bre-B 3058147293 (Davibank).",
  );
});
