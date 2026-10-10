import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny, getUser } from "@/lib/auth";
import { parseCategories, serializeCategories } from "@/lib/guests";
import { isTime } from "@/lib/stay";
import { parseCleanerFields } from "@/lib/cleaning";
import { parseSleeping, serializeSleeping } from "@/lib/sleeping";
import { cleanVatRate } from "@/lib/vat";
import { cleanLocationMode } from "@/lib/location";
import { cleanTheme } from "@/lib/theme";
import { cleanAboutLayout, cleanPhotoShape } from "@/lib/about";
import { parseCrop, serializeCrop } from "@/lib/crop";
import { geocodeAddress } from "@/lib/geocode";
import { parseEmailSettings, parseLocks, serializeEmailSettings } from "@/lib/email-templates";
import { isValidIco, isValidVatId, normalizeIco, normalizeVatId } from "@/lib/legal";

const TEXT_FIELDS = [
  "name",
  "tagline",
  "description",
  "propertyType",
  "amenities",
  "photos",
  "contactEmail",
  "contactPhone",
  "bankAccount",
  "cancellationPolicy",
  "cleaningChecklist",
  "businessName",
  "businessAddress",
  "businessRegister",
  "arrivalAddress",
  "arrivalInfo",
  "wifiName",
  "wifiPassword",
] as const;

