import "server-only";
import { parse, type HTMLElement } from "node-html-parser";
import { SafeFetchError, decodeText, safeFetch } from "@/lib/safe-fetch";

// Projití existujícího webu: úvodní stránka, sitemap a nejvýš 15 dalších
// stránek stejné domény. Respektuje robots.txt, stahuje po čtyřech a celé to
// má časový strop, aby se vešlo do limitu serveru.

export type Page = { url: string; path: string; root: HTMLElement; html: string };

const UA = "Mozilla/5.0 (compatible; tainy-import/1.0; +https://tainy.cz)";
const MAX_PAGES = 15;
const PAGE_BYTES = 2_000_000;
const BUDGET_MS = 25_000;

/** Stránky, které nejspíš obsahují to, co hledáme — mají přednost. */
const PRIORITY =
  /o-nas|onas|about|kdo-jsme|pribeh|ubytovani|ubytovan|chata|chalupa|apartman|pokoj|vybaveni|cenik|ceny|price|kontakt|contact|galerie|fotogalerie|gallery|foto|recenze|reference|hodnoceni|reviews|okoli|lokalita|informace/;
const SKIP =
  /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3|ics)(\?|$)|\/(wp-admin|wp-login|cart|kosik|login|admin|feed)\b|^https?:\/\/[^/]+\/(en|de|pl|sk|uk|ru|it|fr|nl)(\/|$)|zasady|ochrana-osobnich|gdpr|cookies|obchodni-podminky|tag\/|category\/|author\//i;

export class CrawlError extends Error {}

/** Adresa od uživatele → plná adresa úvodní stránky (doplní https://). */
export function normalizeSiteUrl(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");

async function fetchHtml(url: string, timeoutMs: number): Promise<{ url: string; html: string } | null> {
  try {
    const res = await safeFetch(url, { timeoutMs, maxBytes: PAGE_BYTES, accept: "text/html,*/*;q=0.5", userAgent: UA, allowHttp: true });
    if (res.contentType && !res.contentType.includes("html")) return null;
    return { url: res.url, html: decodeText(res.bytes, res.contentType) };
  } catch {
    return null;
  }
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  try {
    const res = await safeFetch(url, { timeoutMs, maxBytes: 500_000, userAgent: UA, allowHttp: true });
    return decodeText(res.bytes, res.contentType);
  } catch {
    return "";
  }
}

/** Zakázané cesty z robots.txt pro všechny roboty. */
function disallowed(robots: string): string[] {
  const out: string[] = [];
  let forAll = false;
  for (const line of robots.split(/\r?\n/)) {
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") forAll = val === "*";
    else if (forAll && key === "disallow" && val) out.push(val);
  }
  return out;
}

export async function crawl(startUrl: string): Promise<{ pages: Page[]; home: Page }> {
  const started = Date.now();
  const left = () => BUDGET_MS - (Date.now() - started);

  // Úvodní stránka; když https nejde, zkusíme http
  let first = await fetchHtml(startUrl, 10_000);
  if (!first && startUrl.startsWith("https://")) first = await fetchHtml(startUrl.replace(/^https:/, "http:"), 8_000);
  if (!first) {
    try {
      await safeFetch(startUrl, { timeoutMs: 6_000, maxBytes: 10_000, userAgent: UA, allowHttp: true });
    } catch (e) {
      if (e instanceof SafeFetchError && e.code === "dns") throw new CrawlError("Tuhle adresu jsme nenašli. Zkontroluj, jestli je napsaná správně.");
      if (e instanceof SafeFetchError && e.code === "blocked") throw new CrawlError("Tuhle adresu nejde použít.");
    }
    throw new CrawlError("Web se nám nepodařilo načíst. Zkus to za chvíli znovu, nebo zkontroluj adresu.");
  }

  const origin = new URL(first.url);
  const host = bare(origin.hostname);
  const home: Page = { url: first.url, path: origin.pathname || "/", html: first.html, root: parse(first.html) };

  const [robots, sitemapXml] = await Promise.all([
    fetchText(new URL("/robots.txt", origin).toString(), 5_000),
    fetchText(new URL("/sitemap.xml", origin).toString(), 6_000),
  ]);
  const blocked = disallowed(robots);
  const allowed = (path: string) => !blocked.some((b) => path.startsWith(b));

  // Kandidáti: odkazy z úvodní stránky + sitemap
  const candidates = new Map<string, number>();
  const consider = (href: string, base: string, bonus: number) => {
    let u: URL;
    try {
      u = new URL(href, base);
    } catch {
      return;
    }
    if (!/^https?:$/.test(u.protocol) || bare(u.hostname) !== host) return;
    u.hash = "";
    const key = u.toString();
    if (SKIP.test(key) || !allowed(u.pathname) || key === home.url) return;
    const score = (PRIORITY.test(u.pathname.toLowerCase()) ? 10 : 0) + bonus - u.pathname.split("/").length;
    candidates.set(key, Math.max(candidates.get(key) ?? -99, score));
  };
  for (const a of home.root.querySelectorAll("a[href]")) consider(a.getAttribute("href") ?? "", home.url, 2);
  for (const m of sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    if (candidates.size > 300) break;
    if (!/\.xml(\?|$)/i.test(m[1])) consider(m[1], home.url, 0);
  }

  const queue = [...candidates.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u).slice(0, MAX_PAGES);
  const pages: Page[] = [home];
  const seen = new Set([home.url]);
  let i = 0;
  const worker = async () => {
    while (i < queue.length && left() > 1_500) {
      const url = queue[i++];
      const got = await fetchHtml(url, Math.min(8_000, left()));
      if (!got || seen.has(got.url)) continue;
      seen.add(got.url);
      pages.push({ url: got.url, path: new URL(got.url).pathname, html: got.html, root: parse(got.html) });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { pages, home };
}
