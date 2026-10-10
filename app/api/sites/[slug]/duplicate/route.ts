import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { slugify } from "@/lib/site-slug";

// Duplikace nemovitosti: kopie nastavení a obsahu webu (ceník, sezóny, texty,
// fotky, vybavení, O nás, poloha, e-maily, barva, úklid). Nekopíruje se nic, co
// patří ke konkrétnímu provozu nebo provozovateli: rezervace, hosté, náklady,
// vouchery, blokace, kalendáře z portálů, odkaz iCal, firma a dokumenty.

const SKIP = new Set([
  "id",
  "slug",
  "ownerId",
  "createdAt",
  "icalToken",
  "businessName",
  "businessId",
  "vatId",
  "businessAddress",
  "businessRegister",
  "termsText",
  "termsPdf",
  "termsName",
  "termsUpdatedAt",
  "privacyText",
  "privacyPdf",
  "privacyName",
  "privacyUpdatedAt",
]);

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  const src = await prisma.site.findUniqueOrThrow({ where: { id: guard.site.id }, include: { priceRules: true } });
  const { priceRules, ...fields } = src;
  const data = Object.fromEntries(Object.entries(fields).filter(([k]) => !SKIP.has(k))) as Record<string, unknown>;

  const name = `${src.name} (kopie)`.slice(0, 80);
  const base = slugify(`${src.name}-kopie`) || "muj-web";
  let slug = base;
  for (let i = 2; await prisma.site.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;

  const site = await prisma.site.create({
    data: {
      ...(data as object),
      name,
      slug,
      ownerId: guard.user.id,
      priceRules: {
        create: priceRules.map((r) => ({ label: r.label, startDate: r.startDate, endDate: r.endDate, value: r.value, unit: r.unit })),
      },
    } as never,
    select: { slug: true, name: true },
  });
  return NextResponse.json(site, { status: 201 });
}
