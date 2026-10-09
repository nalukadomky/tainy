import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByReservationId, deny } from "@/lib/auth";
import { isTime } from "@/lib/stay";

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
    if (guard.reservation.source === "web" || guard.reservation.source === "demo") {
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
      const updated = await tx.reservation.update({ where: { id }, data });
      // Zrušený pobyt = žádný úklid po něm (zmizí i uklízečce). Úklid se nedá
      // ukončit před odjezdem, takže zrušení vždy přijde dřív než hotová práce.
      if (data.status === "cancelled") await tx.cleaning.deleteMany({ where: { reservationId: id, paid: false } });
      return updated;
    });
    return NextResponse.json(reservation);
  } catch {
    return NextResponse.json({ error: "Rezervace nenalezena." }, { status: 404 });
  }
}
