import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function GET() {
  const sites = await prisma.site.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || !body.pricePerNight) {
    return NextResponse.json({ error: "Chybí název nebo cena za noc." }, { status: 400 });
  }

  let slug = slugify(body.name) || "muj-web";
  const existing = await prisma.site.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const site = await prisma.site.create({
    data: {
      slug,
      name: String(body.name),
      tagline: String(body.tagline ?? ""),
      description: String(body.description ?? ""),
      propertyType: String(body.propertyType ?? "chata"),
      pricePerNight: Number(body.pricePerNight),
      pricingMode: body.pricingMode === "person" ? "person" : "unit",
      weekendPct: Math.max(-90, Math.min(500, Math.round(Number(body.weekendPct) || 0))),
      maxGuests: Number(body.maxGuests ?? 4),
      amenities: String(body.amenities ?? ""),
      themeColor: String(body.themeColor ?? "pine"),
      tier: body.tier === "pro" ? "pro" : "start",
      contactEmail: String(body.contactEmail ?? ""),
      contactPhone: String(body.contactPhone ?? ""),
    },
  });
  return NextResponse.json(site, { status: 201 });
}
