import "server-only";

// Import webu je zatím ve zkušebním provozu: ve vývoji pro každého, na
// produkci jen pro e-maily v IMPORT_BETA_EMAILS (oddělené čárkou).

export function importAllowed(email: string | null | undefined): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const list = (process.env.IMPORT_BETA_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}
