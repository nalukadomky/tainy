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
