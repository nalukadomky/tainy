import { NextRequest, NextResponse } from "next/server";
import { getUser, deny } from "@/lib/auth";
import { isValidIco, normalizeIco } from "@/lib/legal";

// Údaje o podnikateli z veřejného registru ARES (Ministerstvo financí, zdarma,
// bez registrace). Jen pro přihlášené — ať z nás nikdo nedělá veřejnou proxy.

const ARES = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ico: string }> }) {
  if (!(await getUser())) return deny(401);
  const ico = normalizeIco((await params).ico);
  if (!isValidIco(ico)) return NextResponse.json({ error: "IČ není platné — zkontroluj ho." }, { status: 400 });

  const res = await fetch(ARES + ico, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  }).catch(() => null);
  if (res?.status === 404) return NextResponse.json({ error: "V ARES jsem toto IČ nenašel." }, { status: 404 });
  if (!res?.ok) return NextResponse.json({ error: "ARES teď neodpovídá — vyplň údaje ručně." }, { status: 502 });

  const data = await res.json().catch(() => null);
  return NextResponse.json({
    ico,
    name: String(data?.obchodniJmeno ?? ""),
    address: String(data?.sidlo?.textovaAdresa ?? ""),
    vatId: String(data?.dic ?? ""),
  });
}
