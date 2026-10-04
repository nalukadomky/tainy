import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { holdsDates } from "@/lib/availability";
import {
  checklistFromTemplate,
  cleaningStart,
  cleaningWindow,
  guestInfoForCleaner,
  manualWindow,
  parseChecklist,
  parseCleanerFields,
} from "@/lib/cleaning";
import { addDays, fromISO, isTime, todayISO } from "@/lib/stay";

// Kalendář úklidů pro uklízečku (přístup přes tajný odkaz, bez přihlášení).
// Odpověď obsahuje jen to, co uklízečka potřebuje — žádné ceny pobytů, e-maily
// ani platby hostů. Vidí jen svou odměnu za úklid.

async function cleanerByToken(token: string) {
  const cleaner = await prisma.cleaner.findUnique({
    where: { token },
    include: {
      site: {
        select: { id: true, name: true, guestMode: true, pricingMode: true, guestCategories: true, cleanerFields: true, cleaningChecklist: true },
      },
    },
  });
  return cleaner?.active ? cleaner : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cleaner = await cleanerByToken(token);
  if (!cleaner) return NextResponse.json({ error: "Odkaz neplatí." }, { status: 404 });

  const fields = parseCleanerFields(cleaner.site.cleanerFields);
  const since = fromISO(addDays(todayISO(), -45));
  // Jen pobyty, které drží termín — zrušený nebo propadlý pobyt úklid nemá.
  const [stays, manual] = await Promise.all([
    prisma.reservation.findMany({
      where: { siteId: cleaner.site.id, ...holdsDates() },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        checkInTime: true,
        checkOutTime: true,
        status: true,
        guests: true,
        guestBreakdown: true,
        guestName: true,
        note: true,
        phone: true,
        cleaning: true,
      },
      orderBy: { endDate: "asc" },
    }),
    prisma.cleaning.findMany({
      where: { cleanerId: cleaner.id, reservationId: null, date: { gte: since } },
    }),
  ]);

  const common = (c: (typeof manual)[number], window: ReturnType<typeof manualWindow>) => ({
    id: c.id,
    window,
    startsAt: cleaningStart(window.date, window.from).toISOString(),
    checklist: parseChecklist(c.checklist),
    minutes: c.minutes,
    status: c.status,
    note: c.note,
    paid: c.paid,
    // Odměna: u zaplaceného úklidu skutečně vyplacená částka
    amount: c.paid ? c.amount : null,
  });

  const fromStays = stays
    .filter((r) => r.endDate >= since && r.cleaning?.cleanerId === cleaner.id)
    .map((r) => ({
      ...common(r.cleaning!, cleaningWindow(r, stays)),
      kind: "stay" as const,
      arrival: { date: r.startDate.toISOString().slice(0, 10), time: r.checkInTime },
      departure: { date: r.endDate.toISOString().slice(0, 10), time: r.checkOutTime },
      guest: guestInfoForCleaner(r, cleaner.site, fields),
    }));
  const manuals = manual.map((c) => ({
    ...common(c, manualWindow(c.date!.toISOString(), c.time, stays)),
    kind: "manual" as const,
    title: c.title,
    ownCreated: c.createdBy === "cleaner",
  }));

  const cleanings = [...fromStays, ...manuals].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return NextResponse.json({
    cleaner: { name: cleaner.name, payMode: cleaner.payMode, rate: cleaner.rate },
    site: { name: cleaner.site.name },
    cleanings,
  });
}

// Uklízečka si zapíše vlastní úklid (bez schválení — majitel ho uvidí se štítkem).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cleaner = await cleanerByToken(token);
  if (!cleaner) return NextResponse.json({ error: "Odkaz neplatí." }, { status: 404 });
  const body = await req.json();

  const date = String(body.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Vyber datum úklidu." }, { status: 400 });
  const title = String(body.title ?? "").trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: "Napiš, o jaký úklid jde." }, { status: 400 });

  const c = await prisma.cleaning.create({
    data: {
      siteId: cleaner.site.id,
      cleanerId: cleaner.id,
      date: fromISO(date),
      time: isTime(body.time) ? body.time : "",
      title,
      createdBy: "cleaner",
      checklist: JSON.stringify(checklistFromTemplate(cleaner.site.cleaningChecklist)),
    },
  });
  return NextResponse.json({ id: c.id }, { status: 201 });
}
