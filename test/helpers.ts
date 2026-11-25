import { createTestDb } from "./d1";
import { ensureSchema, resetSchemaFlag } from "../worker/db/migrate";
import type { Env } from "../worker/env";

export const OWNER = "juan@example.com";

export async function makeEnv(extra: Partial<Env> = {}): Promise<Env> {
  const DB = createTestDb();
  resetSchemaFlag();
  await ensureSchema(DB);
  resetSchemaFlag();
  return {
    DB,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher,
    OWNER_EMAIL: "Juan@Example.com",
    ACCESS_TEAM_DOMAIN: "team.example.com",
    ACCESS_AUD: "test-aud",
    ...extra,
  };
}

export function jsonRequest(method: string, url: string, body?: unknown, contentType = "application/json"): Request {
  return new Request(url, {
    method,
    headers: body === undefined ? {} : { "content-type": contentType },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
