import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { blockedRanges } from "@/lib/availability";
import { syncStale } from "@/lib/ical-sync";
import { addDays, todayISO } from "@/lib/stay";

// Veřejná obsazenost pro kalendář — jen termíny, žádné údaje o hostech.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });
  const site = await prisma.site.findUnique({ where: { slug }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "Web nenalezen." }, { status: 404 });

  // Kalendáře z portálů starší než 5 minut se stáhnou na pozadí — odpověď na ně
  // nečeká (dřív až 4 s); rezervace stejně termín ověřuje znovu při odeslání.
  after(() => syncStale(site.id, 5 * 60_000).catch(() => {}));

  // Minulost kalendář stejně nenabízí — stačí okno od minulého měsíce dál.
  // Bez cache — widget se ptá průběžně a musí dostat aktuální stav.
  return NextResponse.json(await blockedRanges(site.id, addDays(todayISO(), -40)), {
    headers: { "Cache-Control": "no-store" },
  });
}
