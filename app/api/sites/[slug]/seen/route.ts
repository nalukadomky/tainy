import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";

// Přehled → „Od minula přišly nové rezervace“: majitel je viděl (nebo první návštěva).
// Nové jsou pak jen rezervace vytvořené po tomhle okamžiku.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  const at = new Date();
  await prisma.site.update({ where: { id: guard.site.id }, data: { newSeenAt: at } });
  return NextResponse.json({ newSeenAt: at.toISOString() });
}
