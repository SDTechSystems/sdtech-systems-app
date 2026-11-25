import type { Handler } from "../auth/session";
import { error, json } from "../http";

export const handleMe: Handler = async (request, _env, session) => {
  if (request.method !== "GET") return error(405, "method_not_allowed");
  return json({ email: session.email, role: session.role });
};
