import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { siteWhere } from "@/lib/demo";
import { themeVars } from "@/lib/theme";
import { hasDoc } from "@/lib/legal";
import { offerDesign } from "@/lib/gift-server";
import { GiftShop } from "@/components/GiftShop";

// Dárkové poukazy na webu ubytování: nabídka a objednávka.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const site = await prisma.site.findFirst({ where: siteWhere((await params).slug), select: { name: true } });
  return site ? { title: `Dárkové poukazy — ${site.name}` } : {};
}

export default async function GiftsPage({ params }: { params: Promise<{ slug: string }> }) {
  const site = await prisma.site.findFirst({ where: siteWhere((await params).slug), include: { giftOffers: { where: { onSale: true }, orderBy: { createdAt: "asc" } } } });
  if (!site || site.widgetOnly) notFound();
  const onDomain = !!site.customDomain && site.domainStatus === "active";
  const base = onDomain ? "" : `/${site.slug}`;

  return (
    <div className="min-h-dvh bg-cream" style={themeVars(site.themeColor, site.surfaceTone) as React.CSSProperties}>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 lg:px-8">
          <a href={base || "/"} className="font-display text-xl font-semibold tracking-tight">
            {site.name}
          </a>
          <a href={`${base || "/"}#rezervace`} className="btn-primary !px-5 !py-2 text-sm">
            Rezervovat
          </a>
        </div>
      </header>
      {site.giftOffers.length ? (
        <GiftShop
          siteName={site.name}
          base={base}
          hasTerms={hasDoc(site, "terms")}
          hasPrivacy={hasDoc(site, "privacy")}
          offers={site.giftOffers.map((o) => ({ ...offerDesign(o), id: o.id }))}
        />
      ) : (
        <main className="mx-auto max-w-xl px-5 py-20 text-center">
          <h1 className="font-display text-2xl font-semibold">Dárkové poukazy teď nenabízíme</h1>
          <p className="mt-2 text-soft">Zkus to prosím později, nebo nám napiš.</p>
        </main>
      )}
    </div>
  );
}
