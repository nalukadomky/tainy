import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { periodRange } from "@/lib/guestbook";
import { isIsoDate } from "@/lib/stay";

// „Odvedeno obci“: kolik a kdy majitel za období poplatek z pobytu odvedl.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  const body = (await req.json().catch(() => ({}))) as { period?: string; amount?: unknown; paidAt?: unknown; note?: unknown };
  const period = String(body.period ?? "");
  if (!periodRange(period)) return NextResponse.json({ error: "Neznámé období." }, { status: 400 });
  const amount = Math.max(0, Math.min(10_000_000, Math.round(Number(body.amount) || 0)));
  const paidAt = isIsoDate(body.paidAt) ? body.paidAt : new Date().toISOString().slice(0, 10);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  const data = { amount, paidAt: new Date(`${paidAt}T00:00:00.000Z`), note };
  await prisma.taxRemittance.upsert({
    where: { siteId_period: { siteId: guard.site.id, period } },
    create: { siteId: guard.site.id, period, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true, remittance: { amount, paidAt, note } });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  const period = req.nextUrl.searchParams.get("period") ?? "";
  await prisma.taxRemittance.deleteMany({ where: { siteId: guard.site.id, period } });
  return NextResponse.json({ ok: true });
}
