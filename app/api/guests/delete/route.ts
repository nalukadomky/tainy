import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { DELETED_GUEST } from "@/lib/guests";

// Smazání hosta (= rezervace webu se stejným e-mailem, nebo stejným číslem
// anonymizovaného hosta). Tři režimy:
//  pseudonymize — nesouhlas s GDPR: z hosta je „Host č. 4821" bez osobních údajů,
//                 ve statistikách hostů zůstává (pobyty, noci, útrata)
//  keepRevenue  — rezervace zůstanou jako „Smazaný host" jen kvůli příjmům
//  full         — rezervace se smažou
// Úklidy nikdy nezmizí: zaplacené mají záznam v Nákladech a při úplném smazání
// se úklid po pobytu převede na samostatný úklid (stejné datum), ať neztratíš
// přehled, co dlužíš personálu.

type Mode = "pseudonymize" | "keepRevenue" | "full";
const MODES: Mode[] = ["pseudonymize", "keepRevenue", "full"];

const SCRUB = { firstName: "", email: "", phone: "", note: "" };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const guard = await requireSiteOwnerBySlug(String(body.site ?? ""));
  if (!guard.ok) return deny(guard.status);
  const siteId = guard.site.id;

  const mode: Mode = MODES.includes(body.mode) ? body.mode : "keepRevenue";
  const email = String(body.email ?? "").trim();
  const ref = String(body.ref ?? "").trim();
  if (!email && !ref) return NextResponse.json({ error: "Chybí host." }, { status: 400 });
  const where = {
    siteId,
    anonymized: false,
    ...(ref ? { guestRef: ref } : { email: { equals: email, mode: "insensitive" as const } }),
  };

  if (mode === "pseudonymize") {
    if (ref) return NextResponse.json({ ok: true, count: 0, ref }); // už je anonymizovaný
    // Číslo hosta: náhodné čtyřmístné, na webu jedinečné
    const used = new Set(
      (await prisma.reservation.findMany({ where: { siteId, guestRef: { not: "" } }, select: { guestRef: true } })).map(
        (r) => r.guestRef
      )
    );
    let number = randomInt(1000, 10000);
    while (used.has(`host-${number}`)) number = randomInt(1000, 100000);
    const newRef = `host-${number}`;
    const { count } = await prisma.reservation.updateMany({
      where,
      data: { ...SCRUB, guestName: `Host č. ${number}`, guestRef: newRef },
    });
    return NextResponse.json({ ok: true, count, ref: newRef, name: `Host č. ${number}` });
  }

  if (mode === "keepRevenue") {
    const { count } = await prisma.reservation.updateMany({
      where,
      data: { ...SCRUB, guestName: DELETED_GUEST, guestRef: "", anonymized: true },
    });
    return NextResponse.json({ ok: true, count });
  }

  // Úplné smazání — úklidy po pobytech se nejdřív odpojí jako samostatné úklidy
  const count = await prisma.$transaction(
    async (tx) => {
      const stays = await tx.reservation.findMany({
        where,
        select: { id: true, endDate: true, checkOutTime: true, cleaning: { select: { id: true } } },
      });
      for (const s of stays) {
        if (!s.cleaning) continue;
        await tx.cleaning.update({
          where: { id: s.cleaning.id },
          data: { reservationId: null, date: s.endDate, time: s.checkOutTime, title: "Úklid po pobytu" },
        });
      }
      const { count } = await tx.reservation.deleteMany({ where: { id: { in: stays.map((s) => s.id) } } });
      return count;
    },
    { maxWait: 10_000, timeout: 20_000 }
  );
  return NextResponse.json({ ok: true, count });
}
