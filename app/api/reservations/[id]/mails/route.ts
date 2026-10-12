import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByReservationId, deny } from "@/lib/auth";

// E-maily, které hostovi opravdu odešly (předmět i obsah) — rozkliknutí
// v časové ose detailu rezervace. Jen pro vlastníka webu.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnerByReservationId(id);
  if (!guard.ok) return deny(guard.status);
  const mails = await prisma.guestMail.findMany({
    where: { reservationId: id },
    orderBy: { sentAt: "asc" },
    select: { id: true, kind: true, subject: true, html: true, sentAt: true },
  });
  return NextResponse.json(mails);
}
