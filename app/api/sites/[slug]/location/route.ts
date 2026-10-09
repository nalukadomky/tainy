import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { geoFromPoint, geocodeAddress } from "@/lib/geocode";

// Poloha ubytování určená ručně (špendlík, odkaz z map, souřadnice) — ukládá
// se hned. `point: null` vrátí polohu podle adresy.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  const body = await req.json().catch(() => ({}));
  let geo: string;
  if (body.point === null) {
    const { arrivalAddress } = await prisma.site.findUniqueOrThrow({
      where: { id: guard.site.id },
      select: { arrivalAddress: true },
    });
    geo = arrivalAddress.trim() ? JSON.stringify(await geocodeAddress(arrivalAddress)) : "";
  } else {
    const lat = Number(body.point?.lat);
    const lng = Number(body.point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      return NextResponse.json({ error: "Neplatné souřadnice." }, { status: 400 });
    geo = JSON.stringify(await geoFromPoint({ lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }));
  }
  await prisma.site.update({ where: { id: guard.site.id }, data: { geo } });
  return NextResponse.json({ geo });
}
