import "server-only";
import { prisma } from "@/lib/prisma";

// Poplatek z pobytu podle obce: z adresy ubytování zjistí obec (Photon),
// ve Sbírce právních předpisů obcí (sbirkapp.gov.cz, veřejná, bez klíče)
// najde její platnou vyhlášku o poplatku z pobytu a zkusí z textu přečíst
// sazbu. Naskenované vyhlášky text nemají — pak majitel dostane odkaz
// a sazbu opíše. Každý krok smí selhat; nic dalšího tím nespadne.

const SPP = "https://sbirkapp.gov.cz";
const HEADERS = { "User-Agent": "tainy.cz (poplatek z pobytu)", Accept: "*/*" };
const TIMEOUT = 8000;
const MAX_PAGES = 12;

export type TaxSource = {
  /** found = vyhláška nalezena, none = obec nemá platnou vyhlášku, unknown = obec nebo Sbírka nenalezena */
  status: "found" | "none" | "unknown";
  municipality?: string; // „Obec Lipno nad Vltavou“
  ico?: string;
  ovm?: string; // kód vydavatele ve Sbírce
  title?: string; // název vyhlášky
  url?: string; // odkaz na vyhlášku
  validFrom?: string; // účinnost (ISO)
  rate?: number | null; // přečtená sazba, null = nejde přečíst (sken, sazby v příloze, novela)
  amended?: boolean; // vyhlášku mění pozdější novela
  changed?: boolean; // od posledního ověření se objevila nová vyhláška
  /** Adresa, pro kterou se hledalo (změna adresy = hledat znovu). */
  address?: string;
  checkedAt: string;
};

export function parseTaxSource(raw: string | null | undefined): TaxSource | null {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" && typeof v.status === "string" ? (v as TaxSource) : null;
  } catch {
    return null;
  }
}

async function get(url: string) {
  return fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" }).catch(() => null);
}

