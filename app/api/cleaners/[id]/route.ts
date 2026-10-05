import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByCleanerId, deny } from "@/lib/auth";
import { newCleanerToken, readPay } from "@/lib/cleaning-server";

// Úprava uklízečky: jméno, platba, aktivní, nový odkaz (starý přestane fungovat).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnerByCleanerId(id);
  if (!guard.ok) return deny(guard.status);
  const body = await req.json();

  const data: { name?: string; payMode?: string; rate?: number; active?: boolean; token?: string } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 60);
    if (!name) return NextResponse.json({ error: "Jméno nesmí být prázdné." }, { status: 400 });
    data.name = name;
  }
  if (body.payMode !== undefined || body.rate !== undefined) {
    Object.assign(data, readPay({ payMode: body.payMode ?? guard.cleaner.payMode, rate: body.rate ?? guard.cleaner.rate }));
  }
  if (typeof body.active === "boolean") data.active = body.active;
  if (body.newLink === true) data.token = newCleanerToken();

  const cleaner = await prisma.cleaner.update({
    where: { id },
    data,
    include: { _count: { select: { cleanings: true } } },
  });
  return NextResponse.json(cleaner);
}

// Smazat jde jen uklízečku bez úklidů — jinak by zmizela historie; tu jde jen deaktivovat.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnerByCleanerId(id);
  if (!guard.ok) return deny(guard.status);
  const count = await prisma.cleaning.count({ where: { cleanerId: id } });
  if (count > 0) {
    return NextResponse.json({ error: "Tenhle člen personálu už má úklidy — můžeš ho jen deaktivovat." }, { status: 409 });
  }
  await prisma.cleaner.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
