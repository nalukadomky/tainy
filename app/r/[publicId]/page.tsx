import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { czk, plural } from "@/lib/pricing";
import { nightsOf, stayTimes, toISO } from "@/lib/stay";
import { greetingName } from "@/lib/vocative";
import { describeCounts, parseCategories, parseCounts } from "@/lib/guests";
import { pricedCategories } from "@/lib/pricing";
import { buildPayment, formatIBAN } from "@/lib/payment";
import { paymentQrDataUrl } from "@/lib/payment-qr";
import { Wordmark } from "@/components/Logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tvoje rezervace — tainy",
  robots: { index: false, follow: false },
};

function fmt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const reservation = await prisma.reservation.findUnique({
    where: { publicId },
    include: { site: true },
  });
  if (!reservation) notFound();

  const { site } = reservation;
  const times = stayTimes(reservation, site);
  const startIso = toISO(reservation.startDate);
  const endIso = toISO(reservation.endDate);
  const nights = nightsOf(startIso, endIso);

  // Skladba hostů, pokud ji web rozlišuje — jinak zůstane prosté číslo.
  const categories = pricedCategories({
    guestMode: site.guestMode,
    categories: parseCategories(site.guestCategories, site.pricingMode),
  });
  let skladba = "";
  try {
    skladba = reservation.guestBreakdown
      ? describeCounts(parseCounts(JSON.parse(reservation.guestBreakdown), categories), categories)
      : "";
  } catch {
    skladba = "";
  }
  const ukazkova = reservation.source === "demo";

  const expired =
    reservation.status === "pending" &&
    reservation.expiresAt !== null &&
    reservation.expiresAt.getTime() < Date.now();

  // QR platba se nabízí, jen dokud rezervace platí a majitel má vyplněný účet.
  const payment =
    reservation.status === "pending" && !expired && site.bankAccount
      ? buildPayment(site.bankAccount, reservation.totalPrice, site.name, reservation.publicId)
      : null;
  const qr = payment ? await paymentQrDataUrl(payment) : null;

  const state = expired
    ? { label: "Vypršelo", style: "bg-line/60 text-soft" }
    : {
        pending: { label: "Čeká na platbu", style: "bg-amber/15 text-[#92600a]" },
        paid: { label: "Zaplaceno", style: "bg-pine/10 text-pine" },
        cancelled: { label: "Zrušeno", style: "bg-line/60 text-soft line-through" },
      }[reservation.status] ?? { label: reservation.status, style: "bg-line/60 text-soft" };

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line/70 bg-cream">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-3.5">
          <Link href={`/w/${site.slug}`} className="font-display text-lg font-semibold tracking-tight">
            {site.name}
          </Link>
          <span className="flex items-center gap-2">
            {ukazkova && (
              <span className="rounded-full bg-amber/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#92600a]">
                ukázková platba
              </span>
            )}
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${state.style}`}>
              {state.label}
            </span>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-5 py-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {reservation.status === "cancelled"
              ? "Rezervace byla zrušena"
              : expired
                ? "Rezervace vypršela"
                : `Díky, ${greetingName(reservation.guestName)}!`}
          </h1>
          <p className="mt-1.5 text-soft">
            {reservation.status === "cancelled" || expired ? (
              <>
                Termín je zase volný.{" "}
                <Link href={`/w/${site.slug}#rezervace`} className="underline decoration-line underline-offset-4 hover:text-ink">
                  Zkusit jiný termín
                </Link>
              </>
            ) : (
              <>Kód rezervace <strong className="text-ink">{reservation.publicId}</strong></>
            )}
          </p>
        </div>

        {/* Shrnutí pobytu */}
        <div className="rounded-2xl border border-line bg-surface p-5">
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-soft">Termín</dt>
              <dd className="text-right font-medium">
                {fmt(startIso)} – {fmt(endIso)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-soft">Délka</dt>
              <dd className="text-right">
                {nights} {plural(nights, "noc", "noci", "nocí")}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-soft">Hosté</dt>
              <dd className="text-right">{skladba || reservation.guests}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-soft">Příjezd / odjezd</dt>
              <dd className="text-right">
                od {times.checkInTime} / do {times.checkOutTime}
              </dd>
            </div>
          </dl>

          <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between gap-4 text-soft">
              <dt>
                Ubytování ({nights} {plural(nights, "noc", "noci", "nocí")})
              </dt>
              <dd>{czk(reservation.nightsTotal)}</dd>
            </div>
            {reservation.feesTotal > 0 && (
              <div className="flex justify-between gap-4 text-soft">
                <dt>Poplatky (úklid, poplatek z pobytu)</dt>
                <dd>{czk(reservation.feesTotal)}</dd>
              </div>
            )}
            {reservation.discount > 0 && (
              <div className="flex justify-between gap-4 text-pine">
                <dt>Sleva (voucher {reservation.voucherCode})</dt>
                <dd>−{czk(reservation.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-line pt-2 font-display text-lg font-semibold">
              <dt>Celkem</dt>
              <dd>{czk(reservation.totalPrice)}</dd>
            </div>
          </dl>
        </div>

        {/* Platební údaje */}
        {payment && qr && (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Zaplať převodem</h2>
            <p className="mt-1 text-sm text-soft">
              Načti QR kód v bankovní aplikaci — částka i variabilní symbol se doplní samy.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt="QR kód pro platbu"
              width={200}
              height={200}
              className="mx-auto mt-4 h-50 w-50 rounded-xl border border-line"
            />
            <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-soft">Účet</dt>
                <dd className="text-right font-mono text-xs">{formatIBAN(payment.iban)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-soft">Variabilní symbol</dt>
                <dd className="text-right font-mono">{payment.vs}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-soft">Částka</dt>
                <dd className="text-right font-semibold">{czk(reservation.totalPrice)}</dd>
              </div>
            </dl>
            {reservation.expiresAt && (
              <p className="mt-4 rounded-xl bg-amber/15 px-4 py-2.5 text-xs font-medium text-[#92600a]">
                Termín držíme do {reservation.expiresAt.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}.
                Po zaplacení ti majitel rezervaci potvrdí.
              </p>
            )}
          </div>
        )}

        {reservation.status === "pending" && !expired && !payment && (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Co bude dál</h2>
            <p className="mt-1.5 text-sm text-soft">
              Majitel se ti ozve a domluvíte se na platbě i předání klíčů.
            </p>
          </div>
        )}

        {/* Kontakt na majitele */}
        {(site.contactEmail || site.contactPhone) && (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-display text-lg font-semibold">Kontakt na majitele</h2>
            <div className="mt-2 space-y-1 text-sm text-soft">
              {site.contactEmail && (
                <p>
                  ✉️{" "}
                  <a className="underline decoration-line underline-offset-4 hover:text-ink" href={`mailto:${site.contactEmail}`}>
                    {site.contactEmail}
                  </a>
                </p>
              )}
              {site.contactPhone && <p>📞 {site.contactPhone}</p>}
            </div>
          </div>
        )}

        {site.cancellationPolicy && (
          <p className="px-1 text-xs text-soft">
            <strong className="text-ink">Storno podmínky:</strong> {site.cancellationPolicy}
          </p>
        )}

        <p className="pt-2 text-center text-sm text-soft">
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-ink">
            vytvořeno s <Wordmark className="text-base" />
          </Link>
        </p>
      </main>
    </div>
  );
}
