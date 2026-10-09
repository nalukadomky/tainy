// Šablony e-mailů hostům: výchozí texty, nastavení majitele a vykreslení do HTML.
// Čisté funkce bez Resendu — stejný kód kreslí náhled v administraci
// (Nastavení → Automatizace) i e-mail, který opravdu odejde (lib/email.ts).
//
// Majitel u každého e-mailu upravuje jen předmět a úvodní text (s proměnnými).
// Důležité části — souhrn pobytu, platba, informace k příjezdu, kódy — doplní
// šablona sama, takže je nejde omylem smazat.

import { czk, plural } from "@/lib/pricing";
import { greetingName } from "@/lib/vocative";
import { vatNote } from "@/lib/vat";
import { parseRichText, type Inline } from "@/lib/richtext";
import { parseGeo } from "@/lib/location";

/* ---------- Druhy e-mailů a jejich nastavení ---------- */

export type EmailKind = "booking" | "paid" | "arrival" | "cancelled" | "thanks";
export type EmailGroup = "info" | "marketing";

export type EmailConfig = {
  enabled: boolean;
  subject: string;
  text: string;
  /** Časované e-maily: dní před příjezdem (arrival) / po odjezdu (thanks). */
  days: number;
  /** Poděkování: odkaz na recenzi (Google, Booking…), prázdné = bez odkazu. */
  reviewUrl: string;
  /** Poděkování: osobní jednorázová sleva na další pobyt. */
  discount: { enabled: boolean; percent: number; months: number };
};

export type EmailSettings = Record<EmailKind, EmailConfig> & {
  /** Vykání (true) nebo tykání (false) — výchozí texty i části, které doplní šablona. */
  formal: boolean;
  /** Upozornění majiteli na novou rezervaci. */
  ownerNotify: boolean;
};

export type EmailMeta = {
  kind: EmailKind;
  group: EmailGroup;
  title: string;
  /** Co šablona doplní sama (zobrazuje se u karty v nastavení). */
  includes: string;
  /** Časování: dny před příjezdem / po odjezdu. */
  timing?: "before" | "after";
  /** Nejde vypnout (host musí dostat platební údaje). */
  required?: boolean;
  subject: string;
  text: string;
  /** Výchozí předmět a text při vykání. */
  formal: { subject: string; text: string };
};

/** Hodina, kdy se odesílají časované e-maily (český čas). */
export const SCHEDULED_TIME = "10:00";