/** Obec, kraj a PSČ z adresy ubytování (Photon nad OpenStreetMap). */
async function placeOf(address: string): Promise<{ town: string; state: string; zip: string } | null> {
  const url = `https://photon.komoot.io/api/?${new URLSearchParams({ q: address, limit: "1", bbox: "12.09,48.55,18.86,51.06" })}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "tainy.cz (geocoding)" },
    signal: AbortSignal.timeout(5000),
    next: { revalidate: 86400 },
  }).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  const p: Record<string, string> | undefined = data?.features?.[0]?.properties;
  const town = p?.city || p?.locality || p?.name || "";
  if (town) return { town, state: p?.state ?? "", zip: (p?.postcode ?? "").replace(/\s/g, "") };
  // Bez nálezu: obec z konce adresy („…, 382 78 Lipno nad Vltavou“)
  const last = address.split(",").pop()?.replace(/\d{3}\s?\d{2}/, "").trim();
  return last ? { town: last, state: "", zip: (/\d{3}\s?\d{2}/.exec(address)?.[0] ?? "").replace(/\s/g, "") } : null;
}

/** „OBEC LHOTA POD HOŘIČKAMI“ → „Obec Lhota pod Hořičkami“ (Sbírka má některé názvy velkými písmeny). */
function prettyName(name: string): string {
  if (name !== name.toLocaleUpperCase("cs")) return name;
  const small = new Set(["pod", "nad", "u", "v", "na", "při", "ve", "město", "obec", "městys"]);
  return name
    .toLocaleLowerCase("cs")
    .split(" ")
    .map((w, i) => (i === 0 || !small.has(w) ? w.charAt(0).toLocaleUpperCase("cs") + w.slice(1) : w))
    .join(" ");
}

const norm = (s: string) => s.toLocaleLowerCase("cs").replace(/\s+/g, " ").trim();
const TYPE = /^(?:obec|město|městys|statutární město|hlavní město)\s+/i;

/** Vydavatel (obec) ve Sbírce: shoda názvu, pak kraje a PSČ. */
async function findMunicipality(place: { town: string; state: string; zip: string }) {
  // Praha: „Praha 4“ i „Praha“ = hlavní město
  const town = /^praha\b/i.test(place.town) ? "Praha" : place.town;
  const res = await get(`${SPP}/xhr/naseptavac/ovm?${new URLSearchParams({ q: town })}`);
  const list: { kod: string; name: string }[] = res?.ok ? await res.json().catch(() => []) : [];
  const parsed = list
    .map((x) => {
      const m = /^(.+?)(?:,\s*([^,(]+?kraj))?\s*\((.*)\)\s*$/.exec(x.name);
      if (!m) return null;
      const name = m[1].trim();
      return {
        kod: x.kod,
        name: prettyName(name),
        bare: norm(name.replace(TYPE, "")),
        kraj: m[2] ?? "",
        zip: /PSČ (\d{5})/.exec(m[3])?.[1] ?? "",
        ico: /IČO: (\d+)/.exec(m[3])?.[1] ?? "",
        isTown: TYPE.test(name),
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.isTown);
  let hits = parsed.filter((x) => x.bare === norm(town === "Praha" ? "Praha" : town));
  const narrow = (pick: (x: (typeof hits)[number]) => boolean) => {
    const left = hits.filter(pick);
    if (left.length) hits = left;
  };
  if (hits.length > 1 && place.state) narrow((x) => norm(x.kraj) === norm(place.state));
  if (hits.length > 1 && place.zip) narrow((x) => x.zip === place.zip);
  return hits.length === 1 ? hits[0] : null;
}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, "|")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/(\s*\|\s*)+/g, "|");

const isoOf = (d: string) => {
  const [dd, mm, yyyy] = d.split(".");
  return `${yyyy}-${mm}-${dd}`;
};

type Ordinance = { id: string; title: string; validFrom?: string; amends: boolean; combined: boolean };

/**
 * Platné vyhlášky, které se můžou týkat poplatku z pobytu: samostatná
 * „o místním poplatku z pobytu“, společná „o místních poplatcích“ (Brno)
 * i novely (Praha). Nejnovější účinnost první. undefined = Sbírka nedostupná
 * nebo obec má předpisů víc, než projdeme — pak nic netvrdíme.
 */
async function findOrdinances(ovm: string): Promise<Ordinance[] | undefined> {
  const out: Ordinance[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await get(`${SPP}/vydavatel/${ovm}${page > 1 ? `?page=${page}` : ""}`);
    if (!res?.ok) return undefined;
    const html = await res.text();
    for (const part of html.split('href="/detail/').slice(1)) {
      const id = part.slice(0, part.indexOf('"'));
      const text = stripTags(part.slice(part.indexOf(">") + 1)).split("|").map((x) => x.trim()).filter(Boolean);
      const title = text[0] ?? "";
      const own = /poplatk\w* z pobytu/i.test(title);
      const combined = /o místních poplatcích/i.test(title);
      if (!own && !combined) continue;
      const status = text.slice(1, 6).find((x) => /^(Platné|Zrušeno|Neplatné)/i.test(x)) ?? "";
      if (!/^Platné/i.test(status) || out.some((o) => o.id === id)) continue;
      const dates = text.slice(1, 6).filter((x) => /^\d{2}\.\d{2}\.\d{4}$/.test(x));
      out.push({
        id,
        title,
        validFrom: dates[1] ? isoOf(dates[1]) : dates[0] ? isoOf(dates[0]) : undefined,
        amends: /kterou se mění|mění a doplňuje/i.test(title),
        combined: !own,
      });
    }
    if (!html.includes(`?page=${page + 1}`)) {
      // Samostatná vyhláška má přednost před společnou; pak nejnovější účinnost
      return out.sort(
        (x, y) => Number(x.combined) - Number(y.combined) || Number(x.amends) - Number(y.amends) || (y.validFrom ?? "").localeCompare(x.validFrom ?? ""),
      );
    }
  }
  return undefined;
}

/** Text vyhlášky (DOCX nebo PDF s textovou vrstvou); sken vrátí "". */
async function ordinanceText(id: string): Promise<string> {
  const res = await get(`${SPP}/detail/${id}/text`);
  if (!res?.ok) return "";
  const type = res.headers.get("content-type") ?? "";
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    if (type.includes("wordprocessingml")) {
      const mammoth = await import("mammoth");
      return (await mammoth.extractRawText({ buffer: buf })).value;
    }
    if (type.includes("pdf")) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      return text;
    }
  } catch {
    // poškozený nebo nečitelný soubor
  }
  return "";
}

/** Sazba z textu vyhlášky (vzor MV: „Sazba poplatku činí 50 Kč za každý započatý den pobytu“). */
export function rateFromText(text: string): number | null {
  const t = text.replace(/\s+/g, " ");
  // „… 50 Kč za každý započatý den pobytu“ — formulace jen u poplatku z pobytu,
  // takže funguje i ve společné vyhlášce o více poplatcích
  const m =
    /(\d{1,3})(?:\s*,\s*-+|,00|\.-)?\s*Kč\s+za\s+(?:každý\s+)?započatý\s+den\s+pobytu/i.exec(t) ??
    /sazb\w*\s+poplatku\s+z\s+pobytu\s+(?:činí|je)[^0-9]{0,40}?(\d{1,3})(?:\s*,\s*-+|,00|\.-)?\s*Kč/i.exec(t);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 200 ? n : null;
}

/** Dohledá vyhlášku obce pro adresu ubytování. */
export async function lookupTaxSource(address: string): Promise<TaxSource> {
  const r = await lookup(address);
  return { ...r, address: address.trim() };
}

async function lookup(address: string): Promise<TaxSource> {
  const checkedAt = new Date().toISOString();
  if (address.trim().length < 3) return { status: "unknown", checkedAt };
  const place = await placeOf(address.trim());
  const town = place && (await findMunicipality(place));
  if (!town) return { status: "unknown", checkedAt };
  const base = { municipality: town.name, ico: town.ico, ovm: town.kod, checkedAt };
  const list = await findOrdinances(town.kod);
  if (list === undefined) return { status: "unknown", ...base };
  // Text čteme u nejvýš 4 vyhlášek; první přečtená sazba vyhrává. Společná
  // vyhláška bez zmínky o pobytu se poplatku z pobytu netýká.
  // Novela sazbu často mění slovy („21 Kč“ se nahrazuje „50 Kč“) — z novel ani
  // z novelizované vyhlášky sazbu nečteme, majitel ji ověří v odkazu.
  let shown: Ordinance | null = null;
  let rate: number | null = null;
  for (const o of list.filter((o) => !o.amends).slice(0, 3)) {
    const text = await ordinanceText(o.id);
    if (text && o.combined && !/z pobytu/i.test(text)) continue;
    shown = o;
    rate = text ? rateFromText(text) : null;
    break;
  }
  shown ??= list[0] ?? null;
  if (!shown) return { status: "none", ...base };
  const amended = list.some((o) => o.amends && (o.validFrom ?? "") > (shown!.validFrom ?? ""));
  if (amended || shown.amends) rate = null;
  return {
    status: "found",
    ...base,
    title: shown.title,
    url: `${SPP}/detail/${shown.id}/text`,
    validFrom: shown.validFrom,
    rate,
    ...(amended && { amended }),
  };
}

/**
 * Dohledá a uloží vyhlášku webu. Přečtenou sazbu nastaví rovnou, pokud majitel
 * žádnou nemá (0); jinou zadanou sazbu nepřepíše — jen ji ukáže k porovnání.
 */
export async function refreshTaxSource(siteId: string): Promise<TaxSource | null> {
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { arrivalAddress: true, touristTax: true, taxSource: true } });
  if (!site) return null;
  const found = await lookupTaxSource(site.arrivalAddress).catch(() => null);
  if (!found) return parseTaxSource(site.taxSource);
  const data: { taxSource: string; touristTax?: number } = { taxSource: JSON.stringify(found) };
  if (found.status === "found" && found.rate != null && site.touristTax === 0) data.touristTax = found.rate;
  await prisma.site.update({ where: { id: siteId }, data });
  return found;
}
