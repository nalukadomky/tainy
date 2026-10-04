import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny, getUser } from "@/lib/auth";
import { parseCategories, serializeCategories } from "@/lib/guests";
import { isTime } from "@/lib/stay";
import { parseCleanerFields } from "@/lib/cleaning";

const TEXT_FIELDS = [
  "name",
  "tagline",
  "description",
  "propertyType",
  "amenities",
  "photos",
  "themeColor",
  "contactEmail",
  "contactPhone",
  "bankAccount",
  "cancellationPolicy",
  "cleaningChecklist",
] as const;

// Celá čísla s rozsahem, ve kterém dávají smysl.
const NUMBER_FIELDS: Record<string, { min: number; max: number }> = {
  pricePerNight: { min: 0, max: 1_000_000 },
  maxGuests: { min: 1, max: 50 },
  minNights: { min: 1, max: 90 },
  leadTimeDays: { min: 0, max: 365 },
  cleaningFee: { min: 0, max: 100_000 },
  touristTax: { min: 0, max: 10_000 },
};

const TIME_FIELDS = ["checkInTime", "checkOutTime"] as const;

const MAX_PHOTOS = 40;

/** Procenta drží v rozumném pásmu, pevná částka je nezáporná koruna. */
function clampAdjust(value: unknown, unit: "pct" | "czk"): number {
  const n = Math.round(Number(value) || 0);
  return unit === "czk" ? Math.max(0, Math.min(1_000_000, n)) : Math.max(-100, Math.min(500, n));
}

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

  // Číslo účtu vidí jen vlastník — hostovi se ukazuje až v QR platbě jeho rezervace.
  const user = await getUser();
  if (site.ownerId && site.ownerId === user?.id) return NextResponse.json(site);
  const { bankAccount: _bankAccount, ownerId: _ownerId, ...publicSite } = site;
  return NextResponse.json(publicSite);
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
  for (const key of TEXT_FIELDS) {
    if (body[key] === undefined || body[key] === null) continue;
    data[key] = String(body[key]).slice(0, 5000);
  }
  // Fotky: dlouhé URL z úložiště by se do 5 000 znaků nevešly — řádek se neusekává
  // uprostřed, jen se omezí počet fotek.
  if (typeof body.photos === "string") {
    data.photos = body.photos
      .split("\n")
      .map((line: string) => line.trim().slice(0, 600))
      .filter(Boolean)
      .slice(0, MAX_PHOTOS)
      .join("\n");
  }
  for (const [key, range] of Object.entries(NUMBER_FIELDS)) {
    if (body[key] === undefined || body[key] === null) continue;
    const n = Number(body[key]);
    if (!Number.isFinite(n)) continue;
    data[key] = Math.max(range.min, Math.min(range.max, Math.round(n)));
  }
  for (const key of TIME_FIELDS) {
    if (!isTime(body[key])) continue;
    data[key] = body[key];
  }
  if (body.heroStyle !== undefined) {
    data.heroStyle = body.heroStyle === "photo" ? "photo" : "text";
  }
  // Co uklízečky uvidí o hostech — jen známé údaje (cena mezi nimi nikdy není).
  if (typeof body.cleanerFields === "string") {
    data.cleanerFields = parseCleanerFields(body.cleanerFields).join(",");
  }
  if (typeof body.heroPhoto === "string") {
    data.heroPhoto = body.heroPhoto.trim().slice(0, 600);
  }
  if (body.pricingMode !== undefined) {
    data.pricingMode = body.pricingMode === "person" ? "person" : "unit";
  }

  // Víkendová úprava: procenta mají jiný smysluplný rozsah než pevná částka.
  if (body.weekendValue !== undefined && body.weekendValue !== null) {
    const unit = body.weekendUnit === "czk" ? "czk" : "pct";
    data.weekendUnit = unit;
    data.weekendValue = clampAdjust(body.weekendValue, unit);
  }

  if (body.guestMode !== undefined) {
    data.guestMode = body.guestMode === "split" ? "split" : "total";
  }
  // Katalog kategorií projde stejným parserem jako při čtení, takže se
  // do databáze nikdy nedostane cizí klíč ani nesmyslná hodnota.
  if (body.guestCategories !== undefined && body.guestCategories !== null) {
    const raw =
      typeof body.guestCategories === "string"
        ? body.guestCategories
        : JSON.stringify(body.guestCategories);
    data.guestCategories = serializeCategories(parseCategories(raw));
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
        value: clampAdjust(r.value, r.unit === "czk" ? "czk" : "pct"),
        unit: r.unit === "czk" ? "czk" : "pct",
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
