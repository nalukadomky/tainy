// Provozovatel webu, obchodní podmínky a zásady ochrany osobních údajů.

import { activeCategories, parseCategories } from "@/lib/guests";
import { vatRateOf } from "@/lib/vat";

export type LegalKind = "terms" | "privacy";

export const LEGAL_TITLE: Record<LegalKind, string> = {
  terms: "Obchodní podmínky",
  privacy: "Ochrana osobních údajů",
};

/** Adresa stránky dokumentu na veřejném webu. */
export const LEGAL_PATH: Record<LegalKind, string> = {
  terms: "podminky",
  privacy: "ochrana-udaju",
};

export type LegalSource = {
  name?: string;
  termsText?: string;
  termsPdf?: string;
  privacyText?: string;
  privacyPdf?: string;
  businessName?: string;
  businessId?: string;
  vatId?: string;
  businessAddress?: string;
  businessRegister?: string;
  contactEmail?: string;
  contactPhone?: string;
  // Pro výchozí obchodní podmínky (pravidla pobytu z nastavení webu)
  checkInTime?: string;
  checkOutTime?: string;
  maxGuests?: number;
  minNights?: number;
  cleaningFee?: number;
  touristTax?: number;
  cancellationPolicy?: string;
  bankAccount?: string;
  guestMode?: string;
  guestCategories?: string;
  pricingMode?: string;
  vatPayer?: boolean;
  vatRate?: number;
};

/** Výchozí obchodní podmínky z údajů provozovatele a pravidel pobytu (prázdné bez provozovatele). */
export function defaultTermsText(site: LegalSource): string {
  return hasProvider(site) ? termsTemplate(site) : "";
}

/** Text obchodních podmínek, který platí: vlastní znění majitele, jinak výchozí. */
export function termsTextOf(site: LegalSource): string {
  return site.termsText?.trim() ? site.termsText : defaultTermsText(site);
}

/** Krátký otisk textu — verze výchozích podmínek, se kterou host souhlasil. */
export function textFingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** Zásady ochrany údajů platí i bez úprav: z údajů provozovatele se vygeneruje výchozí znění. */
export function hasProvider(site: LegalSource): boolean {
  return !!(site.businessName?.trim() || site.businessId?.trim());
}

/** Výchozí zásady z údajů provozovatele (prázdné, dokud provozovatel není vyplněný). */
export function defaultPrivacyText(site: LegalSource): string {
  if (!hasProvider(site)) return "";
  return privacyTemplate(
    {
      businessName: site.businessName ?? "",
      businessId: site.businessId ?? "",
      vatId: site.vatId ?? "",
      businessAddress: site.businessAddress ?? "",
      businessRegister: site.businessRegister ?? "",
      contactEmail: site.contactEmail,
      contactPhone: site.contactPhone,
    },
    site.name ?? ""
  );
}

/** Text zásad, který se hostům ukáže: vlastní znění majitele, jinak výchozí. */
export function privacyTextOf(site: LegalSource): string {
  return site.privacyText?.trim() ? site.privacyText : defaultPrivacyText(site);
}

export function hasDoc(site: LegalSource, kind: LegalKind): boolean {
  return kind === "terms"
    ? !!(site.termsPdf || termsTextOf(site).trim())
    : !!(site.privacyPdf || privacyTextOf(site).trim());
}

/** IČ: 8 číslic s kontrolní číslicí (vážený součet mod 11). Kratší IČ se doplní nulami zleva. */
export function normalizeIco(value: string): string {
  const digits = value.replace(/\s/g, "");
  return /^\d{1,8}$/.test(digits) ? digits.padStart(8, "0") : digits;
}

export function isValidIco(value: string): boolean {
  const ico = normalizeIco(value);
  if (!/^\d{8}$/.test(ico)) return false;
  const sum = [...ico.slice(0, 7)].reduce((s, d, i) => s + Number(d) * (8 - i), 0);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(ico[7]);
}

