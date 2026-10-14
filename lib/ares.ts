import "server-only";
import { isValidIco, normalizeIco, registerEntry, SOLE_TRADER_REGISTER } from "@/lib/legal";

// Údaje o podnikateli z veřejného registru ARES (Ministerstvo financí, zdarma,
// bez registrace).

const ARES = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/";
const ARES_VR = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr/";

export type AresSubject = { ico: string; name: string; address: string; vatId: string; register: string };
export type AresResult = { ok: true; subject: AresSubject } | { ok: false; reason: "invalid" | "not-found" | "unavailable" };

export async function lookupAres(raw: string): Promise<AresResult> {
  const ico = normalizeIco(raw);
  if (!isValidIco(ico)) return { ok: false, reason: "invalid" };

  const res = await fetch(ARES + ico, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  }).catch(() => null);
  if (res?.status === 404) return { ok: false, reason: "not-found" };
  if (!res?.ok) return { ok: false, reason: "unavailable" };

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
  return {
    ok: true,
    subject: {
      register,
      ico,
      name: String(data?.obchodniJmeno ?? ""),
      address: String(data?.sidlo?.textovaAdresa ?? ""),
      vatId: String(data?.dic ?? ""),
    },
  };
}
