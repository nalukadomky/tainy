import type { HTMLElement } from "node-html-parser";
import type { Page } from "@/lib/import/crawl";
import type { Field, ImportPhoto, ImportResult, ImportReview, Mark } from "@/lib/import/types";
import { isValidIco, normalizeIco } from "@/lib/legal";
import { contrastWithWhite, normalizeHex } from "@/lib/theme";

// Vytažení údajů z prošlých stránek — bez AI, jen ze značek, strukturovaných
// dat (JSON-LD) a jednoduchých vzorů v textu. Co je odhad, je označené
// „Zkontroluj“; majitel všechno vidí a opraví před vytvořením webu.

const f = <T,>(value: T, mark: Mark, source?: string): Field<T> => ({ value, mark, source });
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const meta = (root: HTMLElement, key: string) =>
  clean(root.querySelector(`meta[property="${key}"]`)?.getAttribute("content") ?? root.querySelector(`meta[name="${key}"]`)?.getAttribute("content") ?? "");

/* ---------- Strukturovaná data (JSON-LD) ---------- */

type Ld = Record<string, unknown>;
const LODGING = /LodgingBusiness|Hotel|VacationRental|Accommodation|House|BedAndBreakfast|Campground|Resort|Hostel|LocalBusiness|Organization|Motel|Apartment/i;

function ldNodes(root: HTMLElement): Ld[] {
  const out: Ld[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Ld;
      if (o["@type"]) out.push(o);
      if (o["@graph"]) walk(o["@graph"]);
    }
  };
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walk(JSON.parse(s.rawText));
    } catch {
      /* rozbitý JSON-LD přeskočíme */
    }
  }
  return out;
}
const typeOf = (n: Ld) => (Array.isArray(n["@type"]) ? (n["@type"] as string[]).join(" ") : String(n["@type"] ?? ""));
const str = (v: unknown) => (typeof v === "string" ? clean(v) : "");

/* ---------- Text stránky ---------- */

const NOISE = /cookie|gdpr|©|copyright|všechna práva|all rights|newsletter|souhlasím|javascript/i;

/** Odstavce hlavního obsahu (bez hlavičky, patičky a menu). */
function paragraphs(root: HTMLElement): string[] {
  const out: string[] = [];
  for (const p of root.querySelectorAll("p, li")) {
    if (p.closest("footer, nav, header, form, aside, script, style, noscript")) continue;
    const t = clean(p.text);
    if (t.length < 80 || t.length > 1500 || NOISE.test(t)) continue;
    out.push(t);
  }
  if (!out.length) {
    // Weby bez odstavců (Webnode, stavebnice): dlouhé řádky hlavního obsahu
    const main = root.querySelector("main, article, [role=main]") ?? root.querySelector("body") ?? root;
    for (const line of main.structuredText.split("\n")) {
      const t = clean(line);
      if (t.length >= 80 && t.length <= 1500 && !NOISE.test(t) && !isShouty(t)) out.push(t);
    }
  }
  return [...new Set(out)];
}

/** Text z menu a nadpisů psaný velkými písmeny („REZERVUJTE SI SVŮJ POBYT“). */
const isShouty = (t: string) => {
  const words = t.split(/\s+/).filter((w) => /[A-ZÁ-Ž]{3,}/.test(w));
  return words.length >= 4 || (words.length >= 2 && words.length / t.split(/\s+/).length > 0.3);
};

/** Text celé stránky s řádky (pro vzory adres, cen, časů). */
function pageText(root: HTMLElement): string {
  const body = root.querySelector("body") ?? root;
  return body.structuredText
    .split("\n")
    .map(clean)
    .filter(Boolean)
    .join("\n");
}

const relPath = (p: Page) => p.path || "/";

/* ---------- Jednotlivé údaje ---------- */

const GENERIC_TITLE = /^(úvod|domů|home|hlavní stránka|vítejte|welcome)$/i;

function findName(home: Page, ld: Ld[]): Field<string> {
  const og = meta(home.root, "og:site_name");
  if (og) return f(og, "found", relPath(home));
  const lodging = ld.find((n) => LODGING.test(typeOf(n)) && str(n.name));
  if (lodging) return f(str(lodging.name), "found", relPath(home));
  const title = clean(home.root.querySelector("title")?.text ?? "");
  if (title) {
    const parts = title.split(/\s+[|\-–—•·:]\s+/).map(clean).filter(Boolean);
    const pick = parts.find((p) => !GENERIC_TITLE.test(p)) ?? parts[0];
    if (pick) return f(pick.slice(0, 80), "check", relPath(home));
  }
  const h1 = clean(home.root.querySelector("h1")?.text ?? "");
  return h1 ? f(h1.slice(0, 80), "check", relPath(home)) : f("", "missing");
}

