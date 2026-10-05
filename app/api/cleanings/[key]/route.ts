import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, deny } from "@/lib/auth";
import { checklistFromTemplate, cleaningAmount, parseChecklist } from "@/lib/cleaning";

// Jeden úklid (majitel). `key` je ID rezervace (úklid po pobytu — vznikne při
// prvním přiřazení) nebo ID ručního úklidu.
//  PATCH: přiřadit uklízečku, úkoly navíc, zaplaceno (→ Náklady), povolit úpravu
//  DELETE: jen ruční a nezaplacený úklid

type Target = { siteId: string; reservationId: string | null; cleaningId: string | null; day: Date | null };

async function resolve(key: string): Promise<{ ok: true; target: Target } | { ok: false; status: 401 | 403 | 404 }> {
  const user = await getUser();
  if (!user) return { ok: false, status: 401 };
  const reservation = await prisma.reservation.findUnique({
    where: { id: key },
    select: { id: true, siteId: true, endDate: true, site: { select: { ownerId: true } } },
  });
  if (reservation) {
    if (reservation.site.ownerId !== user.id) return { ok: false, status: 403 };
    return {
      ok: true,
      target: { siteId: reservation.siteId, reservationId: reservation.id, cleaningId: null, day: reservation.endDate },
    };
  }
  const manual = await prisma.cleaning.findUnique({
    where: { id: key },
    select: { id: true, siteId: true, reservationId: true, date: true, site: { select: { ownerId: true } } },
  });
  if (!manual || manual.reservationId) return { ok: false, status: 404 };
  if (manual.site.ownerId !== user.id) return { ok: false, status: 403 };
  return { ok: true, target: { siteId: manual.siteId, reservationId: null, cleaningId: manual.id, day: manual.date } };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const found = await resolve(key);
  if (!found.ok) return deny(found.status);
  const { siteId, reservationId, cleaningId, day } = found.target;
  const body = await req.json();

  const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId }, select: { cleaningChecklist: true } });
  const where = reservationId ? { reservationId } : { id: cleaningId! };

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        let cleaning = await tx.cleaning.findUnique({ where, include: { cleaner: true } });

        // Úklid po pobytu vzniká až při první akci (se šablonou úkolů)
        if (!cleaning) {
          if (!reservationId) throw new HttpError(404, "Úklid nenalezen.");
          cleaning = await tx.cleaning.create({
            data: { siteId, reservationId, checklist: JSON.stringify(checklistFromTemplate(site.cleaningChecklist)) },
            include: { cleaner: true },
          });
        }

        // Přiřazení uklízečky
        if (body.cleanerId !== undefined) {
          let cleanerId: string | null = null;
          if (body.cleanerId) {
            const cleaner = await tx.cleaner.findFirst({ where: { id: String(body.cleanerId), siteId } });
            // Uklízečka mezitím mohla být smazaná (stránka v jiném okně ji ještě nabízí)
            if (!cleaner) throw new HttpError(404, "Tenhle člen personálu už neexistuje — seznam jsem obnovil.");
            cleanerId = cleaner.id;
          }
          if (cleaning.paid) throw new HttpError(409, "Zaplacený úklid už nejde přeřadit.");
          cleaning = await tx.cleaning.update({ where: { id: cleaning.id }, data: { cleanerId }, include: { cleaner: true } });
        }

        // Povolit uklízečce úpravu ukončeného úklidu (jen dokud není zaplacený)
        if (body.reopen === true) {
          if (cleaning.paid) throw new HttpError(409, "Zaplacený úklid už nejde otevřít. Nejdřív zruš zaplacení.");
          cleaning = await tx.cleaning.update({
            where: { id: cleaning.id },
            data: { status: "todo", finishedAt: null },
            include: { cleaner: true },
          });
        }

        // Úkoly navíc jen k tomuhle úklidu
        let checklist = parseChecklist(cleaning.checklist);
        if (typeof body.addTask === "string" && body.addTask.trim()) {
          checklist = [
            ...checklist,
            { id: `x${Date.now().toString(36)}`, label: body.addTask.trim().slice(0, 120), done: false, extra: true },
          ];
        }
        if (typeof body.removeTask === "string") checklist = checklist.filter((i) => i.id !== body.removeTask);

        const data: Record<string, unknown> = { checklist: JSON.stringify(checklist) };

        // Zaplaceno ↔ záznam v Nákladech
        if (body.paid === true && !cleaning.paid) {
          if (!cleaning.cleaner) throw new HttpError(400, "Nejdřív vyber, kdo bude uklízet.");
          const amount = cleaningAmount(cleaning.cleaner, cleaning.minutes);
          const when = day ? day.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", timeZone: "UTC" }) : "";
          const cost =
            amount > 0
              ? await tx.cost.create({
                  data: {
                    siteId,
                    label: `Úklid – ${cleaning.cleaner.name}${when ? ` – ${when}` : ""}`,
                    amount,
                    category: "úklid",
                    date: new Date(),
                  },
                })
              : null;
          Object.assign(data, { paid: true, paidAt: new Date(), amount, costId: cost?.id ?? null });
        }
        if (body.paid === false && cleaning.paid) {
          if (cleaning.costId) await tx.cost.deleteMany({ where: { id: cleaning.costId, siteId } });
          Object.assign(data, { paid: false, paidAt: null, amount: null, costId: null });
        }

        const updated = await tx.cleaning.update({
          where: { id: cleaning.id },
          data,
          include: { cleaner: { select: { id: true, name: true, payMode: true, rate: true } } },
        });
        return { ...updated, checklist: parseChecklist(updated.checklist) };
        // Pomalé spojení k databázi: výchozích 5 s na transakci nestačí.
      },
      { maxWait: 10_000, timeout: 20_000 }
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const found = await resolve(key);
  if (!found.ok) return deny(found.status);
  const { cleaningId } = found.target;
  if (!cleaningId) return NextResponse.json({ error: "Úklid po pobytu se smaže sám, když se pobyt zruší." }, { status: 400 });
  const cleaning = await prisma.cleaning.findUniqueOrThrow({ where: { id: cleaningId } });
  if (cleaning.paid) return NextResponse.json({ error: "Zaplacený úklid nejde smazat. Nejdřív zruš zaplacení." }, { status: 409 });
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
