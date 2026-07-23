import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByReservationId, deny } from "@/lib/auth";

const STATUSES = ["pending", "paid", "cancelled"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const guard = await requireOwnerByReservationId(id);
  if (!guard.ok) return deny(guard.status);

  const body = await req.json();
  if (!STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Neplatný stav rezervace." }, { status: 400 });
  }
  try {
    const reservation = await prisma.reservation.update({
      where: { id },
      data: { status: body.status },
    });
    return NextResponse.json(reservation);
  } catch {
    return NextResponse.json({ error: "Rezervace nenalezena." }, { status: 404 });
  }
}
