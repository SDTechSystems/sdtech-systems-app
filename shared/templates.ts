export type TemplateKey = "quote" | "payment" | "progress" | "delivery" | "meeting" | "subscription" | "collection" | "receipt";

/** Mensajes de WhatsApp por defecto (diseño § 6.11). Juan los edita en Ajustes. */
export const DEFAULT_TEMPLATES: Record<TemplateKey, string> = {
  quote: "Hola {nombre}, te comparto la cotización {numero} por {total}. Puedes verla y aprobarla aquí: {link}. Es válida hasta el {vence}.",
  payment:
    "Hola {nombre}, te recuerdo el pago de {concepto} por {monto}, acordado para el {fecha}. Puedes pagar con la llave Bre-B {llave} ({banco}). Aquí ves el detalle: {link}. ¡Gracias!",
  progress: "Hola {nombre}, te cuento cómo va {proyecto}: ya estamos en «{fase}» ({avance}%). Puedes verlo aquí: {link}",
  delivery: "Hola {nombre}, ¡{proyecto} está listo! Ya puedes verlo en tu página: {link}",
  meeting: "Hola {nombre}, te recuerdo nuestra reunión el {fecha} a las {hora}. Enlace: {meet}",
  subscription: "Hola {nombre}, te recuerdo el pago de {servicio} por {monto}, que vence el {fecha}. Llave Bre-B {llave} ({banco}).",
  collection: "Hola {nombre}, te comparto la cuenta de cobro {numero} por {monto}. También la puedes ver en tu página: {link}",
  receipt: "Hola {nombre}, te comparto el recibo de pago {numero} por {monto}. ¡Gracias por tu pago! También lo puedes ver en tu página: {link}",
};

/** Variables que cada plantilla puede usar (se muestran en Ajustes). */
export const TEMPLATE_VARS: Record<TemplateKey, string[]> = {
  quote: ["nombre", "numero", "total", "link", "vence"],
  payment: ["nombre", "concepto", "monto", "fecha", "llave", "banco", "link"],
  progress: ["nombre", "proyecto", "fase", "avance", "link"],
  delivery: ["nombre", "proyecto", "link"],
  meeting: ["nombre", "fecha", "hora", "meet"],
  subscription: ["nombre", "servicio", "monto", "fecha", "llave", "banco"],
  collection: ["nombre", "numero", "monto", "fecha", "link"],
  receipt: ["nombre", "numero", "monto", "link"],
};

/** Reemplaza {clave}. Valores vacíos quedan vacíos; claves desconocidas quedan como están. */
export function fillTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{([a-zA-Z_]+)\}/g, (match, key: string) => {
    if (!(key in vars)) return match;
    const v = vars[key];
    return v === null || v === undefined ? "" : String(v);
  });
}
