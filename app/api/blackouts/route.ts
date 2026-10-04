import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { blockedRanges, lockSite } from "@/lib/availability";
import { fromISO, isRangeFree } from "@/lib/stay";

// Blokace termínů majitelem (servis, vlastní pobyt). `end` je den po
// posledním blokovaném dni — stejná konvence jako odjezd u rezervace.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);
  const blackouts = await prisma.blackout.findMany({
    where: { siteId: guard.site.id },
    orderBy: { startDate: "asc" },
  });
  return NextResponse.json(blackouts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const guard = await requireSiteOwnerBySlug(String(body.site ?? ""));
  if (!guard.ok) return deny(guard.status);

  const start = String(body.start ?? "");
  const end = String(body.end ?? "");
  if (!ISO.test(start) || !ISO.test(end) || end <= start) {
    return NextResponse.json({ error: "Neplatný termín blokace." }, { status: 400 });
  }
  const siteId = guard.site.id;

  try {
    const blackout = await prisma.$transaction(async (tx) => {
      // Stejný zámek jako při zakládání rezervace — blokace a rezervace
      // na stejný termín nemohou projít současně.
      await lockSite(tx, siteId);
      const blocked = await blockedRanges(siteId, start, tx);
      if (!isRangeFree(blocked, start, end)) return null;
      return tx.blackout.create({
        data: {
          siteId,
          startDate: fromISO(start),
          endDate: fromISO(end),
          reason: String(body.reason ?? "").trim().slice(0, 80),
        },
      });
    });
    if (!blackout) {
      return NextResponse.json(
        { error: "V tomhle termínu už je rezervace nebo jiná blokace. Vyber jiné dny." },
        { status: 409 }
      );
    }
    return NextResponse.json(blackout, { status: 201 });
  } catch (e) {
    console.error("Uložení blokace selhalo:", e);
    return NextResponse.json({ error: "Blokaci se nepodařilo uložit." }, { status: 500 });
  }
}
