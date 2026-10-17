import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Wordmark } from "@/components/Logo";
import { OptOutForm } from "./OptOutForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Odhlášení z nabídek — tainy",
  robots: { index: false, follow: false },
};

// Odhlášení z nabídek dalšího pobytu. Samotné otevření nic nemění (odkazy v e-mailech
// otevírají i antiviry) — host potvrdí tlačítkem.
export default async function OptOutPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const r = await prisma.reservation.findUnique({
    where: { publicId },
    select: { email: true, offersOptOutAt: true, site: { select: { name: true } } },
  });
  if (!r || !r.email.trim()) notFound();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-7 text-center">
        <OptOutForm publicId={publicId} site={r.site.name} email={r.email} optedOut={!!r.offersOptOutAt} />
        <p className="mt-8 text-xs text-soft">
          Rezervace přes <Wordmark className="inline text-xs" />
        </p>
      </div>
    </main>
  );
}