/** DIČ: „CZ" + 8–10 číslic (mezery se ignorují, malá písmena se zvětší). */
export function normalizeVatId(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

export function isValidVatId(value: string): boolean {
  return /^CZ\d{8,10}$/.test(normalizeVatId(value));
}

export type Provider = {
  businessName: string;
  businessId: string;
  vatId: string;
  businessAddress: string;
  businessRegister: string;
  contactEmail?: string;
  contactPhone?: string;
};

/** Jeden řádek s identifikací provozovatele („Jan Novák · IČ 123… · Praha"). */
export function providerLine(p: Pick<Provider, "businessName" | "businessId" | "vatId" | "businessAddress">): string {
  return [p.businessName, p.businessId && `IČ ${p.businessId}`, p.vatId && `DIČ ${p.vatId}`, p.businessAddress]
    .filter(Boolean)
    .join(" · ");
}

/** Výchozí znění zásad ochrany osobních údajů pro ubytování. */
export function privacyTemplate(p: Provider, propertyName: string): string {
  const missing = (what: string) => `[doplň ${what}]`;
  const place = propertyName || "naše ubytování";
  const contact = [p.contactEmail, p.contactPhone].filter(Boolean).join(", ") || missing("e-mail nebo telefon");
  const controller = [
    `- **Správce:** ${p.businessName || missing("jméno nebo firmu")}`,
    `- **IČ:** ${p.businessId || missing("IČ")}`,
    p.vatId && `- **DIČ:** ${p.vatId}`,
    `- **Sídlo:** ${p.businessAddress || missing("adresu sídla")}`,
    p.businessRegister && `- **Zápis:** ${p.businessRegister}`,
    `- **Kontakt:** ${contact}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `# Zásady ochrany osobních údajů

Jak v ubytování **${place}** zacházíme s osobními údaji hostů. Údaje zpracováváme jen v rozsahu, který potřebujeme, a chráníme je.

## 1. Kdo je správce údajů

${controller}

## 2. Jaké údaje zpracováváme

- **Kontaktní údaje** — jméno a příjmení, e-mail, telefon
- **Údaje o pobytu** — termín, počet hostů, poznámka k rezervaci
- **Platební údaje** — výše a stav platby (čísla platebních karet neukládáme)
- **Údaje pro úřady** — údaje do evidence ubytovaných a pro místní poplatek z pobytu, jen v rozsahu, který ukládá zákon

## 3. Proč údaje zpracováváme

- **Vyřízení rezervace a pobytu** — plnění smlouvy (čl. 6 odst. 1 písm. b) GDPR)
- **Zákonné povinnosti** — evidence ubytovaných, místní poplatek, účetnictví (čl. 6 odst. 1 písm. c) GDPR)
- **Ochrana našich práv** — např. při řešení škody nebo sporu, oprávněný zájem (čl. 6 odst. 1 písm. f) GDPR)

K vyřízení rezervace váš souhlas nepotřebujeme. Údaje neprodáváme a nepoužíváme je k reklamě.

## 4. Jak dlouho údaje uchováváme

- **Údaje k rezervaci** — po dobu pobytu a 3 roky po něm (promlčecí lhůta)
- **Evidence ubytovaných a poplatky** — 6 let
- **Účetní doklady** — 10 let

Po uplynutí doby údaje smažeme.

## 5. Kdo k údajům má přístup

- provozovatel rezervačního systému a webu
- poskytovatel e-mailových služeb
- účetní, pokud ho využíváme
- personál pro úklid — jen nezbytné údaje o pobytu (termín, počet hostů)

## 6. Vaše práva

- **Přístup** — zjistit, jaké údaje o vás zpracováváme
- **Oprava** — opravit nepřesné údaje
- **Výmaz** — smazat údaje, které už nepotřebujeme
- **Omezení zpracování** — dočasně pozastavit zpracování
- **Přenositelnost** — získat údaje ve strojově čitelné podobě
- **Námitka** — proti zpracování z oprávněného zájmu
- **Stížnost** — u Úřadu pro ochranu osobních údajů (www.uoou.gov.cz)

