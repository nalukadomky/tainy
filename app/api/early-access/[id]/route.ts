import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, deny } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/early-access";

// Správa žádostí o přístup: označit jako pozvaný (nebo zrušit označení).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!isPlatformAdmin(user)) return deny(404);
  const { invited } = (await req.json().catch(() => ({}))) as { invited?: boolean };
  const row = await prisma.earlyAccessRequest
    .update({ where: { id: (await params).id }, data: { invitedAt: invited ? new Date() : null }, select: { id: true, invitedAt: true } })
    .catch(() => null);
  return row ? NextResponse.json(row) : deny(404);
}
