const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32");
  }
  return Buffer.from(key, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const cipher = require("crypto").createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${Buffer.from(iv).toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");

  const decipher = require("crypto").createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

export function isEncryptionConfigured(): boolean {
  const key = process.env.ENCRYPTION_KEY;
  return !!key && key.length === 64;
}