export const EMAIL_KINDS: EmailMeta[] = [
  {
    kind: "booking",
    group: "info",
    title: "Přijetí rezervace",
    includes: "Souhrn pobytu, údaje k platbě, dokdy termín držíme a odkaz na rezervaci",
    required: true,
    subject: "Rezervace {ubytování} — {příjezd}",
    text: "# Díky za rezervaci, {jméno}!\n\nMáš u nás rezervovaný pobyt v **{ubytování}**. Níže najdeš shrnutí a údaje k platbě.",
    formal: {
      subject: "Rezervace {ubytování} — {příjezd}",
      text: "# Děkujeme za rezervaci\n\nDobrý den, máte u nás rezervovaný pobyt v **{ubytování}**. Níže najdete shrnutí a údaje k platbě.",
    },
  },
  {
    kind: "paid",
    group: "info",
    title: "Platba přijata a pobyt potvrzen",
    includes: "Souhrn pobytu, časy příjezdu a odjezdu a odkaz na rezervaci",
    subject: "Pobyt potvrzen — {ubytování}, {příjezd}",
    text: "# Platba dorazila, {jméno}\n\nTvůj pobyt v **{ubytování}** je potvrzený. Pár dní před příjezdem ti pošleme vše, co budeš potřebovat k příjezdu.",
    formal: {
      subject: "Pobyt potvrzen — {ubytování}, {příjezd}",
      text: "# Platba dorazila\n\nDobrý den, váš pobyt v **{ubytování}** je potvrzený. Pár dní před příjezdem vám pošleme vše, co budete potřebovat k příjezdu.",
    },
  },
  {
    kind: "arrival",
    group: "info",
    title: "Před příjezdem",
    includes: "Adresa s odkazem na mapu, čas příjezdu, informace k příjezdu, Wi‑Fi, kódy k zámkům a kontakt",
    timing: "before",
    subject: "Už brzy u nás — informace k příjezdu",
    text: "# Za pár dní se vidíme, {jméno}!\n\nPosíláme vše, co budeš potřebovat k příjezdu do **{ubytování}**. Ubytovat se můžeš od {čas příjezdu}.",
    formal: {
      subject: "Už brzy u nás — informace k příjezdu",
      text: "# Za pár dní se uvidíme\n\nDobrý den, posíláme vše, co budete potřebovat k příjezdu do **{ubytování}**. Ubytovat se můžete od {čas příjezdu}.",
    },
  },
  {
    kind: "cancelled",
    group: "info",
    title: "Zrušení rezervace",
    includes: "Zrušený termín, storno podmínky a kontakt",
    subject: "Rezervace zrušena — {ubytování}, {příjezd}",
    text: "# Rezervace je zrušená\n\n{jméno}, tvoje rezervace v **{ubytování}** na termín {příjezd} – {odjezd} byla zrušena. Pokud jde o omyl nebo chceš vybrat jiný termín, stačí odpovědět na tenhle e-mail.",
    formal: {
      subject: "Rezervace zrušena — {ubytování}, {příjezd}",
      text: "# Rezervace je zrušená\n\nDobrý den, vaše rezervace v **{ubytování}** na termín {příjezd} – {odjezd} byla zrušena. Pokud jde o omyl nebo si chcete vybrat jiný termín, stačí odpovědět na tento e-mail.",
    },
  },
  {
    kind: "thanks",
    group: "marketing",
    title: "Poděkování po pobytu",
    includes: "Volitelně odkaz na recenzi a osobní slevový kód na další pobyt, odkaz na odhlášení",
    timing: "after",
    subject: "Díky za návštěvu, {jméno}",
    text: "# Děkujeme za návštěvu!\n\nDoufáme, že se ti pobyt v **{ubytování}** líbil. Budeme rádi, když se k nám zase vrátíš.",
    formal: {
      subject: "Děkujeme za návštěvu",
      text: "# Děkujeme za návštěvu!\n\nDoufáme, že se vám pobyt v **{ubytování}** líbil. Budeme rádi, když se k nám zase vrátíte.",
    },
  },
];

/** Výchozí předmět a text e-mailu pro tykání / vykání. */
export const defaultsOf = (m: EmailMeta, formal: boolean) => (formal ? m.formal : { subject: m.subject, text: m.text });

/**
 * Přepnutí tykání ↔ vykání: e-maily s výchozím textem dostanou výchozí text
 * v novém tónu, vlastní texty zůstanou (vrátí se, kolik jich je potřeba projít).
 */
export function switchTone(s: EmailSettings, formal: boolean): { settings: EmailSettings; custom: number } {
  const next = { ...s, formal };
  let custom = 0;
  for (const m of EMAIL_KINDS) {
    const from = defaultsOf(m, s.formal);
    const to = defaultsOf(m, formal);
    const cfg = s[m.kind];
    const subject = cfg.subject === from.subject ? to.subject : cfg.subject;
    const text = cfg.text === from.text ? to.text : cfg.text;
    if (cfg.subject !== from.subject || cfg.text !== from.text) custom++;
    next[m.kind] = { ...cfg, subject, text };
  }
  return { settings: next, custom };
}

export const emailMeta = (kind: EmailKind) => EMAIL_KINDS.find((m) => m.kind === kind)!;

const DEFAULT_DAYS: Partial<Record<EmailKind, number>> = { arrival: 2, thanks: 1 };
const DEFAULT_DISCOUNT = { enabled: true, percent: 10, months: 12 };

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const str = (v: unknown, max: number, fallback: string) => (typeof v === "string" ? v.slice(0, max) : fallback);

/** Odkaz na recenzi: jen http(s), jinak prázdné. */
const cleanUrl = (v: unknown) => {
  const s = typeof v === "string" ? v.trim().slice(0, 500) : "";
  return /^https?:\/\/\S+$/i.test(s) ? s : "";
};

