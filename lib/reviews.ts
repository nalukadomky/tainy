// Sekce Recenze: recenze hostů, které majitel vloží (z Googlu, Bookingu, e-mailů…).

export type Review = {
  id: string;
  name: string;
  text: string;
  /** Hodnocení 1–5 hvězdiček, 0 = nezobrazovat. */
  rating: number;
  /** Doplněk pod jménem, např. „Srpen 2026 · Booking.com“. */
  meta: string;
  /** Fotka hosta (nebo z pobytu), prázdné = iniciála. */
  photo: string;
  /** Odkaz na původní recenzi (Google, Booking…), prázdné = bez odkazu. */
  link: string;
};

export const MAX_REVIEWS = 12;

export const REVIEW_LAYOUTS = [
  { key: "grid", label: "Mřížka", hint: "Všechny karty pod sebou" },
  { key: "slider", label: "Posuvník", hint: "Karty v řadě, posouvání do stran" },
] as const;
export type ReviewsLayout = (typeof REVIEW_LAYOUTS)[number]["key"];
export const cleanReviewsLayout = (v: unknown): ReviewsLayout => (v === "slider" ? "slider" : "grid");

// Bez ořezu mezer — při psaní se hodnota ukládá po každém písmenu
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function parseReviews(raw: string | null | undefined): Review[] {
  try {
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list.slice(0, MAX_REVIEWS).map((r, i) => ({
      id: str(r?.id, 40) || `r${i}-${Date.now().toString(36)}`,
      name: str(r?.name, 60),
      text: typeof r?.text === "string" ? r.text.slice(0, 1200) : "",
      rating: Math.max(0, Math.min(5, Math.round(Number(r?.rating) || 0))),
      meta: str(r?.meta, 80),
      photo: str(r?.photo, 600),
      link: cleanLink(r?.link),
    }));
  } catch {
    return [];
  }
}

// Odkaz se ukládá i rozepsaný (po každém písmenu) — kontroluje se až při
// vykreslení na webu (reviewSource vrátí null pro cokoli jiného než http/https).
const cleanLink = (v: unknown) => (typeof v === "string" ? v.slice(0, 600) : "");

/** Odkud recenze je (podle odkazu) — pro popisek a ikonu na kartě. */
export function reviewSource(link: string): "google" | "booking" | "airbnb" | "other" | null {
  let host: string;
  try {
    const url = new URL(link.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    host = url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  if (/(^|\.)google\.[a-z.]+$/.test(host) || host === "goo.gl" || host.endsWith(".goo.gl") || host === "g.page") return "google";
  if (host.endsWith("booking.com")) return "booking";
  if (/(^|\.)airbnb\.[a-z.]+$/.test(host)) return "airbnb";
  return "other";
}

export const serializeReviews = (list: Review[]) => (list.length ? JSON.stringify(list) : "");

export const newReview = (): Review => ({
  id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  name: "",
  text: "",
  rating: 5,
  meta: "",
  photo: "",
  link: "",
});

/** Ukázkové recenze — v úpravách webu, dokud majitel nevloží vlastní. */
export const SAMPLE_REVIEWS: Review[] = [
  {
    id: "s1",
    name: "Tereza a Martin",
    text: "Nádherné místo s výhledem do lesa. Ráno káva na terase, večer sauna — přesně to, co jsme potřebovali. Určitě se vrátíme!",
    rating: 5,
    meta: "Září 2026",
    photo: "",
    link: "",
  },
  {
    id: "s2",
    name: "Rodina Novákových",
    text: "Děti byly nadšené z houpací sítě a ohniště. Chata je čistá, útulná a vybavená do posledního detailu.",
    rating: 5,
    meta: "Srpen 2026",
    photo: "",
    link: "",
  },
  {
    id: "s3",
    name: "Petr",
    text: "Skvělá komunikace s hostiteli a krásné okolí na výlety. Klid, ticho a hvězdy nad hlavou.",
    rating: 5,
    meta: "Červenec 2026",
    photo: "",
    link: "",
  },
];
