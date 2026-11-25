import { handleClients } from "../worker/api/clients";
import { handleQuotes } from "../worker/api/quotes";
import type { Session } from "../worker/auth/session";
import type { Client, Quote } from "../shared/types";
import { jsonRequest, makeEnv, OWNER } from "./helpers";

export type TestEnv = Awaited<ReturnType<typeof makeEnv>>;
export const owner: Session = { email: OWNER, role: "owner" };
export const socio: Session = { email: "socio@example.com", role: "collaborator" };
export const B = "https://panel.sdtechsystems.dev/api/admin";

export async function newClient(env: TestEnv, name = "María Gómez", phone: string | null = "3058147293"): Promise<Client> {
  const r = await handleClients(jsonRequest("POST", `${B}/clients`, { name, phone }), env, owner, ["clients"]);
  return ((await r.json()) as { client: Client }).client;
}

/** Cotización web de $ 770.000 (anticipo 50%) enviada. */
export async function sentQuote(env: TestEnv, clientId: string, extra: object = {}): Promise<Quote> {
  const items = [
    { title: "Landing page", detail: "Una página", quantity: 1, unitPrice: 650000 },
    { title: "Fotos de producto", detail: "", quantity: 1, unitPrice: 120000 },
  ];
  const r = await handleQuotes(jsonRequest("POST", `${B}/quotes`, { clientId, service: "web", items, ...extra }), env, owner, ["quotes"]);
  const q = ((await r.json()) as { quote: Quote }).quote;
  const s = await handleQuotes(jsonRequest("POST", `${B}/quotes/${q.id}/send`, {}), env, owner, ["quotes", q.id, "send"]);
  return ((await s.json()) as { quote: Quote }).quote;
}

export async function approvedProject(env: TestEnv, extra: object = {}) {
  const client = await newClient(env);
  const quote = await sentQuote(env, client.id, extra);
  const r = await handleQuotes(jsonRequest("POST", `${B}/quotes/${quote.id}/approve`, {}), env, owner, ["quotes", quote.id, "approve"]);
  const { projectId } = (await r.json()) as { projectId: string };
  return { client, quote, projectId };
}