/** Uložené nastavení (JSON) sloučené s výchozími hodnotami a očištěné. */
export function parseEmailSettings(raw: string | null | undefined): EmailSettings {
  let saved: Record<string, Record<string, unknown>> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") saved = parsed;
  } catch {
    // poškozený JSON = výchozí nastavení
  }
  const formal = (saved as Record<string, unknown>).formal === true;
  const out = { formal, ownerNotify: (saved as Record<string, unknown>).ownerNotify !== false } as EmailSettings;
  for (const m of EMAIL_KINDS) {
    const s = (saved[m.kind] ?? {}) as Record<string, unknown>;
    const d = (s.discount ?? {}) as Record<string, unknown>;
    out[m.kind] = {
      enabled: m.required ? true : typeof s.enabled === "boolean" ? s.enabled : true,
      subject: str(s.subject, 150, defaultsOf(m, formal).subject),
      text: str(s.text, 5000, defaultsOf(m, formal).text),
      days: clamp(s.days, 0, 30, DEFAULT_DAYS[m.kind] ?? 0),
      reviewUrl: cleanUrl(s.reviewUrl),
      discount: {
        enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_DISCOUNT.enabled,
        percent: clamp(d.percent, 1, 90, DEFAULT_DISCOUNT.percent),
        months: clamp(d.months, 1, 36, DEFAULT_DISCOUNT.months),
      },
    };
  }
  return out;
}

export const serializeEmailSettings = (s: EmailSettings) => JSON.stringify(s);

/** Dní před příjezdem, kdy odchází e-mail s informacemi k příjezdu (a kódem k zámku). */
export const arrivalDaysOf = (site: { emailSettings?: string } | null | undefined) =>
  parseEmailSettings(site?.emailSettings).arrival.days;

/* ---------- Kódy k zámkům ---------- */

export type Lock = { name: string; code: string };

export function parseLocks(raw: string | null | undefined): Lock[] {
  try {
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .map((l) => ({ name: str(l?.name, 40, "").trim(), code: str(l?.code, 40, "").trim() }))
      .filter((l) => l.name || l.code)
      .slice(0, 10);
  } catch {
    return [];
  }
}

/* ---------- Proměnné v textu ---------- */

export const EMAIL_VARS = [
  "jméno",
  "ubytování",
  "příjezd",
  "odjezd",
  "čas příjezdu",
  "čas odjezdu",
  "cena",
  "kód rezervace",
] as const;

const normVar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

function varValues(d: StayMail): Record<string, string> {
  const pairs: [string, string][] = [
    ["jméno", greetingName(d.firstName || d.guestName)],
    ["ubytování", d.siteName],
    ["příjezd", fmt(d.startDate)],
    ["odjezd", fmt(d.endDate)],
    ["čas příjezdu", d.checkInTime],
    ["čas odjezdu", d.checkOutTime],
    ["cena", czk(d.total)],
    ["kód rezervace", d.publicId],
  ];
  return Object.fromEntries(pairs.map(([k, v]) => [normVar(k), v]));
}

/** Doplní {proměnné}; neznámé nechá, jak jsou. */
export function fillVars(text: string, d: StayMail): string {
  const values = varValues(d);
  return text.replace(/\{([^{}]{1,30})\}/g, (m, name: string) => values[normVar(name)] ?? m);
}

/* ---------- Data rezervace pro e-mail ---------- */

export type StayMail = {
  publicId: string;
  siteName: string;
  guestName: string;
  /** Křestní jméno pro oslovení (u starších rezervací prázdné — vezme se z celého jména). */
  firstName?: string;
  email: string;
  phone: string;
  guests: number;
  /** Rozpis skladby, např. „2× dospělí · 1× pes". Prázdné = hosté se nedělí. */
  guestSummary: string;
  startDate: string;
  endDate: string;
  nights: number;
  total: number;
  /** Sleva z voucheru v Kč (0 = bez voucheru). */
  discount?: number;
  voucherCode?: string;
  /** DPH obsažené v ceně (vatRate 0 = ubytovatel není plátce). */
  vatRate?: number;
  vatAmount?: number;
  paid: boolean;
  /** Zaplaceno ukázkovou platbou — nesmí se splést se skutečnou. */
  demo: boolean;
  checkInTime: string;
  checkOutTime: string;
  /** Provozovatel a odkazy na obchodní podmínky / zásady (jen pokud je web má). */
  legal?: { provider: string; termsUrl?: string; privacyUrl?: string };
};

/** Údaje webu, ze kterých šablony berou kontakt, příjezd a podmínky. */
export type EmailSite = {
  name: string;
  contactEmail: string;
  contactPhone: string;
  cancellationPolicy: string;
  arrivalAddress: string;
  arrivalInfo: string;
  wifiName: string;
  wifiPassword: string;
  locks: string;
  emailSettings: string;
  /** Souřadnice (lib/location.ts) — ručně určený bod má v odkazu na mapu přednost před adresou. */
  geo?: string;
};

