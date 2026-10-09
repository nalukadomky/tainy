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

/** CSS proměnné, které přebarví celý web (Tailwind `pine` = var(--pine)). */
export function themeVars(value: string | undefined): Record<string, string> {
  const hex = themeHex(value);
  return { "--pine": hex, "--pine-dark": `color-mix(in srgb, ${hex} 80%, #000)` };
}
