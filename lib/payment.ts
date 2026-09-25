// QR platba podle českého standardu SPAYD (Short Payment Descriptor).
// Čistá logika bez závislostí, aby šla použít i v prohlížeči
// (vykreslení QR je v lib/payment-qr.ts, protože běží jen na serveru).
// Vygenerovaný kód přečte každá česká bankovní aplikace, takže majitel
// nepotřebuje žádnou registraci u platební brány — jen číslo účtu.

const BANK_CODES = /^(\d{1,6}-)?(\d{2,10})\/(\d{4})$/;

/**
 * Převede české číslo účtu („19-2000145399/0800") na IBAN.
 * Když už na vstupu IBAN je, jen ho normalizuje. Vrací null u nesmyslu.
 */
export function toIBAN(account: string): string | null {
  const clean = account.replace(/\s+/g, "").toUpperCase();
  if (!clean) return null;

  if (/^CZ\d{22}$/.test(clean)) return clean;

  const m = clean.match(BANK_CODES);
  if (!m) return null;
  const [, prefixRaw, number, bank] = m;
  const prefix = (prefixRaw ?? "").replace("-", "").padStart(6, "0");
  const body = `${bank}${prefix}${number.padStart(10, "0")}`;

  // Kontrolní číslice: mod 97 nad „body + CZ00" s písmeny přepsanými na čísla (C=12, Z=35)
  const check = 98 - mod97(`${body}123500`);
  return `CZ${String(check).padStart(2, "0")}${body}`;
}

// mod 97 po částech — číslo je delší, než unese Number
function mod97(digits: string): number {
  let rest = 0;
  for (const ch of digits) rest = (rest * 10 + Number(ch)) % 97;
  return rest;
}

/** Variabilní symbol z kódu rezervace — jen číslice, max. 10 znaků. */
export function variableSymbol(publicId: string): string {
  let hash = 0;
  for (const ch of publicId) hash = (hash * 31 + ch.charCodeAt(0)) % 1_000_000_000;
  return String(hash).padStart(9, "0");
}

export type PaymentInfo = {
  iban: string;
  amount: number;
  message: string;
  vs: string;
};

export function buildPayment(
  account: string,
  amount: number,
  siteName: string,
  publicId: string
): PaymentInfo | null {
  const iban = toIBAN(account);
  if (!iban) return null;
  return {
    iban,
    amount,
    // Zpráva pro příjemce: SPAYD nesnese hvězdičku ani diakritiku
    message: `${siteName} ${publicId}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s-]/g, "").slice(0, 60),
    vs: variableSymbol(publicId),
  };
}

/** SPAYD řetězec, který se kóduje do QR. */
export function spayd(p: PaymentInfo): string {
  return [
    "SPD*1.0",
    `ACC:${p.iban}`,
    `AM:${p.amount.toFixed(2)}`,
    "CC:CZK",
    `X-VS:${p.vs}`,
    `MSG:${p.message}`,
  ].join("*");
}

/** IBAN po čtveřicích, aby se dal přečíst a opsat. */
export function formatIBAN(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