export type EmailExtras = {
  /** Odkaz na stránku rezervace. */
  link: string;
  /** Platba převodem (u nezaplacené rezervace s účtem). */
  payment?: { account: string; vs: string; amount: number } | null;
  /** Dokdy termín držíme (ISO). */
  holdUntil?: string | null;
  /** Kód k zámku zadaný u rezervace (má přednost před uloženými zámky). */
  accessCode?: string;
  /** Poděkování: vygenerovaný osobní kód a jeho platnost. */
  voucher?: { code: string; percent: number; validTo: string } | null;
  /** Komerční e-maily: odkaz na odhlášení. */
  unsubscribeUrl?: string;
};

/* ---------- HTML ---------- */

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function fmt(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  });

const P = "margin:0 0 16px;font-size:15px;line-height:1.6";
const MUTED = "color:#5a6557";
const BOX = "margin:16px 0;padding:14px 16px;border-radius:12px;background:#f6f3ec;font-size:14px;line-height:1.6";

export function layout(body: string, title?: string): string {
  return `<!doctype html><html lang="cs"><body style="margin:0;background:#f6f3ec;padding:24px;font-family:system-ui,-apple-system,sans-serif;color:#1e2a20">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e4ddcf;border-radius:16px;padding:28px">
    <p style="margin:0 0 20px;font-size:18px;font-weight:700;letter-spacing:-.01em">tainy</p>
    ${title ? `<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3">${title}</h1>` : ""}
    ${body}
  </div>
</body></html>`;
}

export function stayBlock(r: StayMail): string {
  const nights = r.nights;
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
    <tr><td style="padding:6px 0;${MUTED}">Termín</td><td style="padding:6px 0;text-align:right;font-weight:600">${fmt(r.startDate)} – ${fmt(r.endDate)}</td></tr>
    <tr><td style="padding:6px 0;${MUTED}">Délka</td><td style="padding:6px 0;text-align:right">${nights} ${plural(nights, "noc", "noci", "nocí")}</td></tr>
    <tr><td style="padding:6px 0;${MUTED}">Hosté</td><td style="padding:6px 0;text-align:right">${esc(r.guestSummary || String(r.guests))}</td></tr>
    ${r.discount ? `<tr><td style="padding:6px 0;${MUTED}">Sleva (voucher ${esc(r.voucherCode ?? "")})</td><td style="padding:6px 0;text-align:right;color:#2c5e3f">−${czk(r.discount)}</td></tr>` : ""}
    <tr><td style="padding:10px 0 0;border-top:1px solid #e4ddcf;font-weight:600">Celkem</td><td style="padding:10px 0 0;border-top:1px solid #e4ddcf;text-align:right;font-weight:700">${czk(r.total)}</td></tr>
    ${r.vatRate !== undefined ? `<tr><td colspan="2" style="padding:2px 0 0;text-align:right;font-size:12px;${MUTED}">${vatNote(r.vatRate, r.vatAmount ?? 0)}</td></tr>` : ""}
  </table>`;
}

export function legalBlock(legal: StayMail["legal"]): string {
  if (!legal) return "";
  const links = [
    legal.termsUrl && `<a href="${esc(legal.termsUrl)}" style="${MUTED}">Obchodní podmínky</a>`,
    legal.privacyUrl && `<a href="${esc(legal.privacyUrl)}" style="${MUTED}">Ochrana osobních údajů</a>`,
  ].filter(Boolean);
  if (!legal.provider && !links.length) return "";
  return `<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e4ddcf;font-size:12px;line-height:1.6;${MUTED}">
    ${legal.provider ? `Provozovatel: ${esc(legal.provider)}<br>` : ""}${links.join(" · ")}
  </p>`;
}

export const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#2c5e3f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:15px">${label}</a>`;

