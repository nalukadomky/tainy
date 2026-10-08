// DPH u plátců. Ceny v ceníku jsou vždy včetně DPH (host vidí konečnou cenu),
// DPH se z nich jen vypočítá. Místní poplatek z pobytu se odvádí obci a do
// základu DPH nepatří; sleva z voucheru základ snižuje.

import { czk, type Quote } from "@/lib/pricing";

/** Snížená sazba pro ubytování — výchozí volba. */
export const DEFAULT_VAT_RATE = 12;

/** Platná sazba: celé procento 1–50 (jinak výchozí 12 %). */
export function cleanVatRate(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 50 ? n : DEFAULT_VAT_RATE;
}

/** Sazba, kterou web používá: 0 = neplátce. */
export function vatRateOf(site: { vatPayer?: boolean; vatRate?: number }): number {
  return site.vatPayer ? cleanVatRate(site.vatRate) : 0;
}

/** DPH obsažené v částce včetně DPH. */
export function vatIncluded(amount: number, rate: number): number {
  return rate > 0 && amount > 0 ? Math.round((amount * rate) / (100 + rate)) : 0;
}

/** DPH z ceny pobytu: noci + úklid, po slevě, bez místního poplatku. */
export function vatOfQuote(quote: Pick<Quote, "total" | "fees">, discount: number, rate: number): number {
  const touristTax = quote.fees.filter((f) => f.key === "tax").reduce((s, f) => s + f.amount, 0);
  return vatIncluded(quote.total - touristTax - discount, rate);
}

/** Řádek pod celkovou cenou: „včetně DPH 12 % (1 286 Kč)" / „Nejsme plátci DPH." */
export function vatNote(rate: number, amount: number): string {
  return rate > 0 ? `včetně DPH ${rate} % (${czk(amount)})` : "Nejsme plátci DPH.";
}
