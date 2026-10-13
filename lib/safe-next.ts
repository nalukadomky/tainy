// Kam po přihlášení (?next=) — jen cesta v rámci aplikace. „//evil.cz“, „/\evil.cz“
// nebo „@evil.cz“ by přesměrovaly na cizí web.
export function safeNext(v: string | null | undefined, fallback = "/admin/vyber"): string {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  return v;
}