/** Text majitele (náš rich text) → HTML s inline styly; proměnné se doplní v každém kousku textu. */
function richHtml(src: string, d: StayMail): string {
  const inline = (content: Inline[]) =>
    content
      .map((c) => {
        let h = esc(fillVars(c.text, d)).replace(/\n/g, "<br>");
        if (c.italic) h = `<em>${h}</em>`;
        if (c.bold) h = `<strong>${h}</strong>`;
        return h;
      })
      .join("");
  return parseRichText(src)
    .map((b) => {
      if (b.type === "h1")
        return `<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3">${inline(b.content)}</h1>`;
      if (b.type === "h2")
        return `<h2 style="margin:20px 0 8px;font-size:16px;line-height:1.4">${inline(b.content)}</h2>`;
      if (!("items" in b)) return `<p style="${P}">${inline(b.content)}</p>`;
      return `<${b.type} style="margin:0 0 16px;padding-left:22px;font-size:15px;line-height:1.6">${b.items
        .map((i) => `<li>${inline(i)}</li>`)
        .join("")}</${b.type}>`;
    })
    .join("");
}

/** Vybere tvar podle tónu: t("máš", "máte"). */
type Tone = (ty: string, vy: string) => string;

function contactLine(site: EmailSite): string {
  const parts = [
    site.contactPhone &&
      `<a href="tel:${esc(site.contactPhone.replace(/\s/g, ""))}" style="color:#2c5e3f">${esc(site.contactPhone)}</a>`,
    site.contactEmail &&
      `<a href="mailto:${esc(site.contactEmail)}" style="color:#2c5e3f">${esc(site.contactEmail)}</a>`,
  ].filter(Boolean);
  return parts.length ? `<p style="margin:16px 0 0;font-size:14px;${MUTED}">Kontakt: ${parts.join(" · ")}</p>` : "";
}

function paymentBlock(d: StayMail, x: EmailExtras, t: Tone): string {
  if (d.demo)
    return `<p style="${P}"><strong>Ukázková platba</strong> — žádné peníze se nestrhly, rezervace slouží k vyzkoušení systému.</p>`;
  if (d.paid) return `<p style="${P}">Platba je zaznamenaná, nic dalšího řešit ${t("nemusíš", "nemusíte")}.</p>`;
  const until = x.holdUntil ? ` do <strong>${fmtDateTime(x.holdUntil)}</strong>` : "";
  if (!x.payment)
    return `<p style="${P}">Termín ${t("ti", "vám")} držíme${until}. O platbě se domluvíme — podrobnosti ${t("najdeš", "najdete")} na stránce rezervace.</p>`;
  return `<div style="${BOX}">
    <strong>Platba převodem</strong>${until ? ` — prosíme${until}` : ""}<br>
    Účet: <strong>${esc(x.payment.account)}</strong><br>
    Částka: <strong>${czk(x.payment.amount)}</strong><br>
    Variabilní symbol: <strong>${esc(x.payment.vs)}</strong><br>
    <span style="${MUTED}">QR kód pro platbu z mobilu ${t("najdeš", "najdete")} na stránce rezervace.</span>
  </div>`;
}

function arrivalBlock(d: StayMail, site: EmailSite, x: EmailExtras, t: Tone): string {
  const rows: string[] = [];
  if (site.arrivalAddress.trim()) {
    const g = parseGeo(site.geo);
    const map =
      g.manual && g.exact
        ? `https://maps.google.com/?q=${g.exact.lat},${g.exact.lng}`
        : `https://maps.google.com/?q=${encodeURIComponent(site.arrivalAddress.trim())}`;
    rows.push(
      `<strong>Adresa:</strong> ${esc(site.arrivalAddress.trim())} · <a href="${esc(map)}" style="color:#2c5e3f">otevřít mapu</a>`,
    );
  }
  rows.push(
    `<strong>Příjezd:</strong> ${fmt(d.startDate)} od ${esc(d.checkInTime)} · <strong>odjezd:</strong> ${fmt(d.endDate)} do ${esc(d.checkOutTime)}`,
  );
  const locks = parseLocks(site.locks);
  if (x.accessCode)
    rows.push(
      `<strong>Kód k zámku:</strong> <span style="font-size:17px;letter-spacing:.08em"><strong>${esc(x.accessCode)}</strong></span>`,
    );
  else
    for (const l of locks)
      rows.push(
        `<strong>${esc(l.name || "Kód")}:</strong> <span style="font-size:17px;letter-spacing:.08em"><strong>${esc(l.code)}</strong></span>`,
      );
  if (site.wifiName.trim() || site.wifiPassword.trim())
    rows.push(
      `<strong>Wi‑Fi:</strong> ${esc(site.wifiName.trim())}${site.wifiPassword.trim() ? ` · heslo <strong>${esc(site.wifiPassword.trim())}</strong>` : ""}`,
    );
  const info = site.arrivalInfo.trim()
    ? `<h2 style="margin:20px 0 8px;font-size:16px;line-height:1.4">Jak se k nám ${t("dostaneš", "dostanete")}</h2>${richHtml(site.arrivalInfo, d)}`
    : "";
  return `<div style="${BOX}">${rows.join("<br>")}</div>${info}`;
}

