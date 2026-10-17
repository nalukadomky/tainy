import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Odhlášení z nabídek dalšího pobytu (odkaz v patičce komerčního e-mailu → /odhlasit/<publicId>).
// Platí pro hosta (e-mail) u celého ubytování, ne jen pro jednu rezervaci.
// Tajný je kód rezervace — stejný jako v odkazu na rezervaci /r/<publicId>.
export async function POST(req: NextRequest) {
  const { publicId, back } = (await req.json().catch(() => ({}))) as { publicId?: string; back?: boolean };
  const r = await prisma.reservation.findUnique({ where: { publicId: String(publicId ?? "") }, select: { siteId: true, email: true } });
  if (!r || !r.email.trim()) return NextResponse.json({ error: "Odkaz už neplatí." }, { status: 404 });
  const where = { siteId: r.siteId, email: { equals: r.email.trim(), mode: "insensitive" as const } };
  // back = host si to rozmyslel a nabídky chce zase dostávat
  await prisma.reservation.updateMany({ where, data: { offersOptOutAt: back ? null : new Date() } });
  return NextResponse.json({ ok: true });
}
