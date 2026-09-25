import Link from "next/link";
import { Wordmark } from "@/components/Logo";

// Lišta nad ukázkovým webem (/w/demo): návštěvník z úvodní stránky
// se má kam vrátit a rovnou vidí cestu k vlastnímu webu.

export function DemoBar() {
  return (
    <div className="bg-pine-dark text-cream">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-5 py-2 text-sm">
        <Link href="/" className="inline-flex items-center gap-2 opacity-90 hover:opacity-100">
          <span aria-hidden>←</span>
          <span>
            Zpět na <Wordmark className="text-base" />
          </span>
        </Link>
        <span className="hidden opacity-70 sm:inline">Prohlížíš ukázkový web</span>
        <Link href="/onboarding" className="font-semibold underline-offset-4 hover:underline">
          Vytvořit vlastní →
        </Link>
      </div>
    </div>
  );
}