function thanksBlock(cfg: EmailConfig, x: EmailExtras, t: Tone): string {
  const parts: string[] = [];
  if (cfg.discount.enabled && x.voucher)
    parts.push(`<div style="${BOX};text-align:center">
      Na příští pobyt ${t("máš", "máte")} od nás slevu <strong>${x.voucher.percent} %</strong>.<br>
      <span style="display:inline-block;margin:10px 0 6px;padding:8px 16px;border:2px dashed #2c5e3f;border-radius:10px;font-size:20px;font-weight:700;letter-spacing:.08em;color:#2c5e3f">${esc(x.voucher.code)}</span><br>
      <span style="${MUTED};font-size:13px">${t("Zadej", "Zadejte")} ho při rezervaci na našem webu. Platí do ${fmt(x.voucher.validTo)}, jednou.</span>
    </div>`);
  if (cfg.reviewUrl)
    parts.push(
      `<p style="${P}">Pomůže nám, když o pobytu ${t("napíšeš", "napíšete")} pár slov:</p><p style="margin:0 0 16px">${button(cfg.reviewUrl, "Napsat recenzi")}</p>`,
    );
  return parts.join("");
}

/** Vykreslí e-mail daného druhu podle nastavení webu. */
export function renderEmail(
  kind: EmailKind,
  site: EmailSite,
  d: StayMail,
  x: EmailExtras,
): { subject: string; html: string } {
  const settings = parseEmailSettings(site.emailSettings);
  const cfg = settings[kind];
  const t: Tone = (ty, vy) => (settings.formal ? vy : ty);
  const meta = emailMeta(kind);
  const intro = richHtml(cfg.text, d);
  const code = `<p style="margin:20px 0 0;font-size:13px;${MUTED}">Kód rezervace: <strong>${esc(d.publicId)}</strong></p>`;
  let body = "";
  if (kind === "booking")
    body = `${stayBlock(d)}${paymentBlock(d, x, t)}<p style="margin:0 0 20px;font-size:14px;${MUTED}">Příjezd od ${esc(d.checkInTime)}, odjezd do ${esc(d.checkOutTime)}.</p>${button(x.link, "Zobrazit rezervaci")}${code}`;
  else if (kind === "paid")
    body = `${stayBlock(d)}<p style="margin:0 0 20px;font-size:14px;${MUTED}">Příjezd od ${esc(d.checkInTime)}, odjezd do ${esc(d.checkOutTime)}.</p>${button(x.link, "Zobrazit rezervaci")}${code}`;
  else if (kind === "arrival")
    body = `${arrivalBlock(d, site, x, t)}${contactLine(site)}<p style="margin:20px 0 0">${button(x.link, "Zobrazit rezervaci")}</p>`;
  else if (kind === "cancelled")
    body = `<div style="${BOX}"><strong>Zrušený termín:</strong> <s>${fmt(d.startDate)} – ${fmt(d.endDate)}</s></div>${
      site.cancellationPolicy.trim()
        ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;${MUTED}"><strong>Storno podmínky:</strong> ${esc(site.cancellationPolicy.trim())}</p>`
        : ""
    }${contactLine(site)}${code}`;
  else body = `${thanksBlock(cfg, x, t)}${contactLine(site)}`;

  const unsubscribe =
    meta.group === "marketing"
      ? `<p style="margin:16px 0 0;font-size:12px;${MUTED}">${t("Tenhle e-mail ti posíláme, protože máš", "Tento e-mail vám posíláme, protože máte")} u nás za sebou pobyt. <a href="${esc(
          x.unsubscribeUrl || "#",
        )}" style="${MUTED}">Odhlásit se</a> z dalších nabídek.</p>`
      : "";

  return {
    subject: fillVars(cfg.subject, d),
    html: layout(`${intro}${body}${legalBlock(d.legal)}${unsubscribe}`),
  };
}
