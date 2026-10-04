import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { toISO } from "@/lib/stay";
import { parseVoucherInput } from "@/lib/voucher-server";

// Správa voucherů majitelem: seznam (s použitím) a založení nového.

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);
  const siteId = guard.site.id;

  const [vouchers, used] = await Promise.all([
    prisma.voucher.findMany({ where: { siteId }, orderBy: { createdAt: "desc" } }),
    prisma.reservation.findMany({
      where: { siteId, voucherCode: { not: "" }, status: { not: "cancelled" } },
      select: { id: true, publicId: true, guestName: true, startDate: true, endDate: true, discount: true, voucherCode: true, status: true },
      orderBy: { startDate: "desc" },
    }),
  ]);

  return NextResponse.json(
    vouchers.map((v) => {
      const reservations = used.filter((r) => r.voucherCode === v.code);
      return {
        ...v,
        validFrom: v.validFrom ? toISO(v.validFrom) : null,
        validTo: v.validTo ? toISO(v.validTo) : null,
        uses: reservations.length,
        discountTotal: reservations.reduce((s, r) => s + r.discount, 0),
        reservations: reservations.map((r) => ({
          ...r,
          startDate: toISO(r.startDate),
          endDate: toISO(r.endDate),
        })),
      };
    })
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const guard = await requireSiteOwnerBySlug(String(body.site ?? ""));
  if (!guard.ok) return deny(guard.status);

  const parsed = parseVoucherInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const voucher = await prisma.voucher.create({
      data: { ...(parsed.data as Prisma.VoucherUncheckedCreateInput), siteId: guard.site.id },
    });
    return NextResponse.json(voucher, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Voucher s tímhle kódem už máš." }, { status: 409 });
    }
    throw e;
  }
}
