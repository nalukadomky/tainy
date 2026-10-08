import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerByReservationId, deny } from "@/lib/auth";
import { blockedRanges, lockSite } from "@/lib/availability";
import { pricedCategories } from "@/lib/pricing";
import { describeCounts, parseCategories, parseCounts } from "@/lib/guests";
import { quoteForSite } from "@/lib/quote";
import { fromISO, isRangeFree, nightsOf, stayTimes, toISO, todayISO } from "@/lib/stay";
import { sendGuestDateChange } from "@/lib/email";
import { discountBase, discountFor } from "@/lib/voucher";

// Změna termínu existující rezervace majitelem.
//   GET                 → obsazenost webu bez této rezervace (pro kalendář v dialogu)
//   GET ?start=&end=    → náhled: volno, nová a původní cena
//   POST                → uložení { start, end, price: "new" | "keep", notify }

const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function load(id: string) {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { site: { include: { priceRules: { orderBy: { startDate: "asc" } } } } },
  });
  if (!reservation) return null;
  const { site } = reservation;
  const categories = pricedCategories({
    guestMode: site.guestMode,
    categories: parseCategories(site.guestCategories, site.pricingMode),
  });
  let raw: unknown = { adult: reservation.guests };
  try {
    if (reservation.guestBreakdown) raw = JSON.parse(reservation.guestBreakdown);
  } catch {
    // starší rezervace bez rozpisu — počítá se jako dospělí
  }
  return { reservation, site, categories, counts: parseCounts(raw, categories) };
}

/** Nová cena podle ceníku včetně voucheru ze snímku rezervace. */
function priceWithVoucher(
  reservation: { voucherCode: string; voucherKind: string; voucherValue: number },
  quote: ReturnType<typeof quoteForSite>
) {
  if (!reservation.voucherCode) return { discount: 0, total: quote.total, voucherWarning: null };
  const r = discountFor(reservation.voucherKind === "czk" ? "czk" : "pct", reservation.voucherValue, discountBase(quote));
  if ("error" in r) {
    return {
      discount: 0,
      total: quote.total,
      voucherWarning: `Voucher ${reservation.voucherCode} na nový termín nejde uplatnit — ${r.error.charAt(0).toLowerCase()}${r.error.slice(1)}`,
    };
  }
  return { discount: r.discount, total: quote.total - r.discount, voucherWarning: null };
}

function badRange(start: string, end: string): string | null {
  if (!ISO.test(start) || !ISO.test(end) || end <= start) return "Vyber příjezd i odjezd.";
  if (nightsOf(start, end) > 60) return "Pobyt může mít nejvýš 60 nocí.";
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnerByReservationId(id);
  if (!guard.ok) return deny(guard.status);
  const data = await load(id);
  if (!data) return deny(404);
  const { reservation, site, counts } = data;

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");

  // Bez termínu: jen obsazenost pro kalendář.
  if (!start || !end) {
    const blocked = await blockedRanges(site.id, todayISO(), prisma, { excludeReservationId: id });
    return NextResponse.json({ blocked, minNights: site.minNights });
  }

  const invalid = badRange(start, end);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const blocked = await blockedRanges(site.id, start, prisma, { excludeReservationId: id });
  const quote = quoteForSite(site, start, end, counts);
  const priced = priceWithVoucher(reservation, quote);
  const nights = nightsOf(start, end);
  return NextResponse.json({
    free: isRangeFree(blocked, start, end),
    nights,
    belowMinNights: nights < site.minNights,
    minNights: site.minNights,
    newTotal: priced.total,
    discount: priced.discount,
    voucherWarning: priced.voucherWarning,
    newNightsTotal: quote.nightsTotal,
    newFeesTotal: quote.feesTotal,
    oldTotal: reservation.totalPrice,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnerByReservationId(id);
  if (!guard.ok) return deny(guard.status);
  const data = await load(id);
  if (!data) return deny(404);
  const { reservation, site, categories, counts } = data;
  if (reservation.status === "cancelled") {
    return NextResponse.json({ error: "Zrušené rezervaci nejde měnit termín." }, { status: 400 });
  }

  const body = await req.json();
  const start = String(body.start ?? "");
  const end = String(body.end ?? "");
  const invalid = badRange(start, end);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const quote = quoteForSite(site, start, end, counts);
  const usePrice = body.price === "new";
  const old = { startDate: toISO(reservation.startDate), endDate: toISO(reservation.endDate) };

  const updated = await prisma.$transaction(async (tx) => {
    // Stejný zámek jako při zakládání rezervace a blokací.
    await lockSite(tx, site.id);
    const blocked = await blockedRanges(site.id, start, tx, { excludeReservationId: id });
    if (!isRangeFree(blocked, start, end)) return null;
    return tx.reservation.update({
      where: { id },
      data: {
        startDate: fromISO(start),
        endDate: fromISO(end),
        ...(usePrice && {
          nightsTotal: quote.nightsTotal,
          feesTotal: quote.feesTotal,
          discount: priceWithVoucher(reservation, quote).discount,
          totalPrice: priceWithVoucher(reservation, quote).total,
        }),
      },
    });
  });
  if (!updated) {
    return NextResponse.json(
      { error: "Nový termín se kryje s jinou rezervací nebo blokací." },
      { status: 409 }
    );
  }

  if (body.notify === true) {
    const paid = updated.status === "paid";
    await sendGuestDateChange(
      {
        publicId: updated.publicId,
        siteName: site.name,
        guestName: updated.guestName,
        firstName: updated.firstName,
        email: updated.email,
        phone: updated.phone,
        guests: updated.guests,
        guestSummary: describeCounts(counts, categories),
        startDate: start,
        endDate: end,
        nights: nightsOf(start, end),
        total: updated.totalPrice,
        discount: updated.discount,
        voucherCode: updated.voucherCode,
        paid,
        demo: updated.source === "demo",
        ...stayTimes(updated, site),
      },
      old,
      paid ? Math.max(0, updated.totalPrice - reservation.totalPrice) : 0
    );
  }

  return NextResponse.json(updated);
}
