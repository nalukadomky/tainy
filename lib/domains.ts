// Vlastní domény webů: normalizace, hosty aplikace a DNS záznamy pro registrátora.
// Doménu si majitel koupí sám a u registrátora nastaví záznamy níže; web ji
// pak obslouží (middleware přepíše cestu na /{slug}) a Vercel vydá certifikát.

/** DNS záznamy, které majitel nastaví u registrátora (Vercel). */
export const DNS_RECORDS = [
  { type: "A", name: "@", value: "76.76.21.21", hint: "hlavní doména" },
  { type: "CNAME", name: "www", value: "cname.vercel-dns.com", hint: "varianta s www" },
] as const;

const PATTERN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** Domény, které vlastní web mít nemůže. */
const RESERVED = [/(^|\.)tainy\.cz$/, /\.vercel\.app$/, /(^|\.)localhost$/];

/** Vstup od majitele → „chata-olinka.cz“ (bez https, www, cesty a velkých písmen), nebo null. */
export function cleanDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  d = d.replace(/^www\./, "");
  if (!PATTERN.test(d) || RESERVED.some((r) => r.test(d))) return null;
  return d;
}

/** Hosty samotné aplikace — na nich se vlastní domény nehledají. */
export function isAppHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
  if (h === "tainy.cz" || h === "www.tainy.cz" || h.endsWith(".vercel.app")) return true;
  const app = process.env.NEXT_PUBLIC_APP_URL;
  try {
    if (app && new URL(app).hostname === h) return true;
  } catch {}
  return false;
}

/** Veřejná adresa webu: vlastní doména (když běží), jinak tainy.cz/adresa. */
export function siteUrl(site: { slug: string; customDomain?: string | null; domainStatus?: string }, base = ""): string {
  if (site.customDomain && site.domainStatus === "active") return `https://${site.customDomain}`;
  return `${base}/${site.slug}`;
}
