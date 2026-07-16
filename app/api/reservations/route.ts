import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { quoteStay, type PricingMode } from "@/lib/pricing";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });
  const site = await prisma.site.findUnique({ where: { slug } });
  if (!site) return NextResponse.json({ error: "Web nenalezen." }, { status: 404 });
  const reservations = await prisma.reservation.findMany({
    where: { siteId: site.id },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(reservations);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const site = await prisma.site.findUnique({
    where: { slug: String(body.site ?? "") },
    include: { priceRules: true },
  });
  if (!site) return NextResponse.json({ error: "Web nenalezen." }, { status: 404 });

  const start = new Date(String(body.startDate));
  const end = new Date(String(body.endDate));
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "Neplatný termín pobytu." }, { status: 400 });
  }
  const guests = Number(body.guests ?? 1);
  if (guests < 1 || guests > site.maxGuests) {
    return NextResponse.json({ error: `Počet hostů musí být 1–${site.maxGuests}.` }, { status: 400 });
  }
  if (!body.guestName || !body.email) {
    return NextResponse.json({ error: "Chybí jméno nebo e-mail hosta." }, { status: 400 });
  }

  // Kontrola kolize s existující (nezrušenou) rezervací
  const overlap = await prisma.reservation.findFirst({
    where: {
      siteId: site.id,
      status: { not: "cancelled" },
      startDate: { lt: end },
      endDate: { gt: start },
    },
  });
  if (overlap) {
    return NextResponse.json({ error: "Termín je již obsazený. Zkuste jiné datum." }, { status: 409 });
  }

  // Cena se počítá vždy na serveru — noc po noci podle ceníku webu
  const { total } = quoteStay(
    {
      pricePerNight: site.pricePerNight,
      pricingMode: site.pricingMode as PricingMode,
      weekendPct: site.weekendPct,
      priceRules: site.priceRules.map((r) => ({
        label: r.label,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate.toISOString(),
        pct: r.pct,
      })),
    },
    String(body.startDate),
    String(body.endDate),
    guests
  );

  const reservation = await prisma.reservation.create({
    data: {
      siteId: site.id,
      guestName: String(body.guestName),
      email: String(body.email),
      phone: String(body.phone ?? ""),
      guests,
      startDate: start,
      endDate: end,
      totalPrice: total,
      status: body.paid ? "paid" : "pending",
    },
  });
  return NextResponse.json(reservation, { status: 201 });
}
