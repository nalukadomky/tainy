import "server-only";

// Import webu je veřejný. Vypnout jde bez nasazení kódu: IMPORT_DISABLED=1
// v proměnných prostředí (Vercel) ho schová všude a API ho odmítne.

export const importEnabled = () => !["1", "true"].includes((process.env.IMPORT_DISABLED ?? "").toLowerCase());

/** Ochrana proti nákladům: kolik skenů a vytvořených webů z importu za 24 h. */
export const IMPORT_LIMITS = {
  scansPerUserHour: 10,
  scansPerDay: 100,
  createsPerUserDay: 3,
  createsPerDay: 30,
};
