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
import { EmbedClose } from "@/components/EmbedClose";
import { EmbedHeight } from "@/components/EmbedHeight";
import { Icon } from "@/components/Icon";

// Objednávka dárkového poukazu: před zaplacením QR platba, po zaplacení
// hotový poukaz s kódem (k vytištění / poslání dál). Odkaz zná jen kupující.
// ?embed=1 = objednávka z widgetu na webu majitele (stránka je v okně nad ním).

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dárkový poukaz", robots: { index: false, follow: false } };

const date = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
};

export default async function GiftOrderPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string }> }) {
  const token = (await params).token;
  const embedParam = (await searchParams).embed;
  const embed = embedParam === "1" || embedParam === "sekce";
  // ?embed=sekce = objednávka ze sekce přímo ve stránce majitele (bez křížku, výška podle obsahu)
  const inline = embedParam === "sekce";
  // Jen podle tajného klíče — krátké číslo objednávky jde uhodnout
  const order = token.length >= 20 ? await prisma.giftOrder.findUnique({ where: { accessToken: token }, include: { site: true } }) : null;
  if (!order) notFound();
  const { site } = order;
  const d = orderDesign(order);
  const paid = order.status === "paid";
  const payment = order.status === "pending" && site.bankAccount ? buildPayment(site.bankAccount, order.price, site.name, order.publicId) : null;
  const qr = payment ? await paymentQrDataUrl(payment) : null;
  // Bez webu v tainy (jen widget) vede rezervace na samostatnou stránku s rezervací
  const web = site.widgetOnly ? null : siteUrl(site);
  const bookUrl = embed || !web ? `/embed/${site.slug}${inline ? "?inline=1" : ""}` : `${web}#rezervace`;

  return (
    <div className={`${inline ? "" : "min-h-dvh "}bg-cream print:bg-white`} style={themeVars(site.themeColor, site.surfaceTone) as React.CSSProperties}>
      {inline && <EmbedHeight />}
      <header className="border-b border-line/70 bg-cream print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
          {web && !embed ? (
            <a href={web} className="font-display text-xl font-semibold tracking-tight">
              {site.name}
            </a>
          ) : (
            <span className="min-w-0 truncate font-display text-xl font-semibold tracking-tight">{site.name}</span>
          )}
          {embed ? (
            <div className="flex shrink-0 items-center gap-2">
              <a href={`/embed/${site.slug}?tab=poukaz${inline ? "&inline=1" : ""}`} className="text-sm font-medium text-soft hover:text-ink">
                ← Poukazy
              </a>
              {!inline && <EmbedClose />}
            </div>
          ) : (
            <span className="text-sm text-soft">Objednávka {orderLabel(order.publicId)}</span>
          )}
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
            <a href={bookUrl} className="btn-ghost">
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
        <main className="mx-auto max-w-5xl px-5 py-10">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pine text-white">
              <Icon name="checkCircle" size={24} />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-semibold tracking-tight">Díky, {greetingName(order.buyerName.split(" ")[0])}!</h1>
              <p className="mt-1 text-soft">
                Objednávka poukazu <strong className="text-ink">{orderLabel(order.publicId)}</strong> je přijatá. Jakmile ji zaplatíš, pošleme
                poukaz na <strong className="text-ink">{order.buyerEmail}</strong>.
              </p>
            </div>
          </div>

          <div className="mt-8 grid items-start gap-6 md:grid-cols-2">
            {/* Co si kupuje: náhled poukazu (kód doplníme po zaplacení) a shrnutí */}
            <div className="space-y-4">
              <GiftVoucherCard d={d} site={site.name} />
              <dl className="space-y-2 rounded-2xl border border-line bg-surface p-5 text-sm">
                {[
                  ["Poukaz", giftHeadline(d)],
                  ...(order.recipient ? [["Komu", order.recipient]] : []),
                  ["Platí", `${d.validMonths} měsíců od zaplacení`],
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

            {/* Jak to bude dál: tři kroky, první rozbalený (platba QR kódem, nebo domluva s ubytovatelem) */}
            <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <h2 className="font-display text-xl font-semibold">Jak to bude dál</h2>
              <ol className="mt-5">
                {[
                  {
                    title: payment ? "Zaplať převodem" : "Domluvíte se na platbě",
                    body:
                      payment && qr ? (
                        <>
                          <p>Načti QR kód v bankovní aplikaci — částka i variabilní symbol se doplní samy.</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qr} alt="QR kód pro platbu" width={200} height={200} className="mt-3 h-44 w-44 rounded-xl border border-line bg-white" />
                          <dl className="mt-3 space-y-1.5">
                            {[
                              ["Účet", formatIBAN(payment.iban)],
                              ["Variabilní symbol", payment.vs],
                              ["Částka", czk(order.price)],
                            ].map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-4">
                                <dt>{k}</dt>
                                <dd className="text-right font-mono text-xs text-ink sm:text-sm">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      ) : (
                        <p>
                          Ubytovatel se ti ozve na <strong className="text-ink">{order.buyerEmail}</strong> a domluvíte se, jak poukaz zaplatit.
                        </p>
                      ),
                  },
                  { title: "Ubytovatel platbu potvrdí", body: <p>Obvykle do pár dnů od připsání na účet.</p> },
                  { title: "Po zaplacení ti přijde poukaz", body: <p>E-mailem, s kódem — připravený k vytištění nebo poslání dál.</p> },
                ].map((step, i, all) => (
                  <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < all.length - 1 && <span className="absolute left-[15px] top-9 bottom-1 w-px bg-line" aria-hidden />}
                    <span
                      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        i === 0 ? "bg-pine text-white" : "bg-line/70 text-soft"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className={`font-semibold ${i === 0 ? "text-ink" : "text-soft"}`}>{step.title}</p>
                      <div className="mt-1 text-sm leading-relaxed text-soft">{step.body}</div>
                    </div>
                  </li>
                ))}
              </ol>
              {site.contactEmail && (
                <p className="mt-6 border-t border-line pt-4 text-sm text-soft">
                  Dotazy: <span className="font-medium text-ink">{site.contactEmail}</span>
                  {site.contactPhone && <> · {site.contactPhone}</>}
                </p>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
