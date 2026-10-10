import { NextRequest, NextResponse } from "next/server";
import { getUser, deny } from "@/lib/auth";
import { isValidIco, normalizeIco, registerEntry, SOLE_TRADER_REGISTER } from "@/lib/legal";

// Údaje o podnikateli z veřejného registru ARES (Ministerstvo financí, zdarma,
// bez registrace). Jen pro přihlášené — ať z nás nikdo nedělá veřejnou proxy.

const ARES = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/";
const ARES_VR = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr/";

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
  // Údaj o zápisu: firma z veřejného rejstříku (spisová značka), živnostník bez zápisu
  let register = "";
  if (data?.seznamRegistraci?.stavZdrojeVr === "AKTIVNI") {
    const vr = await fetch(`${ARES_VR}${ico}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const z = vr?.zaznamy?.[0]?.spisovaZnacka?.find?.((s: { datumVymazu?: string }) => !s.datumVymazu) ?? vr?.zaznamy?.[0]?.spisovaZnacka?.[0];
    if (z) register = registerEntry(z);
  } else if (data?.seznamRegistraci?.stavZdrojeRzp === "AKTIVNI" && String(data?.pravniForma) === "101") {
    register = SOLE_TRADER_REGISTER;
  }
  return NextResponse.json({
    register,
    ico,
    name: String(data?.obchodniJmeno ?? ""),
    address: String(data?.sidlo?.textovaAdresa ?? ""),
    vatId: String(data?.dic ?? ""),
  });
}
