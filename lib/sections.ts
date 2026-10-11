// Pořadí sekcí webu: Úvod je vždy nahoře a Patička dole, mezi nimi jde
// šest bloků přeskládat. Ukládá se jako klíče oddělené čárkou.

export const MOVABLE_SECTIONS = ["galerie", "o-miste", "o-nas", "recenze", "rezervace", "poloha"] as const;
export type MovableSection = (typeof MOVABLE_SECTIONS)[number];

export const isMovable = (key: string): key is MovableSection => (MOVABLE_SECTIONS as readonly string[]).includes(key);

/** Uložené pořadí → úplný seznam (neznámé a duplicitní klíče pryč, chybějící na výchozí místo). */
export function parseSectionOrder(raw: string | null | undefined): MovableSection[] {
  const seen = new Set<MovableSection>();
  for (const k of (raw ?? "").split(",")) {
    const key = k.trim();
    if (isMovable(key)) seen.add(key);
  }
  const order = [...seen];
  MOVABLE_SECTIONS.forEach((key, i) => {
    if (seen.has(key)) return;
    // Za sekci, která je ve výchozím pořadí před ní (jinak na začátek)
    const prev = MOVABLE_SECTIONS.slice(0, i).reverse().find((p) => order.includes(p));
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, key);
  });
  return order;
}

export const serializeSectionOrder = (order: MovableSection[]) =>
  order.join(",") === MOVABLE_SECTIONS.join(",") ? "" : order.join(",");

/**
 * Posune sekci o jedno místo mezi viditelnými sekcemi (vypnuté přeskočí,
 * ty si drží svoje místo). Vrací null, když už posunout nejde.
 */
export function moveSection(order: MovableSection[], key: MovableSection, by: -1 | 1, hidden: MovableSection[] = []) {
  const i = order.indexOf(key);
  let j = i + by;
  while (j >= 0 && j < order.length && hidden.includes(order[j])) j += by;
  if (i < 0 || j < 0 || j >= order.length) return null;
  const next = [...order];
  next.splice(i, 1);
  next.splice(j, 0, key);
  return next;
}

/** Blok, se kterým se sekce posouvá (Vybavení jde spolu s Popisem). */
export const blockOf = (key: string): MovableSection | null => (key === "vybaveni" ? "o-miste" : isMovable(key) ? key : null);

// Vlastní nadpisy sekcí (přepisují se přímo ve webu v editoru). Prázdný = výchozí.
export const SECTION_TITLES = {
  galerie: "Galerie",
  "o-miste": "O místě",
  kontakt: "Kontakt",
  vybaveni: "Vybavení",
  recenze: "Co říkají hosté",
  rezervace: "Rezervace",
  poloha: "Kde nás najdete",
} as const;
export type TitleKey = keyof typeof SECTION_TITLES;
export type SectionTitles = Partial<Record<TitleKey, string>>;

/** Bez ořezu mezer — při psaní se ukládá po každém písmenu. */
export function parseSectionTitles(raw: string | null | undefined): SectionTitles {
  try {
    const obj = raw ? JSON.parse(raw) : {};
    const out: SectionTitles = {};
    for (const key of Object.keys(SECTION_TITLES) as TitleKey[]) {
      if (typeof obj?.[key] === "string" && obj[key]) out[key] = obj[key].slice(0, 80);
    }
    return out;
  } catch {
    return {};
  }
}

export const serializeSectionTitles = (t: SectionTitles) => {
  const clean = parseSectionTitles(JSON.stringify(t));
  return Object.keys(clean).length ? JSON.stringify(clean) : "";
};

/** Nadpis sekce na webu: vlastní, nebo výchozí. */
export const sectionTitle = (t: SectionTitles | undefined, key: TitleKey) => t?.[key]?.trim() || SECTION_TITLES[key];