## 7. Jak nás kontaktovat

Se žádostí nebo dotazem se obraťte na ${contact}. Odpovíme nejpozději do jednoho měsíce.
`;
}

const czk = (n: number) => `${n.toLocaleString("cs-CZ")} Kč`;

/** Výchozí obchodní (ubytovací) podmínky pro krátkodobý pronájem. */
export function termsTemplate(site: LegalSource): string {
  const missing = (what: string) => `[doplň ${what}]`;
  const place = site.name || "ubytování";
  const who = site.businessName || missing("jméno nebo firmu");
  const ids = [site.businessId && `IČ ${site.businessId}`, site.vatId && `DIČ ${site.vatId}`].filter(Boolean).join(", ");
  const address = site.businessAddress ? `, se sídlem ${site.businessAddress}` : "";
  const contact = [site.contactEmail, site.contactPhone].filter(Boolean).join(", ") || missing("e-mail nebo telefon");
  const checkIn = site.checkInTime || "15:00";
  const checkOut = site.checkOutTime || "10:00";
  const dog = activeCategories(site.guestMode ?? "", parseCategories(site.guestCategories ?? "", site.pricingMode)).find(
    (c) => c.key === "dog"
  );

  const fees = [
    site.cleaningFee ? `- **Úklid** — ${czk(site.cleaningFee)} za pobyt` : "",
    site.touristTax ? `- **Místní poplatek z pobytu** — ${czk(site.touristTax)} za osobu a noc (podle obecní vyhlášky)` : "",
  ].filter(Boolean);

  const cancellation = site.cancellationPolicy?.trim()
    ? site.cancellationPolicy.trim()
    : `- více než 30 dní před příjezdem — zdarma, vracíme celou zaplacenou částku
- 30 až 14 dní před příjezdem — storno poplatek 50 % ceny pobytu
- méně než 14 dní před příjezdem nebo nedostavení se — storno poplatek 100 % ceny pobytu`;

  return `# Obchodní podmínky

Ubytovací podmínky pro **${place}**. Rezervací pobytu s nimi host souhlasí.

## 1. Kdo ubytování poskytuje

Ubytování poskytuje **${who}**${ids ? `, ${ids}` : ""}${address} (dále jen „ubytovatel“). Kontakt: ${contact}.

Smlouva o ubytování se řídí § 2326 a násl. občanského zákoníku a těmito podmínkami.

## 2. Rezervace

- Pobyt si rezervujete přes tento web. Smlouva je uzavřena odesláním rezervace, potvrzení vám přijde na e-mail a najdete ho i na stránce rezervace.
- Uveďte prosím pravdivé a úplné údaje — podle nich vás kontaktujeme a evidujeme pobyt.${site.minNights && site.minNights > 1 ? `
- Minimální délka pobytu je ${site.minNights} ${site.minNights < 5 ? "noci" : "nocí"}.` : ""}

## 3. Cena a platba

Cena pobytu se zobrazí před odesláním rezervace a je konečná${
    vatRateOf(site) ? ` včetně DPH ${vatRateOf(site)} %` : " — ubytovatel není plátcem DPH"
  }.${fees.length ? ` Obsahuje:\n\n${fees.join("\n")}` : ""}

${site.bankAccount ? "Platí se převodem podle údajů a QR kódu na stránce rezervace. " : ""}Nezaplacená rezervace se po uplynutí lhůty uvedené v potvrzení automaticky zruší a termín se uvolní.

## 4. Zrušení pobytu

**Zrušení hostem:**

${cancellation}

Zrušení nám prosím pošlete e-mailem nebo zavolejte. Vrácenou část platby pošleme do 14 dní.

**Zrušení ubytovatelem:** Pokud bychom pobyt nemohli poskytnout (např. vyšší moc nebo havárie), vrátíme vám celou zaplacenou částku.

U ubytování na konkrétní termín nelze od smlouvy odstoupit do 14 dnů bez udání důvodu (§ 1837 písm. j) občanského zákoníku) — platí storno podmínky výše.

