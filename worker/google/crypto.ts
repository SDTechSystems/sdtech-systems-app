const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const keyFor = (keyB64: string) => crypto.subtle.importKey("raw", unb64(keyB64), "AES-GCM", false, ["encrypt", "decrypt"]);

/** AES-GCM con IV aleatorio. Formato: base64(iv).base64(cifrado). */
export async function encryptToken(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFor(keyB64), new TextEncoder().encode(plain));
  return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}

export async function decryptToken(sealed: string, keyB64: string): Promise<string> {
  const [iv, data] = sealed.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await keyFor(keyB64), unb64(data));
  return new TextDecoder().decode(plain);
}
