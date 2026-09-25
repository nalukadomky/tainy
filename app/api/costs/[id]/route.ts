import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByCostId, deny } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const guard = await requireOwnerByCostId(id);
  if (!guard.ok) return deny(guard.status);

  try {
    await prisma.cost.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Náklad nenalezen." }, { status: 404 });
  }
}

// Ukončení opakovaného nákladu: { endDate: "YYYY-MM-DD" }, obnovení: { endDate: null }.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const guard = await requireOwnerByCostId(id);
  if (!guard.ok) return deny(guard.status);

  const body = await req.json();
  const endDate = body.endDate === null ? null : new Date(String(body.endDate));
  if (endDate && Number.isNaN(+endDate)) {
    return NextResponse.json({ error: "Neplatné datum." }, { status: 400 });
  }
  const cost = await prisma.cost.update({ where: { id }, data: { endDate } });
  return NextResponse.json(cost);
}
