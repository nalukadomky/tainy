import { NextRequest, NextResponse } from "next/server";
import { getUser, deny } from "@/lib/auth";

// Našeptávač adres (Nastavení → Automatizace → adresa ubytování). Hledá Photon
// nad daty OpenStreetMap — zdarma a bez klíče. Jen pro přihlášené, ať z nás
// nikdo nedělá veřejnou proxy; hledá se v Česku.

const PHOTON = "https://photon.komoot.io/api/";
const CZ_BBOX = "12.09,48.55,18.86,51.06";

type Props = {
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  district?: string;
  locality?: string;
  countrycode?: string;
  type?: string;
};

/** „Ulice 12, 602 00 Brno“; evidenční číslo jako „č. ev. 12“, obec bez ulice jako „Obec 12“. */
function format(p: Props): string {
  const number = p.housenumber?.replace(/^ev\.?\s*/i, "č. ev. ") ?? "";
  const town = p.city || p.locality || p.district || "";
  const place = p.street || (p.type === "house" ? p.district || p.locality || town : p.name) || "";
  const first = [place, number].filter(Boolean).join(" ");
  const second = [p.postcode, town].filter(Boolean).join(" ");
  return [first, second !== first ? second : ""].filter(Boolean).join(", ");
}

export async function GET(req: NextRequest) {
  if (!(await getUser())) return deny(401);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ results: [] });

  const url = `${PHOTON}?${new URLSearchParams({ q, limit: "8", bbox: CZ_BBOX })}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "tainy.cz (address suggest)" },
    signal: AbortSignal.timeout(6000),
    next: { revalidate: 86400 },
  }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ results: [] }, { status: 502 });

  const data = await res.json().catch(() => null);
  const seen = new Set<string>();
  const results: string[] = [];
  for (const f of data?.features ?? []) {
    const p: Props = f?.properties ?? {};
    if (p.countrycode && p.countrycode !== "CZ") continue;
    if (!["house", "street", "city", "district", "locality"].includes(p.type ?? "")) continue;
    const text = format(p);
    if (text.length < 3 || seen.has(text)) continue;
    seen.add(text);
    results.push(text);
  }
  return NextResponse.json({ results: results.slice(0, 6) });
}
