import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, deny } from "@/lib/auth";
import { markGiftPaid, orderDesign, sendGiftVoucher } from "@/lib/gift-server";

// Majitel u objednávky poukazu: { action: "paid" } = platba dorazila (vznikne kód
// a poukaz odejde kupujícímu), "cancel" = zrušit nezaplacenou, "resend" = poslat poukaz znovu,
// "edit" = upravit „Komu“ a věnování, které napsal kupující (volitelně { send: true } = rovnou poslat znovu).

export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return deny(401);
  const order = await prisma.giftOrder.findUnique({ where: { id: (await params).id }, include: { site: true } });
  if (!order) return deny(404);
  if (order.site.ownerId !== user.id) return deny(403);
  const body = (await req.json().catch(() => ({}))) as { action?: string; recipient?: unknown; message?: unknown; send?: boolean };
  const { action } = body;

  if (action === "paid") {
    const r = await markGiftPaid(order.id);
    return "error" in r ? NextResponse.json(r, { status: 409 }) : NextResponse.json(r);
  }
  if (action === "cancel") {
    if (order.status !== "pending") return NextResponse.json({ error: "Zrušit jde jen nezaplacenou objednávku." }, { status: 409 });
    await prisma.giftOrder.update({ where: { id: order.id }, data: { status: "cancelled" } });
    return NextResponse.json({ ok: true });
  }
  if (action === "resend") {
    if (order.status !== "paid" || !order.validTo) return NextResponse.json({ error: "Poukaz ještě není zaplacený." }, { status: 409 });
    const ok = await sendGiftVoucher({ ...order, validTo: order.validTo }, order.site, orderDesign(order));
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "E-mail se nepodařilo odeslat." }, { status: 502 });
  }
  if (action === "edit") {
    if (order.status !== "pending" && order.status !== "paid") return NextResponse.json({ error: "Tenhle poukaz už upravit nejde." }, { status: 409 });
    const recipient = typeof body.recipient === "string" ? body.recipient.trim().replace(/\s+/g, " ").slice(0, 60) : "";
    // Stejné limity jako při objednávce: max. 4 řádky a 140 znaků
    const message = typeof body.message === "string" ? body.message.trim().split("\n").slice(0, 4).join("\n").slice(0, 140) : "";
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(order.design);
    } catch {}
    const design = JSON.stringify({ ...raw, recipient, message });
    const updated = await prisma.giftOrder.update({ where: { id: order.id }, data: { design, recipient, dedication: message } });
    if (body.send && updated.status === "paid" && updated.validTo) {
      const ok = await sendGiftVoucher({ ...updated, validTo: updated.validTo }, order.site, orderDesign(updated));
      if (!ok) return NextResponse.json({ design, recipient, error: "Uloženo, ale e-mail se nepodařilo odeslat." }, { status: 502 });
    }
    return NextResponse.json({ design, recipient });
  }
  return NextResponse.json({ error: "Neznámá akce." }, { status: 400 });
}
