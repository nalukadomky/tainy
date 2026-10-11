// Primární barva webu (tlačítka, výběr v kalendáři, odkazy, ikony). Majitel
// vybere předvolbu nebo vlastní barvu (#rrggbb). Čitelnost hlídáme sami:
// barva musí mít s bílým písmem kontrast aspoň 4,5 : 1 (WCAG AA) — příliš
// světlou ztmavíme na nejbližší čitelný odstín. Stejně dobře se pak čte
// i jako text na krémovém pozadí webu.

export type ThemeKey = "pine" | "jehlici" | "mech" | "noc" | "boruvka" | "svestka" | "vino" | "terakota" | "hlina" | "grafit";

export const THEMES: { key: ThemeKey; label: string; hex: string }[] = [
  { key: "pine", label: "Les", hex: "#2c5e3f" },
  { key: "jehlici", label: "Jehličí", hex: "#1f5a56" },
  { key: "mech", label: "Mech", hex: "#4c5d22" },
  { key: "noc", label: "Noc", hex: "#1f3c64" },
  { key: "boruvka", label: "Borůvka", hex: "#3b3f8f" },
  { key: "svestka", label: "Švestka", hex: "#5e2b55" },
  { key: "vino", label: "Víno", hex: "#7a2232" },
  { key: "terakota", label: "Terakota", hex: "#9c3d1f" },
  { key: "hlina", label: "Hlína", hex: "#6e4a2c" },
  { key: "grafit", label: "Grafit", hex: "#2f343b" },
];

export const MIN_CONTRAST = 4.5;

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/** „#abc“ / „AABBCC“ → „#aabbcc“, jinak null. */
export function normalizeHex(v: string): string | null {
  const m = v.trim().match(HEX);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrast bílého písma na dané barvě (1–21). */
export const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

/** Nejbližší čitelný odstín: příliš světlou barvu postupně ztmaví (zachová tón). */
export function readable(hex: string): string {
  let c = rgb(hex);
  for (let i = 0; i < 40 && contrastWithWhite(toHex(c)) < MIN_CONTRAST; i++) c = c.map((v) => v * 0.94);
  return toHex(c);
}

/** Uložená hodnota: klíč předvolby, nebo čitelná vlastní barva „#rrggbb“. */
export function cleanTheme(v: unknown): string {
  if (THEMES.some((t) => t.key === v)) return v as string;
  const hex = typeof v === "string" ? normalizeHex(v) : null;
  return hex ? readable(hex) : "pine";
}

export function themeHex(value: string | undefined): string {
  const preset = THEMES.find((t) => t.key === value);
  if (preset) return preset.hex;
  const hex = value ? normalizeHex(value) : null;
  return hex ? readable(hex) : THEMES[0].hex;
}

// Tón podkladu: jemné pozadí sekcí, krémové plochy, linky a obsazené dny
// v kalendáři. Béžová ladí k zelené, k modré se hodí spíš modravá nebo šedá —
// výchozí „Automaticky“ proto vybere tón podle hlavní barvy.

export type ToneKey = "bezova" | "pisek" | "sed" | "bila" | "modra" | "salvej" | "pudr";

/** ink/soft = barva písma; jen u neutrálních tónů (jinak zůstává lesní nádech z globals.css). */
export const TONES: { key: ToneKey; label: string; bg: string; cream: string; line: string; booked: string; ink?: string; soft?: string }[] = [
  { key: "bezova", label: "Béžová", bg: "#f6f3ec", cream: "#fdfbf6", line: "#e4ddcf", booked: "#ddd3c1" },
  { key: "pisek", label: "Písková", bg: "#f7f2e6", cream: "#fdfaf2", line: "#e8dcc2", booked: "#e0d0b0" },
  { key: "sed", label: "Šedá", bg: "#f3f3f1", cream: "#fbfbfa", line: "#e2e2de", booked: "#d8d8d3", ink: "#1f2124", soft: "#5d6166" },
  // Černobílá varianta: bílé plochy, sekce oddělené jen nádechem šedé
  { key: "bila", label: "Bílá", bg: "#f7f7f7", cream: "#ffffff", line: "#e5e5e5", booked: "#dadada", ink: "#1a1a1a", soft: "#5c5c5c" },
  { key: "modra", label: "Modravá", bg: "#f1f4f8", cream: "#fafbfd", line: "#dde3ec", booked: "#d1d9e5" },
  { key: "salvej", label: "Šalvěj", bg: "#f1f4ef", cream: "#fafbf8", line: "#dde4d7", booked: "#d0dbc9" },
  { key: "pudr", label: "Pudrová", bg: "#f8f2f1", cream: "#fdfafa", line: "#ebdcdb", booked: "#e3cfce" },
];

/** Uložená hodnota: klíč tónu, nebo "" = automaticky podle hlavní barvy. */
export const cleanTone = (v: unknown): string => (TONES.some((t) => t.key === v) ? (v as string) : "");

const AUTO_TONE: Record<ThemeKey, ToneKey> = {
  pine: "bezova",
  jehlici: "salvej",
  mech: "pisek",
  noc: "modra",
  boruvka: "modra",
  svestka: "pudr",
  vino: "pudr",
  terakota: "pisek",
  hlina: "bezova",
  grafit: "sed",
};

/** Tón, který ladí k hlavní barvě (předvolba podle tabulky, vlastní barva podle odstínu). */
export function autoTone(theme: string | undefined): ToneKey {
  const preset = THEMES.find((t) => t.key === theme);
  if (preset) return AUTO_TONE[preset.key];
  const [r, g, b] = rgb(themeHex(theme)).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d / (max || 1) < 0.2) return "sed";
  const hue = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  const h = (hue + 360) % 360;
  if (h < 20 || h >= 290) return "pudr";
  if (h < 50) return "pisek";
  if (h < 80) return "bezova";
  if (h < 175) return "salvej";
  return "modra";
}

/** Tón webu: zvolený, nebo automaticky podle hlavní barvy. */
export const toneOf = (theme: string | undefined, tone: string | undefined) =>
  TONES.find((t) => t.key === (cleanTone(tone) || autoTone(theme)))!;

/** CSS proměnné, které přebarví celý web (Tailwind `pine` = var(--pine), `bg`, `cream`, `line`). */
export function themeVars(value: string | undefined, tone?: string): Record<string, string> {
  const hex = themeHex(value);
  const t = toneOf(value, tone);
  return {
    "--pine": hex,
    "--pine-dark": `color-mix(in srgb, ${hex} 80%, #000)`,
    "--bg": t.bg,
    "--cream": t.cream,
    "--line": t.line,
    "--booked": t.booked,
    ...(t.ink && { "--ink": t.ink }),
    ...(t.soft && { "--soft": t.soft }),
  };
}