## 5. Příjezd a odjezd

- **Příjezd (check-in):** od ${checkIn}
- **Odjezd (check-out):** do ${checkOut}
- Při příjezdu předložte doklad totožnosti — ubytovatel musí ze zákona vést evidenci ubytovaných a vybírat místní poplatek.
- Jiný čas příjezdu nebo odjezdu je možný po předchozí domluvě.

## 6. Pravidla pobytu

- Ubytovat se může nejvýše **${site.maxGuests || missing("počet")} ${site.maxGuests === 1 ? "host" : site.maxGuests && site.maxGuests < 5 ? "hosté" : "hostů"}**, další osoby jen po domluvě.
- **Noční klid** platí od 22:00 do 6:00.
- **Kouření** je uvnitř objektu zakázané.
- ${dog ? "**Psi** jsou vítáni za poplatek uvedený v ceníku. Za psa odpovídá jeho majitel." : "**Domácí zvířata** jen po předchozí domluvě s ubytovatelem."}
- S vybavením zacházejte šetrně a při odjezdu nechte ubytování v běžném stavu.

## 7. Škody a odpovědnost

- Host odpovídá za škody, které během pobytu způsobí on nebo jeho spolubydlící; škodu nám prosím hned nahlaste.
- Za věci odložené mimo vyhrazená místa ubytovatel odpovídá jen v rozsahu stanoveném zákonem.
- Pokud host závažně porušuje tato pravidla, může ubytovatel pobyt předčasně ukončit bez nároku na vrácení ceny.

## 8. Reklamace a spory

- Vady ubytování nám prosím reklamujte hned během pobytu, abychom je mohli rychle odstranit. Reklamaci vyřídíme nejpozději do 30 dnů.
- Spotřebitel může spor řešit i mimosoudně u České obchodní inspekce (www.coi.cz).

## 9. Osobní údaje

S osobními údaji hostů zacházíme podle zásad ochrany osobních údajů zveřejněných na tomto webu.

## 10. Závěrečná ustanovení

