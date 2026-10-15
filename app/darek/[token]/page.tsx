import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { themeVars } from "@/lib/theme";
import { czk } from "@/lib/pricing";
import { buildPayment, formatIBAN } from "@/lib/payment";
import { paymentQrDataUrl } from "@/lib/payment-qr";
import { siteUrl } from "@/lib/domains";
import { giftLink, orderDesign, orderLabel } from "@/lib/gift-server";
import { giftHeadline } from "@/lib/gift";
import { toISO } from "@/lib/stay";
import { greetingName } from "@/lib/vocative";
import { GiftVoucherCard } from "@/components/GiftVoucherCard";
import { PrintButton } from "@/components/PrintButton";

// Objednávka dárkového poukazu: před zaplacením QR platba, po zaplacení
// hotový poukaz s kódem (k vytištění / poslání dál). Odkaz zná jen kupující.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dárkový poukaz", robots: { index: false, follow: false } };

const date = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
};

export default async function GiftOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  // Jen podle tajného klíče — krátké číslo objednávky jde uhodnout
  const order = token.length >= 20 ? await prisma.giftOrder.findUnique({ where: { accessToken: token }, include: { site: true } }) : null;
  if (!order) notFound();
  const { site } = order;
  const d = orderDesign(order);
  const paid = order.status === "paid";
  const payment = order.status === "pending" && site.bankAccount ? buildPayment(site.bankAccount, order.price, site.name, order.publicId) : null;
  const qr = payment ? await paymentQrDataUrl(payment) : null;
  const web = siteUrl(site);

  return (
    <div className="min-h-dvh bg-cream print:bg-white" style={themeVars(site.themeColor, site.surfaceTone) as React.CSSProperties}>
      <header className="border-b border-line/70 bg-cream print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
          <a href={web} className="font-display text-xl font-semibold tracking-tight">
            {site.name}
          </a>
          <span className="text-sm text-soft">Objednávka {orderLabel(order.publicId)}</span>
        </div>
      </header>

      {paid ? (
        <main className="mx-auto max-w-3xl px-5 py-10 print:p-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight print:hidden">Dárkový poukaz je připravený</h1>
          <p className="mt-1.5 text-soft print:hidden">Vytiskni ho, nebo pošli tenhle odkaz dál.</p>
          <div className="mt-6 print:mt-0">
            <GiftVoucherCard d={d} site={site.name} code={order.code} validTo={order.validTo ? toISO(order.validTo) : null} qrUrl={giftLink(order.accessToken)} />
          </div>
          <div className="mt-6 flex flex-wrap gap-3 print:hidden">
            <PrintButton />
            <a href={`${web}#rezervace`} className="btn-ghost">
              Rezervovat pobyt s poukazem
            </a>
          </div>
          <p className="mt-5 text-sm text-soft print:hidden">
            Kód <strong className="text-ink">{order.code}</strong> zadej při rezervaci na webu {site.name}.{" "}
            {d.kind === "weekend" ? "Platí na víkend pá–ne; v dražším termínu se doplácí rozdíl." : `Odečte se ${czk(d.value)} z ceny pobytu.`}
            {order.validTo && ` Platí do ${date(toISO(order.validTo))}.`}
          </p>
        </main>
      ) : order.status === "cancelled" ? (
        <main className="mx-auto max-w-xl px-5 py-20 text-center">
          <h1 className="font-display text-2xl font-semibold">Objednávka byla zrušena</h1>
          <p className="mt-2 text-soft">Pokud jde o omyl, napiš prosím ubytovateli{site.contactEmail ? ` na ${site.contactEmail}` : ""}.</p>
        </main>
      ) : (
        <main className="mx-auto grid max-w-5xl gap-6 px-5 py-10 md:grid-cols-2">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Díky, {greetingName(order.buyerName.split(" ")[0])}!</h1>
            <p className="mt-1.5 text-soft">
              Objednávka poukazu <strong className="text-ink">{orderLabel(order.publicId)}</strong>
            </p>
            <div className="mt-5 rounded-2xl border border-line bg-surface p-5">
              <dl className="space-y-2 text-sm">
                {[
                  ["Poukaz", giftHeadline(d)],
                  ...(order.recipient ? [["Pro", order.recipient]] : []),
                  ["Platí", `${d.validMonths} měsíců od zaplacení`],
                  ["Poukaz pošleme na", order.buyerEmail],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-soft">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t border-line pt-2 text-base">
                  <dt className="font-semibold">Celkem</dt>
                  <dd className="font-semibold">{czk(order.price)}</dd>
                </div>
              </dl>
            </div>
            <ol className="mt-5 space-y-3 text-sm">
              {["Zaplať převodem přes QR kód", "Ubytovatel platbu potvrdí", "Poukaz ti přijde e-mailem"].map((t, i) => (
                <li key={t} className="flex items-center gap-3">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-pine text-white" : "bg-line/70 text-soft"}`}>{i + 1}</span>
                  <span className={i === 0 ? "font-medium" : "text-soft"}>{t}</span>
                </li>
              ))}
            </ol>
          </div>
          {payment && qr ? (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="font-display text-lg font-semibold">Zaplať převodem</h2>
              <p className="mt-1 text-sm text-soft">Načti QR kód v bankovní aplikaci — částka i variabilní symbol se doplní samy.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR kód pro platbu" width={200} height={200} className="mx-auto mt-4 h-48 w-48 rounded-xl border border-line" />
              <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
                {[
                  ["Účet", formatIBAN(payment.iban)],
                  ["Variabilní symbol", payment.vs],
                  ["Částka", czk(order.price)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-soft">{k}</dt>
                    <dd className="text-right font-mono text-xs sm:text-sm">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="font-display text-lg font-semibold">Co bude dál</h2>
              <p className="mt-1.5 text-sm text-soft">Ubytovatel se ti ozve a domluvíte se na platbě. Po zaplacení ti poukaz přijde e-mailem.</p>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
