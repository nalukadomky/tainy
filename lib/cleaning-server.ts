import "server-only";
import { randomBytes } from "node:crypto";

// Serverové pomocníky pro úklidy (náhodné odkazy, čtení sazby z požadavku).

/** Tajný odkaz uklízečky — 32 znaků, neodhadnutelný. */
export const newCleanerToken = () => randomBytes(24).toString("base64url");

export function readPay(body: Record<string, unknown>) {
  const payMode = body.payMode === "flat" ? "flat" : "hourly";
  const rate = Math.max(0, Math.min(100_000, Math.round(Number(body.rate) || 0)));
  return { payMode, rate };
}
