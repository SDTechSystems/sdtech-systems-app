import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Env } from "../env";

const remoteSets = new Map<string, JWTVerifyGetKey>();

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  let set = remoteSets.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    remoteSets.set(teamDomain, set);
  }
  return set;
}

/** Verifica el JWT que Cloudflare Access pone en Cf-Access-Jwt-Assertion. */
export async function verifyAccessJwt(token: string, env: Env, jwks?: JWTVerifyGetKey): Promise<{ email: string } | null> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  try {
    const { payload } = await jwtVerify(token, jwks ?? remoteJwks(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    return email ? { email } : null;
  } catch {
    return null;
  }
}
