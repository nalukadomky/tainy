// Vývojové přihlášení na jeden klik: obejde Google/heslo a přihlásí
// účet ze SEED_OWNER_EMAIL (majitel demo webu).
//
// Funguje výhradně v `next dev`. V produkčním buildu je NODE_ENV vždy
// "production", takže cookie se tam ignoruje a přihlašovací endpoint vrací 404.

export const DEV_LOGIN_COOKIE = "tainy-dev-user";

export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV === "development" && !!process.env.SEED_OWNER_EMAIL;
}

export function devLoginEmail(): string {
  return process.env.SEED_OWNER_EMAIL ?? "";
}
