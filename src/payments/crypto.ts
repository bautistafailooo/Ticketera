import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Los tokens de Mercado Pago de los organizadores se guardan cifrados (AES-256-GCM).
// La clave sale del secreto de la aplicación de Mercado Pago (MP_CLIENT_SECRET), que no
// está en la base: una copia de la base sola no alcanza para cobrar en nombre de nadie.
// Si se cambia MP_CLIENT_SECRET, los organizadores tienen que volver a conectar su cuenta.

function keyFrom(secret: string) {
  return createHash("sha256").update(`ecko:mercadopago:${secret}`).digest();
}

export function encrypt(text: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

// Devuelve null si no se puede descifrar (por ejemplo, porque cambió el secreto).
export function decrypt(value: string, secret: string): string | null {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
