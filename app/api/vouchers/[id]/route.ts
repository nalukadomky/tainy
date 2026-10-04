import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOwnerByVoucherId, deny } from "@/lib/auth";
import { parseVoucherInput, voucherUses } from "@/lib/voucher-server";

// Úprava a smazání voucheru. Použitý voucher nejde smazat ani přejmenovat —
// rezervace na jeho kód odkazují; jde ho jen vypnout.

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnerByVoucherId(id);
  if (!guard.ok) return deny(guard.status);

  const parsed = parseVoucherInput(await req.json(), true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { voucher } = guard;
  if (parsed.data.code && parsed.data.code !== voucher.code && (await voucherUses(voucher.siteId, voucher.code)) > 0) {
    return NextResponse.json({ error: "Použitému voucheru nejde změnit kód." }, { status: 400 });
  }

  try {
    const updated = await prisma.voucher.update({ where: { id }, data: parsed.data });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Voucher s tímhle kódem už máš." }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnerByVoucherId(id);
  if (!guard.ok) return deny(guard.status);

  const { voucher } = guard;
  if ((await voucherUses(voucher.siteId, voucher.code)) > 0) {
    return NextResponse.json(
      { error: "Voucher už někdo použil — místo smazání ho vypni, ať zůstane historie." },
      { status: 400 }
    );
  }
  await prisma.voucher.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
