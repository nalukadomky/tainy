import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByBlackoutId, deny } from "@/lib/auth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const guard = await requireOwnerByBlackoutId(id);
  if (!guard.ok) return deny(guard.status);

  await prisma.blackout.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
