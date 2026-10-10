// Adresa webu (/w/[slug]) — tvar, rezervovaná slova a unikátnost.

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Adresy, které nejdou použít (kolize s aplikací nebo matoucí). */
const RESERVED = new Set(["admin", "api", "app", "demo", "login", "register", "onboarding", "nahled", "uklid", "tainy", "www", "w", "r"]);

/** Problém s adresou (hláška pro majitele), nebo null. */
export function slugProblem(slug: string): string | null {
  if (slug.length < 3) return "Adresa musí mít aspoň 3 znaky.";
  if (slug.length > 48) return "Adresa může mít nejvýš 48 znaků.";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return "Jen malá písmena bez diakritiky, číslice a pomlčky.";
  if (RESERVED.has(slug)) return "Tuhle adresu nejde použít — zvol jinou.";
  return null;
}
