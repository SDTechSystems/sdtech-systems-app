import type { Settings } from "../../shared/types";
import { logActivity } from "../activity";
import { requireRole, type Handler } from "../auth/session";
import { error, json, readJson } from "../http";
import { getSettings, mergeSettings, saveSettingsStatement, validSettings } from "../settings";

export const handleSettings: Handler = async (request, env, session) => {
  const denied = requireRole(session, "owner");
  if (denied) return denied;

  if (request.method === "GET") return json({ settings: await getSettings(env.DB) });

  if (request.method === "PATCH") {
    const body = await readJson<Partial<Settings>>(request);
    if (body instanceof Response) return body;
    const next = mergeSettings(await getSettings(env.DB), body);
    if (!validSettings(next)) return error(400, "invalid_settings");
    await env.DB.batch([saveSettingsStatement(env.DB, next), logActivity(env.DB, session.email, "settings", "app", "update", { sections: Object.keys(body) })]);
    return json({ settings: next });
  }

  return error(405, "method_not_allowed");
};
