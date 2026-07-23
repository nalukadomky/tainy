import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";

const EDITABLE = [
  "name",
  "tagline",
  "description",
  "propertyType",
  "pricePerNight",
  "pricingMode",
  "weekendPct",
  "maxGuests",
  "amenities",
  "themeColor",
  "tier",
  "contactEmail",
  "contactPhone",
] as const;

const NUMERIC = ["pricePerNight", "maxGuests"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const site = await prisma.site.findUnique({
    where: { slug },
    include: { priceRules: { orderBy: { startDate: "asc" } } },
  });
  if (!site) return NextResponse.json({ error: "Web nenalezen." }, { status: 404 });
  return NextResponse.json(site);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Editovat web smí jen jeho vlastník
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);

  const body = await req.json();
  const data: Record<string, string | number> = {};
  for (const key of EDITABLE) {
    if (body[key] === undefined || body[key] === null) continue;
    if (NUMERIC.includes(key)) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < 0) continue;
      data[key] = Math.round(n);
    } else if (key === "weekendPct") {
      const n = Number(body[key]);
      if (!Number.isFinite(n)) continue;
      data[key] = Math.max(-90, Math.min(500, Math.round(n)));
    } else if (key === "pricingMode") {
      data[key] = body[key] === "person" ? "person" : "unit";
    } else {
      data[key] = String(body[key]);
    }
  }

  const existing = guard.site;

  // Sezónní období: pokud přijde pole priceRules, nahradí se celé
  let rulesOps: ReturnType<typeof prisma.priceRule.deleteMany>[] = [];
  if (Array.isArray(body.priceRules)) {
    const cleaned = body.priceRules
      .map((r: Record<string, unknown>) => ({
        siteId: existing.id,
        label: String(r.label ?? "Sezóna").slice(0, 60),
        startDate: new Date(String(r.startDate)),
        endDate: new Date(String(r.endDate)),
        pct: Math.max(-90, Math.min(500, Math.round(Number(r.pct) || 0))),
      }))
      .filter(
        (r: { startDate: Date; endDate: Date }) =>
          !isNaN(r.startDate.getTime()) && !isNaN(r.endDate.getTime()) && r.endDate >= r.startDate
      );
    rulesOps = [
      prisma.priceRule.deleteMany({ where: { siteId: existing.id } }),
      prisma.priceRule.createMany({ data: cleaned }),
    ] as never[];
  }

  await prisma.$transaction([
    prisma.site.update({ where: { slug }, data }),
    ...rulesOps,
  ]);

  const site = await prisma.site.findUnique({
    where: { slug },
    include: { priceRules: { orderBy: { startDate: "asc" } } },
  });
  return NextResponse.json(site);
}
