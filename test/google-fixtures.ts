import { handleGoogleCallback, handleGoogleConnect } from "../worker/api/google";
import { owner, type TestEnv } from "./fixtures";

/** Deja Google "conectado" (usa el mock de google-mock activo). */
export async function connectGoogle(env: TestEnv) {
  const r = await handleGoogleConnect(new Request("https://panel.sdtechsystems.dev/api/google/connect"), env, owner, ["connect"]);
  const state = new URL(r.headers.get("location")!).searchParams.get("state")!;
  await handleGoogleCallback(new Request(`https://panel.sdtechsystems.dev/api/google/callback?code=abc&state=${state}`), env, owner, ["callback"]);
}
