import { generateKeyPairSync, sign } from "node:crypto";
export const accessIssuer = "https://coachlane-test.cloudflareaccess.com";
export const accessAudience = "test-coachlane-application-audience";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
export const accessJwks = {
  keys: [
    {
      ...publicKey.export({ format: "jwk" }),
      kid: "test-access-key",
      alg: "RS256",
      use: "sig",
    },
  ],
};
export function accessJwt(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-access-key" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: accessIssuer,
      aud: [accessAudience],
      sub: "test-creator-a",
      email: "coach-a@example.test",
      type: "app",
      iat: now - 1,
      nbf: now - 1,
      exp: now + 3600,
      ...overrides,
    }),
  ).toString("base64url");
  const body = header + "." + payload;
  return (
    body +
    "." +
    sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url")
  );
}
