import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleaningStart, fmtStart, parseChecklist } from "@/lib/cleaning";

// Uklízečka upravuje svůj úklid: odškrtnutí úkolu, čas, poznámka, ukončení.
// Jen vlastní a neukončený úklid — ukončený může znovu otevřít jen majitel.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; cleaningId: string }> }
) {
  const { token, cleaningId } = await params;
  const cleaner = await prisma.cleaner.findUnique({ where: { token }, select: { id: true, active: true } });
  if (!cleaner || !cleaner.active) return NextResponse.json({ error: "Odkaz neplatí." }, { status: 404 });

  const body = await req.json();

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Zámek na úklid: souběžné úpravy (rychlé odškrtávání, dva telefony)
      // se seřadí a žádná změna se neztratí.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cleaningId}))`;
      const cleaning = await tx.cleaning.findUnique({
        where: { id: cleaningId },
        include: { reservation: { select: { status: true, endDate: true, checkOutTime: true } } },
      });
      if (!cleaning || cleaning.cleanerId !== cleaner.id || cleaning.reservation?.status === "cancelled") {
        throw new HttpError(404, "Úklid nenalezen.");
      }
      if (cleaning.paid || cleaning.status === "done") {
        throw new HttpError(409, "Úklid je uzavřený. Úpravu ti může povolit majitel.");
      }

      const data: Record<string, unknown> = {};
      if (typeof body.toggle === "string") {
        const checklist = parseChecklist(cleaning.checklist).map((i) =>
          i.id === body.toggle ? { ...i, done: typeof body.done === "boolean" ? body.done : !i.done } : i
        );
        data.checklist = JSON.stringify(checklist);
      }
      if (body.minutes !== undefined) {
        const minutes = Math.round(Number(body.minutes));
        if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) {
          throw new HttpError(400, "Zadej čas mezi 0 a 24 hodinami.");
        }
        data.minutes = minutes;
      }
      if (typeof body.note === "string") data.note = body.note.trim().slice(0, 1000);
      if (body.finish === true) {
        // Ukončit jde až od plánovaného začátku úklidu (odjezd hostů / čas ručního úklidu)
        const dateIso = (cleaning.reservation?.endDate ?? cleaning.date)!.toISOString().slice(0, 10);
        const time = cleaning.reservation ? cleaning.reservation.checkOutTime : cleaning.time;
        if (cleaningStart(dateIso, time) > new Date()) {
          throw new HttpError(409, `Úklid můžeš ukončit až od ${fmtStart(dateIso, time)}.`);
        }
        const minutes = (data.minutes as number | undefined) ?? cleaning.minutes ?? 0;
        if (minutes <= 0) throw new HttpError(400, "Než úklid ukončíš, vyplň, jak dlouho trval.");
        Object.assign(data, { status: "done", finishedAt: new Date() });
      }

      return tx.cleaning.update({ where: { id: cleaningId }, data });
      // Pomalé spojení k databázi + čekání na zámek: výchozích 5 s nestačí.
    }, { maxWait: 10_000, timeout: 20_000 });

    return NextResponse.json({
      id: updated.id,
      checklist: parseChecklist(updated.checklist),
      minutes: updated.minutes,
      status: updated.status,
      note: updated.note,
      paid: updated.paid,
    });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

// Uklízečka smaže úklid, který si sama zapsala — jen dokud ho neukončila.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; cleaningId: string }> }
) {
  const { token, cleaningId } = await params;
  const cleaner = await prisma.cleaner.findUnique({ where: { token }, select: { id: true, active: true } });
  if (!cleaner || !cleaner.active) return NextResponse.json({ error: "Odkaz neplatí." }, { status: 404 });
  const cleaning = await prisma.cleaning.findUnique({ where: { id: cleaningId } });
  if (!cleaning || cleaning.cleanerId !== cleaner.id) return NextResponse.json({ error: "Úklid nenalezen." }, { status: 404 });
  if (cleaning.createdBy !== "cleaner" || cleaning.reservationId) {
    return NextResponse.json({ error: "Tenhle úklid ti zadal majitel — smazat ho může jen on." }, { status: 403 });
  }
  if (cleaning.status === "done" || cleaning.paid) {
    return NextResponse.json({ error: "Ukončený úklid už nejde smazat." }, { status: 409 });
  }
  await prisma.cleaning.delete({ where: { id: cleaningId } });
  return NextResponse.json({ ok: true });
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