function firstSentence(s: string, max: number): string {
  const m = s.match(/^(.{20,}?[.!?])(\s|$)/);
  const one = m ? m[1] : s;
  return one.length <= max ? one : `${one.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

const ABOUT = /o-nas|onas|about|kdo-jsme|pribeh|historie|hostitel/i;
const STAY = /ubytovan|chata|chalupa|apartman|pokoj|o-chate|o-chalupe|popis|dum|domek/i;

/** Česká čísla s mezerami: „2 900“, „2.900“ → 2900. */
const num = (s: string) => Number(s.replace(/[\s .]/g, ""));

const WORD_NUM: Record<string, number> = { dva: 2, dvě: 2, tři: 3, čtyři: 4, pět: 5, šest: 6, sedm: 7, osm: 8, devět: 9, deset: 10 };

const TYPES: [RegExp, string][] = [
  [/tiny\s?house/i, "tiny house"],
  [/glamping/i, "glamping"],
  [/roubenk/i, "roubenka"],
  [/penzion/i, "penzion"],
  [/apartm[áa]n/i, "apartmán"],
  [/chat[ay]|chalup/i, "chata"],
];

const AMENITIES: [RegExp, string][] = [
  [/wi-?fi|internet/i, "Wi-Fi"],
  [/parkov/i, "Parkování"],
  [/kuchy[ňn]|kuchyňsk/i, "Kuchyň"],
  [/saun/i, "Sauna"],
  [/vířivk|jacuzzi|whirlpool|hot ?tub/i, "Vířivka"],
  [/kamna|kamen\b|krbov[áa] kamna/i, "Kamna na dřevo"],
  [/\bkrb\b|krbem/i, "Krb"],
  [/terasa|terasou|terasy|terasu/i, "Terasa"],
  [/\bgril/i, "Gril"],
  [/bazén/i, "Bazén"],
  [/klimatiz/i, "Klimatizace"],
  [/myčk/i, "Myčka"],
  [/pračk/i, "Pračka"],
  [/\btv\b|televiz/i, "TV"],
  [/zahrad/i, "Zahrada"],
  [/snídan/i, "Snídaně"],
  [/mazlíč|\bpsi\b[^.\n]{0,20}vítán|pejsk|se psem|psy povolen|pets? (are )?welcome/i, "Domácí mazlíčci vítáni"],
  [/bezbariér/i, "Bezbariérový přístup"],
];

const IMG_SKIP = /logo|icon|favicon|sprite|avatar|flag|vlajk|pixel|spacer|loader|loading|badge|tripadvisor|booking-?logo|placeholder|emoji|arrow|sipka|button|banner-ad|qr/i;

const VIDEO_HOSTS = /ytimg\.com|youtube\.com|vimeocdn\.com|vimeo\.com|maps\.googleapis|gstatic\.com|facebook\.com|fbcdn\.net|instagram/i;

function bestFromSrcset(srcset: string): string {
  let best = "";
  let bestW = -1;
  for (const part of srcset.split(",")) {
    const [u, d] = part.trim().split(/\s+/);
    if (!u) continue;
    const w = d?.endsWith("w") ? Number(d.slice(0, -1)) : d?.endsWith("x") ? Number(d.slice(0, -1)) * 1000 : 0;
    if (w >= bestW) {
      best = u;
      bestW = w;
    }
  }
  return best;
}

function collectPhotos(pages: Page[], ld: Ld[]): ImportPhoto[] {
  const out: ImportPhoto[] = [];
  const seen = new Set<string>();
  const add = (raw: string, base: string, alt: string, source: string) => {
    if (!raw || raw.startsWith("data:") || out.length >= 80) return;
    let u: URL;
    try {
      u = new URL(raw.trim(), base);
    } catch {
      return;
    }
    if (!/^https?:$/.test(u.protocol)) return;
    if (/\.(svg|gif|ico)(\?|$)/i.test(u.pathname) || IMG_SKIP.test(u.pathname) || VIDEO_HOSTS.test(u.hostname)) return;
    // WordPress zmenšeniny „foto-300x200.jpg“ → originál „foto.jpg“
    u.pathname = u.pathname.replace(/-\d{2,4}x\d{2,4}(?=\.\w{3,4}$)/, "");
    const key = (u.hostname + u.pathname).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ src: u.toString(), alt: clean(alt).slice(0, 120), source });
  };
  for (const p of pages) {
    const og = meta(p.root, "og:image");
    if (og) add(og, p.url, "", relPath(p));
  }
  for (const n of ld) {
    const imgs = Array.isArray(n.image) ? n.image : n.image ? [n.image] : [];
    for (const i of imgs) add(typeof i === "string" ? i : str((i as Ld)?.url), pages[0].url, "", relPath(pages[0]));
  }
  for (const p of pages) {
    for (const img of p.root.querySelectorAll("img")) {
      if (img.closest("header, nav, footer")) continue;
      const w = Number(img.getAttribute("width") ?? 0);
      const h = Number(img.getAttribute("height") ?? 0);
      if ((w && w < 400) || (h && h < 300)) continue;
      const srcset = img.getAttribute("srcset") ?? img.getAttribute("data-srcset") ?? "";
      const src =
        (srcset && bestFromSrcset(srcset)) ||
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        img.getAttribute("data-original") ||
        img.getAttribute("src") ||
        "";
      add(src, p.url, img.getAttribute("alt") ?? "", relPath(p));
    }
    for (const s of p.root.querySelectorAll("source[srcset]")) add(bestFromSrcset(s.getAttribute("srcset") ?? ""), p.url, "", relPath(p));
    for (const a of p.root.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") ?? "";
      if (/\.(jpe?g|png|webp)(\?|$)/i.test(href))
        add(href, p.url, a.getAttribute("title") || a.querySelector("img")?.getAttribute("alt") || "", relPath(p));
    }
    for (const m of p.html.matchAll(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+\.(?:jpe?g|png|webp)[^'")]*)['"]?\s*\)/gi)) add(m[1], p.url, "", relPath(p));
  }
  return out;
}

const MONTHS = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

function findReviews(ld: Ld[]): ImportReview[] {
  const out: ImportReview[] = [];
  const nodes = [...ld];
  for (const n of ld) {
    const r = n.review;
    if (Array.isArray(r)) nodes.push(...(r as Ld[]));
    else if (r && typeof r === "object") nodes.push(r as Ld);
  }
  for (const n of nodes) {
    if (!/Review/i.test(typeOf(n)) || /AggregateRating/i.test(typeOf(n))) continue;
    const text = str(n.reviewBody) || str(n.description);
    if (text.length < 10) continue;
    const author = n.author as Ld | string | undefined;
    const name = typeof author === "string" ? clean(author) : str(author?.name);
    const rating = n.reviewRating as Ld | undefined;
    const value = Number(rating?.ratingValue ?? 0);
    const best = Number(rating?.bestRating ?? 5) || 5;
    const [y, mo] = str(n.datePublished).split("-").map(Number);
    const date = y && mo >= 1 && mo <= 12 ? `${MONTHS[mo - 1]} ${y}` : "";
    out.push({ name: name.slice(0, 60) || "Host", text: text.slice(0, 1200), rating: value ? Math.max(1, Math.min(5, Math.round((value / best) * 5))) : 5, meta: date });
    if (out.length >= 12) break;
  }
  return out;
}

/** Hledá v textu stránek; vrací první shodu i se zdrojem. */
function search<T>(pages: Page[], texts: string[], fn: (text: string) => T | null): { value: T; source: string } | null {
  for (let i = 0; i < pages.length; i++) {
    const v = fn(texts[i]);
    if (v !== null && v !== undefined) return { value: v, source: relPath(pages[i]) };
  }
  return null;
}

/* ---------- Celkový výsledek ---------- */

export function extract(pages: Page[], startUrl: string): Omit<ImportResult, "business"> {
  const home = pages[0];
  const host = new URL(home.url).hostname.replace(/^www\./, "");
  const ld = pages.flatMap((p) => ldNodes(p.root));
  const texts = pages.map((p) => pageText(p.root));
  const all = texts.join("\n");
  const lodging = ld.find((n) => LODGING.test(typeOf(n)));

  // Popis místa a O nás
  const stayPages = pages.filter((p, i) => i === 0 || STAY.test(p.path));
  const aboutPages = pages.filter((p) => ABOUT.test(p.path));
  const ldDesc = str(lodging?.description);
  let description: Field<string>;
  if (ldDesc.length >= 80) description = f(ldDesc.slice(0, 1500), "check", relPath(home));
  else {
    const paras: string[] = [];
    let src = "";
    for (const p of stayPages) {
      for (const t of paragraphs(p.root)) {
        if (paras.join("\n\n").length + t.length > 1500) break;
        paras.push(t);
        src ||= relPath(p);
      }
      if (paras.join(" ").length > 600) break;
    }
    const metaDesc = meta(home.root, "description") || meta(home.root, "og:description");
    description = paras.length ? f(paras.join("\n\n"), "check", src) : metaDesc ? f(metaDesc, "check", relPath(home)) : f("", "missing");
  }
  const used = new Set(description.value.split("\n\n"));
  const aboutParas: string[] = [];
  let aboutSrc = "";
  for (const p of aboutPages)
    for (const t of paragraphs(p.root)) {
      if (used.has(t) || aboutParas.join("\n\n").length + t.length > 1500) continue;
      aboutParas.push(t);
      aboutSrc ||= relPath(p);
    }

  const metaDesc = meta(home.root, "description") || meta(home.root, "og:description");
  const tagline = metaDesc && !isShouty(metaDesc) ? f(firstSentence(metaDesc, 120), "check", relPath(home)) : f("", "missing");

  const lower = all.toLowerCase();
  const typeHit = TYPES.find(([re]) => re.test(lower));

  // Kapacita: přednost „až / pro / kapacita N osob“
  const guests = search(pages, texts, (t) => {
    const strong = [...t.matchAll(/(?:až|pro|kapacit\w*|maxim\w*|max\.)\s*:?\s*(\d{1,2})\s*(?:\+\s*\d\s*)?(?:osob|host|lid[ií]|lůž|dospěl)/gi)].map((m) => Number(m[1]));
    const ok = strong.filter((n) => n >= 1 && n <= 40);
    if (ok.length) return Math.max(...ok);
    const words = [...t.matchAll(/(?:až|pro|kapacit\w*|maxim\w*)\s+(?:[a-zá-ž]+\s+){0,3}?(dva|dvě|tři|čtyři|pět|šest|sedm|osm|devět|deset)\s+(?:osob|host|lid|dospěl)/gi)];
    return words.length ? Math.max(...words.map((w) => WORD_NUM[w[1].toLowerCase()])) : null;
  });
  // Slabší záloha: nejvyšší „N osob / lůžek / hostů“ kdekoli v textu
  const guestsLoose = guests
    ? null
    : search(pages, texts, (t) => {
        const all = [...t.matchAll(/\b(\d{1,2})\s*(?:osob|lůž|host)/gi)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 20);
        return all.length ? Math.max(...all) : null;
      });
  const bedrooms = search(pages, texts, (t) => {
    const m = t.match(/(\d)\s*(?:samostatn\w+\s+)?ložnic/i);
    return m ? Number(m[1]) : null;
  });

  // Cena za noc: nejnižší „2 900 Kč / noc“
  const prices: { value: number; source: string }[] = [];
  texts.forEach((t, i) => {
    for (const m of t.matchAll(/(\d{1,3}(?:[  .]\d{3})+|\d{3,6})\s*(?:Kč|,-|CZK)\s*(?:\/|za|na|\bper\b)\s*(?:1\s*)?(?:noc|den)/gi)) {
      const v = num(m[1]);
      if (v >= 300 && v <= 100_000) prices.push({ value: v, source: relPath(pages[i]) });
    }
  });
  prices.sort((a, b) => a.value - b.value);

  const time = (re: RegExp) =>
    search(pages, texts, (t) => {
      const m = t.match(re);
      return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
    });
  const checkIn = time(/(?:příjezd|check-?in|nástup|ubytování od)[^\d\n]{0,30}(\d{1,2})[:.](\d{2})/i);
  const checkOut = time(/(?:odjezd|check-?out|odhlášení|uvolnění)[^\d\n]{0,30}(\d{1,2})[:.](\d{2})/i);

  const amenities = AMENITIES.filter(([re]) => re.test(lower)).map(([, a]) => a);

  // Kontakty: odkazy mailto/tel, přednost e-mailu na stejné doméně
  const mails: { v: string; s: string }[] = [];
  const phones: { v: string; s: string }[] = [];
  pages.forEach((p) => {
    for (const a of p.root.querySelectorAll('a[href^="mailto:"]')) mails.push({ v: decodeURIComponent((a.getAttribute("href") ?? "").slice(7).split("?")[0]).trim(), s: relPath(p) });
    for (const a of p.root.querySelectorAll('a[href^="tel:"]')) phones.push({ v: (a.getAttribute("href") ?? "").slice(4).replace(/[^\d+]/g, ""), s: relPath(p) });
  });
  if (!mails.length) {
    const m = all.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
    if (m) mails.push({ v: m[0], s: relPath(home) });
  }
  if (!phones.length) {
    const m = all.match(/(?:\+420[\s ]?)?\b\d{3}[\s ]?\d{3}[\s ]?\d{3}\b/);
    if (m) phones.push({ v: m[0].replace(/[^\d+]/g, ""), s: relPath(home) });
  }
  const validMail = mails.filter((m) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(m.v) && !/wixpress|sentry|example\./i.test(m.v));
  const mail = validMail.find((m) => m.v.toLowerCase().endsWith(`@${host}`)) ?? validMail[0];
  const phone = phones.find((p) => p.v.replace(/\D/g, "").length >= 9);
  const prettyPhone = (v: string) => {
    const d = v.replace(/\D/g, "");
    const local = d.length === 12 && d.startsWith("420") ? d.slice(3) : d;
    return local.length === 9 ? `${d.length === 12 ? "+420 " : ""}${local.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}` : v;
  };

  // IČ (platné podle kontrolního součtu)
  const ico = search(pages, texts, (t) => {
    for (const m of t.matchAll(/I[ČC]O?\s*[:.]?\s*(\d{2}\s?\d{2}\s?\d{2}\s?\d{2})/g)) {
      const v = normalizeIco(m[1]);
      if (isValidIco(v)) return v;
    }
    return null;
  });

  // Adresa: JSON-LD, jinak řádek s PSČ a obcí
  const ldAddr = (lodging?.address ?? ld.find((n) => n.address)?.address) as Ld | string | undefined;
  let address: Field<string> = f("", "missing");
  if (typeof ldAddr === "string" && ldAddr.length > 5) address = f(clean(ldAddr), "check", relPath(home));
  else if (ldAddr && typeof ldAddr === "object") {
    const a = [str(ldAddr.streetAddress), [str(ldAddr.postalCode), str(ldAddr.addressLocality)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (a) address = f(a, "check", relPath(home));
  }
  if (!address.value) {
    const hit = search(pages, texts, (t) => {
      const m = t.match(/([A-ZÁ-Ža-zá-ž][\wÁ-Žá-ž.\- ]{1,40}?\s\d{1,4}(?:\/\d{1,4})?[a-z]?)\s*,?\s*(\d{3}\s?\d{2})\s+([A-ZÁ-Ž][a-zá-ž]+(?:[ -][A-ZÁ-Ža-zá-ž]+){0,3})/);
      return m ? `${clean(m[1])}, ${m[2].replace(/(\d{3})\s?(\d{2})/, "$1 $2")} ${clean(m[3])}` : null;
    });
    if (hit) address = f(hit.value, "check", hit.source);
  }

  const rawTheme = normalizeHex(meta(home.root, "theme-color"));
  const theme = rawTheme && contrastWithWhite(rawTheme) >= 2 ? rawTheme : null;
  const reviews = findReviews(ld);

  // Web skládaný JavaScriptem: skoro žádný text a hodně skriptů
  const homeText = clean(home.root.querySelector("body")?.text ?? "");
  const scripts = home.root.querySelectorAll("script").length;
  const jsHeavy = (homeText.length < 400 && scripts > 5) || /wix\.com|webnode|squarespace|static\.parastorage/i.test(home.html.slice(0, 20_000));

  return {
    url: startUrl,
    host,
    pages: pages.map(relPath),
    jsHeavy,
    name: findName(home, ld),
    tagline,
    description,
    about: aboutParas.length ? f(aboutParas.join("\n\n"), "check", aboutSrc) : f("", "missing"),
    propertyType: typeHit ? f(typeHit[1], "check") : f("chata", "missing"),
    maxGuests: guests ? f(guests.value, "check", guests.source) : guestsLoose ? f(guestsLoose.value, "check", guestsLoose.source) : f(null, "missing"),
    bedrooms: bedrooms ? f(bedrooms.value, "check", bedrooms.source) : f(null, "missing"),
    pricePerNight: prices.length ? f(prices[0].value, "check", prices[0].source) : f(null, "missing"),
    checkInTime: checkIn ? f(checkIn.value, "check", checkIn.source) : f("", "missing"),
    checkOutTime: checkOut ? f(checkOut.value, "check", checkOut.source) : f("", "missing"),
    amenities: amenities.length ? f(amenities, "found") : f([], "missing"),
    contactEmail: mail ? f(mail.v.toLowerCase(), "found", mail.s) : f("", "missing"),
    contactPhone: phone ? f(prettyPhone(phone.v), "found", phone.s) : f("", "missing"),
    ico: ico ? f(ico.value, "found", ico.source) : f("", "missing"),
    address,
    themeColor: theme ? f(theme, "found", relPath(home)) : f("", "missing"),
    reviews: reviews.length ? f(reviews, "check", relPath(home)) : f([], "missing"),
    photos: collectPhotos(pages, ld),
  };
}
