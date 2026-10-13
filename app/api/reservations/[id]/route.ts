import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByReservationId, deny } from "@/lib/auth";
import { isRangeFree, isTime, toISO } from "@/lib/stay";
import { blockedRanges, lockSite } from "@/lib/availability";
import { sendDueMails, STATUS_MAIL_DELAY } from "@/lib/guest-mails";

// Odklad e-mailu po změně stavu (30 s) + odeslání se vejde do limitu funkce
export const maxDuration = 60;

const STATUSES = ["pending", "paid", "cancelled"];

// Úprava rezervace majitelem: stav, check-in / check-out, kód k zámku
// a u rezervací z portálů i údaje hosta a cena.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const guard = await requireOwnerByReservationId(id);
  if (!guard.ok) return deny(guard.status);

  const body = await req.json();
  const data: {
    status?: string;
    expiresAt?: Date | null;
    paidAt?: Date | null;
    cancelledAt?: Date | null;
    checkInTime?: string;
    checkOutTime?: string;
    accessCode?: string;
    accessCodeSetAt?: Date | null;
    guestName?: string;
    firstName?: string;
    phone?: string;
    email?: string;
    guests?: number;
    totalPrice?: number;
    nightsTotal?: number;
  } = {};
  // Údaje hosta a cena: doplnit jde jen u rezervací z portálů a ručních —
  // u rezervace z webu je zadal host a cenu spočítal ceník.
  const details = ["guestName", "phone", "email", "guests", "totalPrice"].some((k) => body[k] !== undefined);
  if (details) {
    if (["web", "widget", "demo"].includes(guard.reservation.source)) {
      return NextResponse.json({ error: "Údaje rezervace z webu upravit nejde." }, { status: 400 });
    }
    if (typeof body.guestName === "string") {
      const name = body.guestName.trim().replace(/\s+/g, " ").slice(0, 80);
      if (name.length < 2) return NextResponse.json({ error: "Doplň jméno hosta." }, { status: 400 });
      data.guestName = name;
      data.firstName = name.split(" ")[0];
    }
    if (typeof body.phone === "string") data.phone = body.phone.trim().slice(0, 30);
    if (typeof body.email === "string") {
      const email = body.email.trim().slice(0, 120);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return NextResponse.json({ error: "E-mail nemá správný tvar." }, { status: 400 });
      data.email = email;
    }
    if (body.guests !== undefined) data.guests = Math.max(0, Math.min(50, Math.round(Number(body.guests) || 0)));
    if (body.totalPrice !== undefined) {
      data.totalPrice = Math.max(0, Math.min(10_000_000, Math.round(Number(body.totalPrice) || 0)));
      data.nightsTotal = data.totalPrice; // cena z portálu se nerozpadá na noci a poplatky
    }
  }
  // Kód k zámku pro přístup do nemovitosti (prázdný = smazat)
  if (typeof body.accessCode === "string") {
    data.accessCode = body.accessCode.trim().slice(0, 40);
    data.accessCodeSetAt = data.accessCode ? new Date() : null;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Neplatný stav rezervace." }, { status: 400 });
    }
    data.status = body.status;
    // Čas přechodu do stavu — podle něj odejde hostovi e-mail (lib/guest-mails.ts)
    if (body.status !== guard.reservation.status) {
      data.paidAt = body.status === "paid" ? new Date() : null;
      data.cancelledAt = body.status === "cancelled" ? new Date() : null;
      // Lhůta na zaplacení: zaplacená ji nepotřebuje; nezaplacená vrácená majitelem
      // (z „zaplaceno“ nebo obnovená zrušená) drží termín, dokud ji majitel nezmění
      const hold = guard.reservation.expiresAt;
      if (body.status === "paid") data.expiresAt = null;
      if (body.status === "pending" && (!hold || hold <= new Date())) data.expiresAt = null;
    }
  }
  for (const key of ["checkInTime", "checkOutTime"] as const) {
    if (body[key] === undefined) continue;
    if (!isTime(body[key])) return NextResponse.json({ error: "Čas zadej ve tvaru HH:MM." }, { status: 400 });
    data[key] = body[key];
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Není co uložit." }, { status: 400 });
  }

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      // Rezervace, která termín nedržela (zrušená, propadlá), ho znovu obsadí jen když je volný
      const r = guard.reservation;
      const wasHolding = r.status === "paid" || (r.status !== "cancelled" && (!r.expiresAt || r.expiresAt > new Date()));
      if (data.status && data.status !== "cancelled" && !wasHolding) {
        await lockSite(tx, r.siteId);
        const blocked = await blockedRanges(r.siteId, toISO(r.startDate), tx, { excludeReservationId: id });
        if (!isRangeFree(blocked, toISO(r.startDate), toISO(r.endDate))) throw new Taken();
      }
      const updated = await tx.reservation.update({ where: { id }, data });
      // Zrušený pobyt = žádný úklid po něm (zmizí i uklízečce). Úklid se nedá
      // ukončit před odjezdem, takže zrušení vždy přijde dřív než hotová práce.
      if (data.status === "cancelled") await tx.cleaning.deleteMany({ where: { reservationId: id, paid: false } });
      return updated;
    });
    // E-maily hostovi až po odpovědi. Po změně stavu s odkladem, aby šel omyl
    // vrátit — sendDueMails si stav načte znovu, takže vrácený stav nic nepošle.
    // Nový kód k zámku jde hned (je-li už e-mail „Před příjezdem“ na řadě).
    const statusChanged = data.paidAt !== undefined;
    if (statusChanged || data.accessCode) {
      after(async () => {
        if (statusChanged) await new Promise((r) => setTimeout(r, STATUS_MAIL_DELAY));
        await sendDueMails(id);
      });
    }
    return NextResponse.json(reservation);
  } catch (e) {
    if (e instanceof Taken) {
      return NextResponse.json({ error: "Termín mezitím obsadila jiná rezervace nebo blokace." }, { status: 409 });
    }
    return NextResponse.json({ error: "Rezervace nenalezena." }, { status: 404 });
  }
}

class Taken extends Error {}
