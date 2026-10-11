// Ukázková platba pro vývoj: rezervace se rovnou označí jako zaplacená,
// aby šlo projít celý řetěz až po potvrzení a dashboard.
//
// Mimo produkci je zapnutá sama, v produkci jen na výslovné přání.
// Stejné pravidlo čte widget (jestli volbu nabídnout) i API (jestli ji přijmout)
// — o bezpečnost se stará API, widget volbu jen skrývá.

export function demoPaymentsEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_DEMO_PAYMENTS;
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

// Ukázkový web pro návštěvníky úvodní stránky: adresa tainy.cz/demo vede vždy
// na tenhle web, i když má jinou vlastní adresu (zatím Chata Olinka). Do
// budoucna samostatné demo pro všechny — pak stačí změnit DEMO_SITE_ID.
export const DEMO_SLUG = "demo";
export const DEMO_SITE_ID = process.env.DEMO_SITE_ID || "cmuhj8ull0000p7weas2jd7u7";

/** Podmínka pro hledání webu podle adresy — „demo“ = ukázkový web. */
export const siteWhere = (slug: string) => (slug === DEMO_SLUG ? { id: DEMO_SITE_ID } : { slug });
