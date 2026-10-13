// Kam po přihlášení (?next=) — jen cesta v rámci aplikace. „//evil.cz“, „/\evil.cz“,
// „/<tab>/evil.cz“ (prohlížeč tabulátor zahodí) nebo „@evil.cz“ by přesměrovaly na cizí web.
export function safeNext(v: string | null | undefined, fallback = "/admin/vyber"): string {
  if (!v || /[\u0000-\u001F\u007F\\]/.test(v) || !v.startsWith("/") || v.startsWith("//")) return fallback;
  try {
    // Stejný parser jako při přesměrování — výsledek musí zůstat na naší adrese
    const base = "http://internal.invalid";
    const u = new URL(v, base);
    if (u.origin !== base) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
