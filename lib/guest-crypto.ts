import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// Šifrování knihy ubytovaných. Údaje hostů (jméno, datum narození, doklad,
// adresa) se šifrují v aplikaci ještě před uložením — v databázi i v zálohách
// je jen „v1:…“, čitelné jen se šifrovacím klíčem z prostředí.
//
// GUEST_DATA_KEY      — 32 bajtů v base64 (openssl rand -base64 32)
// GUEST_DATA_KEY_OLD  — volitelně předchozí klíč při výměně (jen ke čtení)
//
// AES-256-GCM s náhodným IV; AAD váže záznam k rezervaci a pozici osoby, takže
// zašifrovaný text nejde přesunout k jiné rezervaci. Bez klíče se nic neuloží.

const VERSION = "v1";

function keyFrom(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const key = Buffer.from(raw.trim(), "base64");
  return key.length === 32 ? key : null;
}

const currentKey = () => keyFrom(process.env.GUEST_DATA_KEY);
const keys = () => [currentKey(), keyFrom(process.env.GUEST_DATA_KEY_OLD)].filter((k): k is Buffer => !!k);

/** Je check-in k dispozici (nastavený platný šifrovací klíč)? */
export const guestCryptoReady = () => !!currentKey();

export class GuestCryptoError extends Error {}

const b64 = (b: Buffer) => b.toString("base64url");

/** Zašifruje údaje osoby. AAD = „reservationId:position“. */
export function encryptGuest(data: unknown, aad: string): string {
  const key = currentKey();
  if (!key) throw new GuestCryptoError("Chybí šifrovací klíč GUEST_DATA_KEY.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return [VERSION, b64(iv), b64(cipher.getAuthTag()), b64(body)].join(":");
}

/** Dešifruje údaje osoby; zkusí aktuální i předchozí klíč. */
export function decryptGuest<T = unknown>(payload: string, aad: string): T {
  const [version, iv, tag, body] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !body) throw new GuestCryptoError("Neznámý formát záznamu.");
  for (const key of keys()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      const text = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
      return JSON.parse(text) as T;
    } catch {
      // zkusit další klíč
    }
  }
  throw new GuestCryptoError("Záznam nejde dešifrovat.");
}

/* ---------- Podepsaný odkaz na check-in ---------- */

// Odkaz /checkin/<publicId>.<podpis>: podpis = HMAC z ID rezervace a nonce.
// V databázi není žádný token — odkaz jde kdykoli znovu sestavit, a změnou
// nonce (Reservation.checkinNonce) starý odkaz zneplatnit.

function signingKey(): Buffer | null {
  const key = currentKey();
  return key ? Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), "tainy-checkin-link", 32)) : null;
}

const sign = (key: Buffer, reservationId: string, nonce: string) =>
  createHmac("sha256", key).update(`${reservationId}:${nonce}`).digest("base64url").slice(0, 22);

/** Token pro odkaz na check-in (null = chybí klíč). */
export function checkinToken(r: { id: string; publicId: string; checkinNonce: string }): string | null {
  const key = signingKey();
  return key ? `${r.publicId}.${sign(key, r.id, r.checkinNonce)}` : null;
}

/** Rozloží token na kód rezervace a podpis (bez ověření). */
export function parseCheckinToken(token: string): { publicId: string; sig: string } | null {
  const m = /^([A-Za-z0-9]{6,20})\.([A-Za-z0-9_-]{22})$/.exec(token);
  return m ? { publicId: m[1], sig: m[2] } : null;
}

/** Ověří podpis tokenu vůči rezervaci (v konstantním čase). */
export function verifyCheckinToken(sig: string, r: { id: string; checkinNonce: string }): boolean {
  const key = signingKey();
  if (!key) return false;
  const expected = Buffer.from(sign(key, r.id, r.checkinNonce));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Nový nonce = nový odkaz (starý přestane platit). */
export const newCheckinNonce = () => randomBytes(9).toString("base64url");