// Obchodní podmínky a zásady bývají dlouhé — vlastní limit. PDF se mění jen
// přes /documents, tady jen text.
const LEGAL_TEXT_FIELDS = { termsText: "termsUpdatedAt", privacyText: "privacyUpdatedAt" } as const;
const MAX_LEGAL_TEXT = 100_000;

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
  // Kódy k zámkům, Wi‑Fi, adresa a pokyny k příjezdu jdou hostům jen e-mailem k jejich pobytu.
  const user = await getUser();
  if (site.ownerId && site.ownerId === user?.id) return NextResponse.json(site);
  const {
    bankAccount: _bankAccount,
    ownerId: _ownerId,
    emailSettings: _emailSettings,
    locks: _locks,
    arrivalAddress: _arrivalAddress,
    arrivalInfo: _arrivalInfo,
    wifiName: _wifiName,
    wifiPassword: _wifiPassword,
    geo: _geo,
    ...publicSite
  } = site;
  return NextResponse.json(publicSite);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Editovat web smí jen jeho vlastník. Současný stav (texty dokumentů, sezóny)
  // se načítá souběžně s ověřením — databáze je pomalá, dotazy po sobě by trvaly.
  const [guard, current, body] = await Promise.all([
    requireSiteOwnerBySlug(slug),
    prisma.site.findUnique({
      where: { slug },
      select: {
        termsText: true,
        privacyText: true,
        arrivalAddress: true,
        vatId: true,
        priceRules: { select: { label: true, startDate: true, endDate: true, value: true, unit: true } },
      },
    }),
    req.json(),
  ]);
  if (!guard.ok || !current) return deny(guard.ok ? 404 : guard.status);
  const data: Record<string, string | number | boolean | Date> = {};
  for (const key of TEXT_FIELDS) {
    if (body[key] === undefined || body[key] === null) continue;
    data[key] = String(body[key]).slice(0, 5000);
  }
  // IČ a DIČ: prázdné jde, jinak musí být platné
  if (typeof body.businessId === "string") {
    const ico = body.businessId.trim() ? normalizeIco(body.businessId) : "";
    if (ico && !isValidIco(ico)) return NextResponse.json({ error: "IČ není platné — zkontroluj ho." }, { status: 400 });
    data.businessId = ico;
  }
  if (typeof body.vatId === "string") {
    const dic = normalizeVatId(body.vatId);
    if (dic && !isValidVatId(dic)) return NextResponse.json({ error: "DIČ má tvar CZ a 8–10 číslic." }, { status: 400 });
    data.vatId = dic;
  }
  // DPH: plátce musí mít DIČ (nové z požadavku, jinak uložené)
  if (typeof body.vatPayer === "boolean") {
    if (body.vatPayer) {
      const dic = typeof body.vatId === "string" ? normalizeVatId(body.vatId) : current.vatId;
      if (!dic) return NextResponse.json({ error: "Plátce DPH musí mít vyplněné DIČ." }, { status: 400 });
    }
    data.vatPayer = body.vatPayer;
  }
  if (body.vatRate !== undefined) data.vatRate = cleanVatRate(body.vatRate);
  // Texty dokumentů: při změně se posune verze (datum, se kterým host souhlasí)
  const legalKeys = (Object.keys(LEGAL_TEXT_FIELDS) as (keyof typeof LEGAL_TEXT_FIELDS)[]).filter(
    (k) => typeof body[k] === "string"
  );
  if (legalKeys.length) {
    for (const key of legalKeys) {
      const text = String(body[key]).slice(0, MAX_LEGAL_TEXT);
      if (text === current[key]) continue;
      data[key] = text;
      data[LEGAL_TEXT_FIELDS[key]] = new Date();
    }
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
  if (body.themeColor !== undefined) data.themeColor = cleanTheme(body.themeColor);
  // Sekce „O nás“
  if (typeof body.aboutEnabled === "boolean") data.aboutEnabled = body.aboutEnabled;
  if (body.aboutLayout !== undefined) data.aboutLayout = cleanAboutLayout(body.aboutLayout);
  if (typeof body.aboutTitle === "string") data.aboutTitle = body.aboutTitle.trim().slice(0, 80);
  if (typeof body.aboutText === "string") data.aboutText = body.aboutText.slice(0, 8000);
  if (typeof body.aboutSignature === "string") data.aboutSignature = body.aboutSignature.trim().slice(0, 120);
  if (typeof body.aboutPhoto === "string") data.aboutPhoto = body.aboutPhoto.trim().slice(0, 600);
  if (body.aboutPhotoShape !== undefined) data.aboutPhotoShape = cleanPhotoShape(body.aboutPhotoShape);
  if (typeof body.aboutPhotoCrop === "string") data.aboutPhotoCrop = serializeCrop(parseCrop(body.aboutPhotoCrop));
  // Poloha na webu a souřadnice z adresy (dohledají se jen při změně adresy)
  if (body.locationMode !== undefined) data.locationMode = cleanLocationMode(body.locationMode);
  if (typeof body.arrivalAddress === "string" && body.arrivalAddress.trim() !== current.arrivalAddress.trim()) {
    data.geo = body.arrivalAddress.trim() ? JSON.stringify(await geocodeAddress(body.arrivalAddress)) : "";
  }
  // Automatizace: e-maily a zámky projdou parserem (výchozí hodnoty, limity, jen http odkazy)
  if (typeof body.emailSettings === "string") data.emailSettings = serializeEmailSettings(parseEmailSettings(body.emailSettings));
  if (typeof body.locks === "string") data.locks = JSON.stringify(parseLocks(body.locks));
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
  // Ložnice a lůžka: jen známé počty v rozumném rozsahu
  if (body.sleeping !== undefined && body.sleeping !== null) {
    const raw = typeof body.sleeping === "string" ? body.sleeping : JSON.stringify(body.sleeping);
    data.sleeping = serializeSleeping(parseSleeping(raw));
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
    // Přepisovat jen při skutečné změně — formulář posílá sezóny při každém uložení
    const key = (rules: { label: string; startDate: Date; endDate: Date; value: number; unit: string }[]) =>
      JSON.stringify(
        rules
          .map((r) => [r.label, r.startDate.toISOString().slice(0, 10), r.endDate.toISOString().slice(0, 10), r.value, r.unit])
          .sort()
      );
    if (key(cleaned) !== key(current.priceRules)) {
      rulesOps = [
        prisma.priceRule.deleteMany({ where: { siteId: existing.id } }),
        prisma.priceRule.createMany({ data: cleaned }),
      ] as never[];
    }
  }

  // Uložení rovnou vrátí aktuální web (bez dalšího dotazu)
  const update = prisma.site.update({
    where: { slug },
    data,
    include: { priceRules: { orderBy: { startDate: "asc" } } },
  });
  const site = rulesOps.length ? (await prisma.$transaction([...rulesOps, update])).at(-1) : await update;
  return NextResponse.json(site);
}
