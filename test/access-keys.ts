import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256" };

export const testJwks: JWTVerifyGetKey = createLocalJWKSet({ keys: [jwk] });

export async function makeTestToken({
  email,
  aud = "test-aud",
  iss = "https://team.example.com",
  expSeconds = 300,
}: { email: string; aud?: string; iss?: string; expSeconds?: number }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt(now - 10)
    .setExpirationTime(now + expSeconds)
    .sign(privateKey);
}
