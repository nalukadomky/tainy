import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Web s aktivní vlastní doménou má hlavní adresu na ní: tainy.cz/{slug}/…
 * přesměruje na https://{doména}/… (na samotné doméně nic nedělá).
 */
export async function redirectToCustomDomain(
  site: { customDomain: string | null; domainStatus: string },
  subpath = ""
) {
  if (!site.customDomain || site.domainStatus !== "active") return;
  const host = ((await headers()).get("host") ?? "").toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  if (host === site.customDomain) return;
  redirect(`https://${site.customDomain}${subpath}`);
}
