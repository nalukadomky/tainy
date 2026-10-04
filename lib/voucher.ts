// Vouchery (slevové kódy) — čistá logika pro widget, API i administraci.
//
// Sleva se počítá z ubytování a úklidu; poplatek z pobytu se platí vždy celý
// (majitel ho odvádí obci). Hodnotový voucher jde uplatnit jen na pobyt,
// jehož ubytování + úklid je dražší než hodnota voucheru.

import { czk, type Quote } from "@/lib/pricing";

export type VoucherKind = "pct" | "czk";

export type VoucherRule = {
  code: string;
  kind: VoucherKind;
  value: number;
  /** ISO yyyy-mm-dd nebo prázdné */
  validFrom: string | null;
  validTo: string | null;
  maxUses: number | null;
  active: boolean;
};

export type VoucherStatus = "active" | "inactive" | "upcoming" | "expired" | "used-up";

export const STATUS_LABEL: Record<VoucherStatus, string> = {
  active: "Aktivní",
  inactive: "Vypnutý",
  upcoming: "Ještě neplatí",
  expired: "Vypršel",
  "used-up": "Vyčerpaný",
};

/** Kód tak, jak ho host mohl napsat: bez mezer, velkými písmeny. */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase().slice(0, 40);
}

/** Náhodný kód s předponou podle názvu webu, např. MEDUNKA-7K3Q. */
export function generateCode(siteName: string): string {
  const prefix =
    siteName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(" ")
      .filter((w) => w.length > 2 && !["CHATA", "CHALUPA", "APARTMAN", "TINY", "HOUSE"].includes(w))[0]
      ?.slice(0, 10) || "SLEVA";
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const rand = Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `${prefix}-${rand}`;
}

/** Stav voucheru k danému dni. */
export function voucherStatus(v: VoucherRule, uses: number, todayIso: string): VoucherStatus {
  if (!v.active) return "inactive";
  if (v.validFrom && todayIso < v.validFrom) return "upcoming";
  if (v.validTo && todayIso > v.validTo) return "expired";
  if (v.maxUses !== null && uses >= v.maxUses) return "used-up";
  return "active";
}

/** Z čeho se sleva počítá: ubytování + úklid (bez poplatku z pobytu). */
export function discountBase(quote: Pick<Quote, "nightsTotal" | "fees">): number {
  const cleaning = quote.fees.filter((f) => f.key === "cleaning").reduce((s, f) => s + f.amount, 0);
  return quote.nightsTotal + cleaning;
}

/** Sleva v Kč pro daný základ, nebo chyba, když voucher na pobyt nejde uplatnit. */
export function discountFor(
  kind: VoucherKind,
  value: number,
  base: number
): { discount: number } | { error: string } {
  if (kind === "czk") {
    if (base <= value) {
      return { error: `Voucher na ${czk(value)} jde uplatnit jen na pobyt dražší než ${czk(value)}.` };
    }
    return { discount: value };
  }
  return { discount: Math.min(base, Math.round((base * value) / 100)) };
}

const STATUS_ERROR: Record<Exclude<VoucherStatus, "active">, string> = {
  inactive: "Tenhle voucher už neplatí.",
  upcoming: "Tenhle voucher zatím neplatí.",
  expired: "Platnost voucheru už vypršela.",
  "used-up": "Tenhle voucher už byl vyčerpaný.",
};

/** Kompletní ověření voucheru pro konkrétní pobyt. */
export function applyVoucher(
  v: VoucherRule,
  uses: number,
  quote: Pick<Quote, "nightsTotal" | "fees">,
  todayIso: string
): { discount: number } | { error: string } {
  const status = voucherStatus(v, uses, todayIso);
  if (status !== "active") return { error: STATUS_ERROR[status] };
  return discountFor(v.kind, v.value, discountBase(quote));
}

/** Krátký popis hodnoty: „−15 %“ / „−1 000 Kč“. */
export function voucherValueLabel(kind: string, value: number): string {
  return kind === "czk" ? `−${czk(value)}` : `−${value} %`;
}
