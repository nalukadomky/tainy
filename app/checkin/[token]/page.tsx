import type { Metadata } from "next";
import Link from "next/link";
import { guestView, resolveCheckin } from "@/lib/guestbook-server";
import { nightsOf, toISO } from "@/lib/stay";
import { plural } from "@/lib/pricing";
import { CheckinForm } from "@/components/CheckinForm";

// Online check-in hosta (odkaz z e-mailu a ze stránky rezervace).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Check-in — tainy",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const fmt = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}.`;
};

export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await resolveCheckin(token);

  if (!r)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-5">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl font-semibold">Odkaz na check-in neplatí</h1>
          <p className="mt-2 text-soft">Možná už pobyt skončil, nebo ubytovatel poslal nový odkaz. Napiš mu prosím.</p>
        </div>
      </div>
    );

  const start = toISO(r.startDate);
  const end = toISO(r.endDate);
  const nights = nightsOf(start, end);
  const slots = await guestView(r);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line/70 bg-cream">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-5 py-3.5 md:max-w-4xl">
          <Link href={`/r/${r.publicId}`} className="font-display text-lg font-semibold tracking-tight">
            {r.site.name}
          </Link>
          <span className="text-sm text-soft">
            {fmt(start)}–{fmt(end)} · {nights} {plural(nights, "noc", "noci", "nocí")}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-5 py-8 md:max-w-4xl md:py-10">
        <CheckinForm token={token} slots={slots} guestName={r.guestName} arrival={start} />
      </main>
    </div>
  );
}
