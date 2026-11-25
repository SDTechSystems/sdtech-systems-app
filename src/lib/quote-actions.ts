import { waLink } from "../../shared/phone";
import type { Client, Quote } from "../../shared/types";
import { apiSend } from "./api";
import { quoteWhatsAppText } from "./labels";

export const getPortalUrl = async (clientId: string): Promise<string> => (await apiSend<{ url: string }>("POST", `/api/admin/clients/${clientId}/portal-link`, {})).url;

/**
 * Abre WhatsApp con el mensaje de la cotización. La pestaña se abre antes de esperar a la red,
 * porque los navegadores bloquean ventanas abiertas después de un await.
 * Devuelve false si el cliente no tiene teléfono (el texto queda copiado).
 */
export async function shareQuote(quote: Quote, client: Pick<Client, "id" | "name" | "phone">): Promise<boolean> {
  const tab = client.phone ? window.open("about:blank", "_blank") : null;
  const url = await getPortalUrl(client.id);
  const text = quoteWhatsAppText(quote, client.name, url);
  if (client.phone && tab) {
    tab.location.href = waLink(client.phone, text);
    return true;
  }
  await navigator.clipboard?.writeText(text).catch(() => undefined);
  tab?.close();
  return false;
}
