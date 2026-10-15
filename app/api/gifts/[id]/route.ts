import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, deny } from "@/lib/auth";
import { cleanGift } from "@/lib/gift";

// Úprava / skrytí / smazání poukazu z nabídky. Prodané poukazy zůstávají (mají vlastní snímek).

async function guard(id: string) {
  const user = await getUser();
  if (!user) return { error: deny(401) };
  const offer = await prisma.giftOffer.findUnique({ where: { id }, include: { site: { select: { ownerId: true } } } });
  if (!offer) return { error: deny(404) };
  if (offer.site.ownerId !== user.id) return { error: deny(403) };
  return { offer };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard((await params).id);
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => ({}))) as { design?: unknown; onSale?: unknown };
  const data = {
    ...(body.design !== undefined && cleanGift(body.design)),
    ...(typeof body.onSale === "boolean" && { onSale: body.onSale }),
  };
  const offer = await prisma.giftOffer.update({ where: { id: g.offer.id }, data });
  return NextResponse.json(offer);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard((await params).id);
  if ("error" in g) return g.error;
  await prisma.giftOffer.delete({ where: { id: g.offer.id } });
  return NextResponse.json({ ok: true });
}