Tyto podmínky platí ve znění zveřejněném v okamžiku rezervace. Vztahy jimi neupravené se řídí právem České republiky.
`;
}

/* ---- Změna provozovatele ve vlastních textech dokumentů ---- */

type ProviderFields = Pick<Provider, "businessName" | "businessId" | "vatId" | "businessAddress">;

// Místa ze vzorů, která čekají na doplnění
const PLACEHOLDERS: [keyof ProviderFields, string][] = [
  ["businessName", "[doplň jméno nebo firmu]"],
  ["businessId", "[doplň IČ]"],
  ["businessAddress", "[doplň adresu sídla]"],
];

/**
 * Nahradí v textu staré údaje provozovatele novými (a doplní „[doplň …]" ze vzorů).
 * Nahrazuje se přes dočasné značky od nejdelší hodnoty — IČ je obsažené v DIČ
 * („CZ06716610"), takže změna IČ nesmí omylem přepsat nezměněné DIČ.
 */
export function replaceProvider(text: string, before: ProviderFields, after: ProviderFields): string {
  const pairs: [string, string][] = [];
  for (const key of ["businessName", "businessId", "vatId", "businessAddress"] as const) {
    const from = before[key].trim();
    if (from) pairs.push([from, after[key].trim()]);
  }
  for (const [key, mark] of PLACEHOLDERS) if (after[key].trim()) pairs.push([mark, after[key].trim()]);
  pairs.sort((a, b) => b[0].length - a[0].length);

  let out = text;
  pairs.forEach(([from], i) => (out = out.split(from).join(`\u0002${i}\u0002`)));
  pairs.forEach(([, to], i) => (out = out.split(`\u0002${i}\u0002`).join(to)));
  return replaceProviderMentions(out, after);
}

/**
 * Údaje provozovatele podle jejich místa v textu (vzory podmínek a zásad) — opraví
 * i starší údaje, které už nejsou „předchozí hodnotou" (např. po dvou změnách IČ).
 */
function replaceProviderMentions(text: string, p: ProviderFields): string {
  const name = p.businessName.trim();
  const ico = p.businessId.trim();
  const dic = p.vatId.trim();
  const address = p.businessAddress.trim();
  // Náhrada přes funkci — hodnota s „$“ by se jinak vyložila jako odkaz na skupinu
  const keep = (value: string) => (_: string, before: string) => before + value;
  const wrap = (value: string) => (_: string, before: string, after: string) => before + value + after;
  let out = text;
  // „IČ“ nesmí být konec „DIČ“ — před ním nesmí stát písmeno (u = české znaky)
  if (ico) out = out.replace(/(?<!\p{L})(IČO?:?(?:\*\*)?:?\s*)\d{8}(?!\d)/gu, keep(ico));
  if (dic) out = out.replace(/(?<!\p{L})(DIČ:?(?:\*\*)?:?\s*)CZ\d{8,10}(?!\d)/gu, keep(dic));
  // Nový provozovatel bez DIČ — staré DIČ z textu pryč (řádek seznamu i zmínka ve větě)
  else out = out.replace(/^- \*\*DIČ:\*\*[^\n]*\n?/gmu, "").replace(/,\s*DIČ CZ\d{8,10}(?!\d)/gu, "");
  if (name) {
    out = out
      .replace(/((?:Správcem je|Ubytování poskytuje) \*\*)[^*\n]+(\*\*)/gu, wrap(name))
      .replace(/(\*\*Správce:\*\*\s*)[^\n]+/gu, keep(name));
  }
  if (address) {
    out = out
      .replace(/(se sídlem )[^\n]+?(?=\s\(dále|\. Kontakt|\.\s*$)/gmu, keep(address))
      .replace(/(\*\*Sídlo:\*\*\s*)[^\n]+/gu, keep(address));
  }
  return out;
}

/** Krajské soudy, které vedou obchodní (veřejný) rejstřík — kódy z ARES. */
const REGISTER_COURTS: Record<string, string> = {
  MSPH: "Městským soudem v Praze",
  KSCB: "Krajským soudem v Českých Budějovicích",
  KSPL: "Krajským soudem v Plzni",
  KSUL: "Krajským soudem v Ústí nad Labem",
  KSHK: "Krajským soudem v Hradci Králové",
  KSBR: "Krajským soudem v Brně",
  KSOS: "Krajským soudem v Ostravě",
};

/** „Zapsáno v obchodním rejstříku vedeném Městským soudem v Praze, oddíl B, vložka 1581“. */
export function registerEntry(z: { soud?: string; oddil?: string; vlozka?: number | string }): string {
  const court = REGISTER_COURTS[z.soud ?? ""] ?? (z.soud ? `soudem ${z.soud}` : "");
  const kind = ["A", "B", "C", "D", "E"].includes(z.oddil ?? "") ? "obchodním rejstříku" : "veřejném rejstříku";
  return [`Zapsáno v ${kind}${court ? ` vedeném ${court}` : ""}`, z.oddil && `oddíl ${z.oddil}`, z.vlozka && `vložka ${z.vlozka}`]
    .filter(Boolean)
    .join(", ");
}

export const SOLE_TRADER_REGISTER = "Fyzická osoba podnikající podle živnostenského zákona, nezapsaná v obchodním rejstříku";

/**
 * Údaj o zápisu pro web: vyplněný (z ARES nebo ručně), jinak u živnostníka
 * (jméno bez právní formy firmy) obvyklé znění; u firmy bez údaje nic.
 */
export function registerNote(p: { name: string; id: string; register?: string }): string {
  if (p.register?.trim()) return p.register.trim();
  if (!p.id) return "";
  const company = /\b(s\.\s?r\.\s?o|spol\.|a\.\s?s|v\.\s?o\.\s?s|k\.\s?s|z\.\s?s|o\.\s?p\.\s?s|z\.\s?ú|družstvo)\b\.?/i.test(p.name);
  return company ? "" : SOLE_TRADER_REGISTER;
}
