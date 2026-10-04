import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByReservationId, deny } from "@/lib/auth";
import { isTime } from "@/lib/stay";

const STATUSES = ["pending", "paid", "cancelled"];

// Úprava rezervace majitelem: stav a/nebo check-in / check-out pobytu.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const guard = await requireOwnerByReservationId(id);
  if (!guard.ok) return deny(guard.status);

  const body = await req.json();
  const data: { status?: string; checkInTime?: string; checkOutTime?: string } = {};
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
