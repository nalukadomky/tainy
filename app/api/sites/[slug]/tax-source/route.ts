import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { refreshTaxSource } from "@/lib/tourist-tax";

// Znovu dohledat vyhlášku o poplatku z pobytu podle adresy ubytování
// (tlačítko „Zkontrolovat znovu“ v ceníku). Projde Sbírku předpisů obce.
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  const source = await refreshTaxSource(guard.site.id);
  const site = await prisma.site.findUnique({ where: { id: guard.site.id }, select: { touristTax: true, taxSource: true } });
  return NextResponse.json({ source, touristTax: site?.touristTax, taxSource: site?.taxSource ?? "" });
}
