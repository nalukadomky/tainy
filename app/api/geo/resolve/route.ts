import { NextRequest, NextResponse } from "next/server";
import { getUser, deny } from "@/lib/auth";
import { parseCoordinates } from "@/lib/location";

// Rozbalí zkrácený odkaz z Google Map (maps.app.goo.gl) na souřadnice. Jen pro
// přihlášené a jen pro adresy Googlu — sleduje přesměrování, obsah nestahuje.
const ALLOWED = /^(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)$/i;

export async function GET(req: NextRequest) {
  if (!(await getUser())) return deny(401);
  let url = (req.nextUrl.searchParams.get("url") ?? "").trim();
  for (let hop = 0; hop < 5; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      break;
    }
    if (parsed.protocol !== "https:" || !ALLOWED.test(parsed.hostname)) break;
    const point = parseCoordinates(url);
    if (point) return NextResponse.json({ point });
    const res = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) }).catch(() => null);
    const next = res?.headers.get("location");
    if (!next) break;
    url = new URL(next, url).toString();
  }
  const point = parseCoordinates(url);
  return point
    ? NextResponse.json({ point })
    : NextResponse.json({ error: "Z odkazu se nepodařilo zjistit polohu — zkopíruj souřadnice místa." }, { status: 404 });
}
