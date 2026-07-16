import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });
  const site = await prisma.site.findUnique({ where: { slug } });
  if (!site) return NextResponse.json({ error: "Web nenalezen." }, { status: 404 });
  const costs = await prisma.cost.findMany({
    where: { siteId: site.id },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(costs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const site = await prisma.site.findUnique({ where: { slug: String(body.site ?? "") } });
  if (!site) return NextResponse.json({ error: "Web nenalezen." }, { status: 404 });
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
