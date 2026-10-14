import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getUser, deny } from "@/lib/auth";
import { importAllowed } from "@/lib/import/flag";
import { createSite } from "@/lib/create-site";
import { storeSitePhoto } from "@/lib/site-photos";
import { safeFetch } from "@/lib/safe-fetch";
import { geocodeAddress } from "@/lib/geocode";
import { serializePhotos, type Photo } from "@/lib/photos";
import { newReview, serializeReviews } from "@/lib/reviews";
import { EMPTY_SLEEPING, serializeSleeping } from "@/lib/sleeping";
import { normalizeIco } from "@/lib/legal";
import { PROPERTY_TYPES } from "@/lib/listing";
import { MAX_IMPORT_PHOTOS, type ImportChoice, type ImportResult } from "@/lib/import/types";

// Vytvoření webu z importu: založí web s údaji, které majitel zkontroloval,
// stáhne vybrané fotky (zmenšené na 2 400 px, JPEG) a doplní zbytek.

export const maxDuration = 120;

const PHOTO_BUDGET_MS = 80_000;
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const int = (v: unknown, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
const time = (v: unknown) => (/^\d{2}:\d{2}$/.test(String(v)) ? String(v) : "");

/** Stáhne fotku z původního webu a převede ji na JPEG pro náš web; malé a rozbité vrací null. */
async function importPhoto(siteId: string, src: string): Promise<string | null> {
  try {
    const res = await safeFetch(src, { timeoutMs: 15_000, maxBytes: 15 * 1024 * 1024, accept: "image/*", allowHttp: true });
    if (res.contentType && !res.contentType.startsWith("image/")) return null;
    const { data, info } = await sharp(res.bytes, { failOn: "error" })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (info.width < 600 && info.height < 600) return null;
    return await storeSitePhoto(siteId, new Uint8Array(data), "image/jpeg");
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return deny(401);
  if (!importAllowed(user.email)) return deny(403);

  const job = await prisma.importJob.findUnique({ where: { id: (await params).id } });
  if (!job || job.ownerId !== user.id) return deny(404);
  if (job.status === "done" && job.siteId) {
    const site = await prisma.site.findUnique({ where: { id: job.siteId }, select: { slug: true } });
    if (site) return NextResponse.json({ slug: site.slug, photos: 0, skipped: 0 });
  }
  if (job.status !== "scanned") return NextResponse.json({ error: "Tenhle import už nejde použít. Naskenuj web znovu." }, { status: 409 });

  const result = JSON.parse(job.result) as ImportResult;
  const c = (await req.json().catch(() => ({}))) as Partial<ImportChoice>;
  const name = text(c.name, 80);
  const pricePerNight = int(c.pricePerNight, 0, 1_000_000);
  const maxGuests = int(c.maxGuests, 0, 40);
  if (name.length < 2 || pricePerNight < 1 || maxGuests < 1)
    return NextResponse.json({ error: "Doplň název, cenu za noc a počet hostů." }, { status: 400 });

  const allowedPhotos = new Set(result.photos.map((p) => p.src));
  const chosen = (Array.isArray(c.photos) ? c.photos : []).filter((s) => typeof s === "string" && allowedPhotos.has(s)).slice(0, MAX_IMPORT_PHOTOS);
  const amenities = (Array.isArray(c.amenities) ? c.amenities : []).map((a) => text(a, 40)).filter(Boolean).slice(0, 30);

  const site = await createSite(user.id, {
    name,
    pricePerNight,
    maxGuests,
    tagline: text(c.tagline, 160),
    description: text(c.description, 3000),
    propertyType: PROPERTY_TYPES.includes(String(c.propertyType)) ? String(c.propertyType) : "chata",
    amenities: amenities.join(", "),
    themeColor: text(c.themeColor, 7) || undefined,
    contactEmail: text(c.contactEmail, 120),
    contactPhone: text(c.contactPhone, 30),
  });

  // Fotky po čtyřech; co se nestihne nebo nejde stáhnout, přeskočíme
  const started = Date.now();
  const stored = new Map<string, string>();
  let i = 0;
  const worker = async () => {
    while (i < chosen.length && Date.now() - started < PHOTO_BUDGET_MS) {
      const src = chosen[i++];
      const url = await importPhoto(site.id, src);
      if (url) stored.set(src, url);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const altOf = new Map(result.photos.map((p) => [p.src, p.alt]));
  const photos: Photo[] = chosen.filter((s) => stored.has(s)).map((s) => ({ src: stored.get(s)!, alt: altOf.get(s) ?? "" }));
  const hero = c.hero && stored.get(c.hero) ? stored.get(c.hero)! : photos[0]?.src ?? "";

  const about = text(c.about, 8000);
  const bedrooms = int(c.bedrooms, 0, 20);
  const business = c.useBusiness && result.business ? result.business : null;
  const reviews =
    c.useReviews && result.reviews.value.length
      ? result.reviews.value.slice(0, 12).map((r) => ({ ...newReview(), name: r.name, text: r.text, rating: r.rating, meta: r.meta }))
      : [];
  const address = text(c.address, 200);
  const geo = address ? await geocodeAddress(address).catch(() => ({})) : {};

  await prisma.site.update({
    where: { id: site.id },
    data: {
      photos: serializePhotos(photos),
      heroPhoto: hero,
      heroStyle: hero ? "photo" : "text",
      aboutText: about,
      aboutEnabled: !!about,
      reviews: serializeReviews(reviews),
      reviewsEnabled: reviews.length > 0,
      sleeping: bedrooms ? serializeSleeping({ ...EMPTY_SLEEPING, bedrooms }) : "",
      ...(time(c.checkInTime) && { checkInTime: time(c.checkInTime) }),
      ...(time(c.checkOutTime) && { checkOutTime: time(c.checkOutTime) }),
      ...(business && {
        businessName: business.name,
        businessId: normalizeIco(text(c.ico, 12)),
        vatId: business.vatId,
        businessAddress: business.address,
        businessRegister: business.register,
      }),
      ...(address && { arrivalAddress: address, geo: Object.keys(geo).length ? JSON.stringify(geo) : "" }),
    },
  });
  await prisma.importJob.update({ where: { id: job.id }, data: { status: "done", siteId: site.id } });

  return NextResponse.json({ slug: site.slug, photos: photos.length, skipped: chosen.length - photos.length });
}
