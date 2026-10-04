import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { holdsDates } from "@/lib/availability";
import { checklistFromTemplate, cleaningWindow, manualWindow, parseChecklist } from "@/lib/cleaning";
import { addDays, todayISO, fromISO, isTime } from "@/lib/stay";

const CLEANER_SELECT = { select: { id: true, name: true, payMode: true, rate: true } } as const;

// Úklidy webu pro administraci: po každém pobytu, který drží termín (nezrušený,
// nepropadlý), plus ruční úklidy. Bere posledních 30 dní a k tomu starší
// hotové úklidy, které ještě nejsou zaplacené.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);
  const siteId = guard.site.id;

  const since = fromISO(addDays(todayISO(), -30));
  const [reservations, manual] = await Promise.all([
    prisma.reservation.findMany({
      where: { siteId, ...holdsDates() },
      orderBy: { endDate: "asc" },
      include: { cleaning: { include: { cleaner: CLEANER_SELECT } } },
    }),
    prisma.cleaning.findMany({
      where: { siteId, reservationId: null },
      include: { cleaner: CLEANER_SELECT },
    }),
  ]);
  const keep = (date: Date, c: { paid: boolean; status: string } | null) =>
    date >= since || (!!c && !c.paid && c.status === "done");

  const stays = reservations
    .filter((r) => keep(r.endDate, r.cleaning))
    .map((r) => ({
      key: r.id,
      kind: "stay" as const,
      guestName: r.guestName,
      guests: r.guests,
      guestBreakdown: r.guestBreakdown,
      window: cleaningWindow(r, reservations),
      cleaning: r.cleaning ? { ...r.cleaning, checklist: parseChecklist(r.cleaning.checklist) } : null,
    }));
  const manuals = manual
    .filter((c) => c.date && keep(c.date, c))
    .map((c) => ({
      key: c.id,
      kind: "manual" as const,
      title: c.title,
      createdBy: c.createdBy,
      window: manualWindow(c.date!.toISOString(), c.time, reservations),
      cleaning: { ...c, checklist: parseChecklist(c.checklist) },
    }));

  const list = [...stays, ...manuals].sort((a, b) =>
    `${a.window.date} ${a.window.from}`.localeCompare(`${b.window.date} ${b.window.from}`)
  );
  return NextResponse.json(list);
}

// Ruční úklid od majitele (mimo rezervace): datum, čas, popis, případně uklízečka.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const guard = await requireSiteOwnerBySlug(String(body.site ?? ""));
  if (!guard.ok) return deny(guard.status);
  const siteId = guard.site.id;

  const date = String(body.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Vyber datum úklidu." }, { status: 400 });
  const time = isTime(body.time) ? body.time : "";
  const title = String(body.title ?? "").trim().slice(0, 120) || "Úklid";

  let cleanerId: string | null = null;
  if (body.cleanerId) {
    const cleaner = await prisma.cleaner.findFirst({ where: { id: String(body.cleanerId), siteId } });
    if (!cleaner) return NextResponse.json({ error: "Tahle uklízečka už neexistuje — seznam jsem obnovil." }, { status: 404 });
    cleanerId = cleaner.id;
  }
  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId }, select: { cleaningChecklist: true } });
  const cleaning = await prisma.cleaning.create({
    data: {
      siteId,
      date: fromISO(date),
      time,
      title,
      cleanerId,
      createdBy: "owner",
      checklist: JSON.stringify(checklistFromTemplate(site.cleaningChecklist)),
    },
    include: { cleaner: CLEANER_SELECT },
  });
  return NextResponse.json({ ...cleaning, checklist: parseChecklist(cleaning.checklist) }, { status: 201 });
}
