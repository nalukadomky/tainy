// Sekce „O nás“: šablony vzhledu a textové předlohy příběhu.

export type AboutLayout = "photo-left" | "photo-right" | "quote" | "text";

export const ABOUT_LAYOUTS: { key: AboutLayout; label: string; hint: string }[] = [
  { key: "photo-left", label: "Fotka a příběh", hint: "Fotka vlevo, text vpravo" },
  { key: "photo-right", label: "Příběh a fotka", hint: "Text vlevo, fotka vpravo" },
  { key: "quote", label: "Citát", hint: "Velký citát, fotka a podpis" },
  { key: "text", label: "Jen text", hint: "Vystředěný příběh bez fotky" },
];

export const cleanAboutLayout = (v: unknown): AboutLayout =>
  ABOUT_LAYOUTS.some((l) => l.key === v) ? (v as AboutLayout) : "photo-left";

/** Ukázkový obsah — náhledy šablon a úpravy webu, dokud majitel nenapíše vlastní příběh. */
export const ABOUT_SAMPLE = {
  title: "O nás",
  photo: "/demo/08-houpaci-sit.jpg",
  signature: "Jana a Petr, vaši hostitelé",
  text:
    "Chatu postavil už náš děda v roce 1974 a od té doby se sem každé léto vracíme. Známe tu každou cestu do lesa i místo, kde rostou nejlepší houby.\n\n" +
    "Dnes ji otevíráme i vám — aby si klid, vůni dřeva a večery u kamen užili i další. Staráme se o ni s láskou a těšíme se, až u nás budete jako doma.",
};

/** Tvar fotky v sekci (šablony s fotkou vedle textu). */
export type AboutPhotoShape = "auto" | "portrait" | "square" | "landscape";

export const ABOUT_PHOTO_SHAPES: { key: AboutPhotoShape; label: string; ratio: string }[] = [
  { key: "auto", label: "Podle textu", ratio: "" },
  { key: "portrait", label: "Na výšku", ratio: "4 / 5" },
  { key: "square", label: "Čtverec", ratio: "1 / 1" },
  { key: "landscape", label: "Na šířku", ratio: "4 / 3" },
];

export const cleanPhotoShape = (v: unknown): AboutPhotoShape =>
  ABOUT_PHOTO_SHAPES.some((s) => s.key === v) ? (v as AboutPhotoShape) : "auto";
