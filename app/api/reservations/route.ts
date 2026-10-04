import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pricedCategories } from "@/lib/pricing";
import { quoteForSite } from "@/lib/quote";
import { applyVoucher } from "@/lib/voucher";
import { findVoucher } from "@/lib/voucher-server";
import { capacityCount, describeCounts, parseCategories, parseCounts } from "@/lib/guests";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { blockedRanges, lockSite } from "@/lib/availability";
import { fromISO, isRangeFree, newPublicId, nightsOf, todayISO, toISO, validateStay } from "@/lib/stay";
import { demoPaymentsEnabled } from "@/lib/demo";
import { sendGuestConfirmation, sendOwnerNotification, type StayMail } from "@/lib/email";

// Jak dlouho držíme nezaplacenou rezervaci, než termín zase uvolní.
const HOLD_HOURS = { qr: 24, onsite: 72, demo: 0 } as const;
type PaymentMethod = keyof typeof HOLD_HOURS;

// Seznam rezervací (obsahuje osobní údaje hostů) — jen pro vlastníka webu.
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("site");
  if (!slug) return NextResponse.json({ error: "Chybí parametr site." }, { status: 400 });
  const guard = await requireSiteOwnerBySlug(slug);
  if (!guard.ok) return deny(guard.status);
  const reservations = await prisma.reservation.findMany({
    where: { siteId: guard.site.id },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(reservations);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const site = await prisma.site.findUnique({
    where: { slug: String(body.site ?? "") },
    include: { priceRules: { orderBy: { startDate: "asc" } } },
  });
  if (!site) return NextResponse.json({ error: "Web nenalezen." }, { status: 404 });

  const startIso = String(body.startDate ?? "").slice(0, 10);
  const endIso = String(body.endDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) {
    return NextResponse.json({ error: "Neplatný termín pobytu." }, { status: 400 });
  }

  // Skladba hostů — bere se jen to, co má web opravdu zapnuté.
  const categories = pricedCategories({
    guestMode: site.guestMode,
    categories: parseCategories(site.guestCategories, site.pricingMode),
  });
  // Starší klient posílá `guests` jako číslo; bereme ho jako počet dospělých.
  const counts = parseCounts(
    typeof body.guests === "number" ? { adult: body.guests } : body.guests,
    categories
  );

  // Pravidla pobytu (min. noci, nejdřívější příjezd, kapacita) — stejná
  // kontrola jako ve widgetu, ale tady je autoritativní.
  const invalid = validateStay(
    {
      minNights: site.minNights,
      leadTimeDays: site.leadTimeDays,
      maxGuests: site.maxGuests,
      categories,
    },
    startIso,
    endIso,
    counts
  );
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const guestName = String(body.guestName ?? "").trim();
  const email = String(body.email ?? "").trim();
  if (guestName.length < 3 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Chybí jméno nebo platný e-mail hosta." }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ error: "Bez souhlasu se zpracováním údajů nelze rezervaci dokončit." }, { status: 400 });
  }

  // Ukázkovou platbu smí přijmout jen server, kde je povolená — jinak by
  // stačilo poslat payment: "demo" a rezervace by byla zaplacená zdarma.
  // Bez čísla účtu majitele nemá QR platba co nabídnout, pak platí delší lhůta.
  const demo = body.payment === "demo" && demoPaymentsEnabled();
  const payment: PaymentMethod = demo ? "demo" : body.payment === "qr" && site.bankAccount ? "qr" : "onsite";

  // Cena se počítá vždy na serveru — noc po noci podle ceníku webu, plus poplatky.
  const quote = quoteForSite(site, startIso, endIso, counts);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      // Zámek na dobu transakce: dvě souběžné rezervace stejného webu
      // se serializují, takže nemohou obě projít kontrolou obsazenosti.
      await lockSite(tx, site.id);

      const blocked = await blockedRanges(site.id, startIso, tx);
      if (!isRangeFree(blocked, startIso, endIso)) {
        throw new ConflictError("Termín je již obsazený. Zkuste jiné datum.");
      }

      // Voucher se ověřuje pod stejným zámkem — poslední použití nezíská víc hostů najednou.
      let voucher = { voucherCode: "", voucherKind: "", voucherValue: 0, discount: 0 };
      if (typeof body.voucherCode === "string" && body.voucherCode.trim()) {
        const found = await findVoucher(site.id, body.voucherCode, tx);
        if (!found) throw new VoucherError("Tenhle kód voucheru neznáme.");
        const applied = applyVoucher(found.rule, found.uses, quote, todayISO());
        if ("error" in applied) throw new VoucherError(applied.error);
        voucher = {
          voucherCode: found.rule.code,
          voucherKind: found.rule.kind,
          voucherValue: found.rule.value,
          discount: applied.discount,
        };
      }

      return tx.reservation.create({
        data: {
          publicId: newPublicId(),
          siteId: site.id,
          guestName,
          email,
          phone: String(body.phone ?? "").trim(),
          guests: capacityCount(counts, categories),
          guestBreakdown: JSON.stringify(counts),
          startDate: fromISO(startIso),
          endDate: fromISO(endIso),
          nightsTotal: quote.nightsTotal,
          feesTotal: quote.feesTotal,
          totalPrice: quote.total - voucher.discount,
          ...voucher,
          note: String(body.note ?? "").trim().slice(0, 500),
          source: demo ? "demo" : "web",
          status: demo ? "paid" : "pending",
          expiresAt: demo ? null : new Date(Date.now() + HOLD_HOURS[payment] * 3_600_000),
          // Časy pobytu platné v době rezervace — pozdější změna v ceníku je nezmění.
          checkInTime: site.checkInTime,
          checkOutTime: site.checkOutTime,
        },
      });
    });
  } catch (e) {
    if (e instanceof ConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof VoucherError) {
      return NextResponse.json({ error: e.message, field: "voucher" }, { status: 400 });
    }
    throw e;
  }

  // E-maily až po commitu — jejich selhání nesmí shodit hotovou rezervaci.
  const mail: StayMail = {
    publicId: created.publicId,
    siteName: site.name,
    guestName: created.guestName,
    email: created.email,
    phone: created.phone,
    guests: created.guests,
    guestSummary: describeCounts(counts, categories),
    startDate: startIso,
    endDate: endIso,
    nights: nightsOf(startIso, endIso),
    total: created.totalPrice,
    discount: created.discount,
    voucherCode: created.voucherCode,
    paid: created.status === "paid",
    demo,
    checkInTime: created.checkInTime,
    checkOutTime: created.checkOutTime,
  };
  await Promise.all([sendGuestConfirmation(mail), sendOwnerNotification(mail, site.contactEmail)]);

  return NextResponse.json(
    { publicId: created.publicId, total: created.totalPrice, status: created.status },
    { status: 201 }
  );
}

class ConflictError extends Error {}
class VoucherError extends Error {}
