import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RichText } from "@/components/RichText";
import { Wordmark } from "@/components/Logo";
import { LEGAL_TITLE, privacyTextOf, providerLine, termsTextOf, type LegalKind } from "@/lib/legal";

// Veřejná stránka obchodních podmínek / zásad ochrany osobních údajů webu
// (/w/[slug]/podminky, /w/[slug]/ochrana-udaju). Text, nebo PDF s náhledem.

export async function legalDocMetadata(slug: string, kind: LegalKind) {
  const site = await prisma.site.findUnique({ where: { slug }, select: { name: true } });
  return { title: `${LEGAL_TITLE[kind]} — ${site?.name || "tainy"}` };
}

export async function LegalDocPage({ slug, kind }: { slug: string; kind: LegalKind }) {
  const site = await prisma.site.findUnique({
    where: { slug },
    select: {
      name: true,
      businessName: true,
      businessId: true,
      vatId: true,
      businessAddress: true,
      businessRegister: true,
      contactEmail: true,
      contactPhone: true,
      // pro výchozí obchodní podmínky
      checkInTime: true,
      checkOutTime: true,
      maxGuests: true,
      minNights: true,
      cleaningFee: true,
      touristTax: true,
      cancellationPolicy: true,
      bankAccount: true,
      guestMode: true,
      guestCategories: true,
      pricingMode: true,
      vatPayer: true,
      vatRate: true,
      termsText: true,
      termsPdf: true,
      termsUpdatedAt: true,
      privacyText: true,
      privacyPdf: true,
      privacyUpdatedAt: true,
    },
  });
  if (!site) notFound();
  const doc =
    kind === "terms"
      ? {
          text: termsTextOf(site),
          pdf: site.termsPdf,
          updatedAt: site.termsText.trim() || site.termsPdf ? site.termsUpdatedAt : null,
        }
      : // Bez vlastního znění platí výchozí zásady z údajů provozovatele
        {
          text: privacyTextOf(site),
          pdf: site.privacyPdf,
          updatedAt: site.privacyText.trim() || site.privacyPdf ? site.privacyUpdatedAt : null,
        };
  if (!doc.pdf && !doc.text.trim()) notFound();

  const provider = providerLine(site);
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link href={`/w/${slug}`} className="text-sm font-medium text-soft hover:text-ink">
            ← {site.name || "Zpět na web"}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{LEGAL_TITLE[kind]}</h1>
        <div className="mt-3 space-y-1 text-sm text-soft">
          {provider && <p>Provozovatel: {provider}</p>}
          {site.businessRegister && <p>{site.businessRegister}</p>}
          {doc.updatedAt && (
            <p>
              Platné od{" "}
              {doc.updatedAt.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Europe/Prague" })}
            </p>
          )}
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-surface p-5 sm:p-8">
          {doc.pdf ? (
            <div className="space-y-4">
              <a href={doc.pdf} target="_blank" rel="noopener" className="btn-primary inline-flex">
                Otevřít PDF
              </a>
              {/* Vložený náhled jen na větších obrazovkách — telefony PDF v rámečku neumí celé zobrazit */}
              <iframe
                src={doc.pdf}
                title={LEGAL_TITLE[kind]}
                className="hidden h-[75vh] w-full rounded-xl border border-line sm:block"
              />
            </div>
          ) : (
            <RichText text={doc.text} />
          )}
        </div>
      </main>

      <footer className="mx-auto flex max-w-3xl justify-end px-5 pb-10 text-sm text-soft">
        <Link href="/" className="inline-flex items-center gap-1.5 hover:text-ink">
          vytvořeno s <Wordmark className="text-base" />
        </Link>
      </footer>
    </div>
  );
}
