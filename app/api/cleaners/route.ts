import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { newCleanerToken, readPay } from "@/lib/cleaning-server";

// Uklízečky webu. Každá má tajný odkaz /uklid/[token] na svůj kalendář úklidů.

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);
  const cleaners = await prisma.cleaner.findMany({
    where: { siteId: guard.site.id },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { cleanings: true } } },
  });
  return NextResponse.json(cleaners);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const guard = await requireSiteOwnerBySlug(String(body.site ?? ""));
  if (!guard.ok) return deny(guard.status);
  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Napiš jméno." }, { status: 400 });
  const cleaner = await prisma.cleaner.create({
    data: { siteId: guard.site.id, name, token: newCleanerToken(), ...readPay(body) },
    include: { _count: { select: { cleanings: true } } },
  });
  return NextResponse.json(cleaner, { status: 201 });
}
