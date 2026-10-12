import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByReservationId, deny } from "@/lib/auth";
import { sendArrivalNow } from "@/lib/guest-mails";

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

// Naplánovaný e-mail „Před příjezdem“ poslat hned (majitel na klik).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnerByReservationId(id);
  if (!guard.ok) return deny(guard.status);
  const body = await req.json().catch(() => ({}));
  if (body.kind !== "arrival") return NextResponse.json({ error: "Tenhle e-mail dřív poslat nejde." }, { status: 400 });
  const error = await sendArrivalNow(id, typeof body.accessCode === "string" ? body.accessCode : undefined);
  return error ? NextResponse.json({ error }, { status: 409 }) : NextResponse.json({ ok: true });
}
