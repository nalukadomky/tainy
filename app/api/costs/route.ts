import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);
  const costs = await prisma.cost.findMany({
    where: { siteId: guard.site.id },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(costs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const guard = await requireSiteOwnerBySlug(String(body.site ?? ""));
  if (!guard.ok) return deny(guard.status);
  const site = guard.site;
  const amount = Number(body.amount);
  if (!body.label || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Chybí položka nebo částka." }, { status: 400 });
  }
  const cost = await prisma.cost.create({
    data: {
      siteId: site.id,
      label: String(body.label),
      amount: Math.round(amount),
      category: String(body.category ?? "provoz"),
      date: body.date ? new Date(String(body.date)) : new Date(),
    },
  });
  return NextResponse.json(cost, { status: 201 });
}
