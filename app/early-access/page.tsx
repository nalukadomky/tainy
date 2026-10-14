import Link from "next/link";
import { Logo } from "@/components/Logo";
import { EarlyAccessForm } from "@/components/landing/EarlyAccessForm";

// Žádost o přístup — sem vede registrace a průvodce, dokud není tainy veřejné.
export const metadata = { title: "Early access · tainy" };

const SOURCES = ["register", "onboarding", "import"];

export default async function EarlyAccessPage({ searchParams }: { searchParams: Promise<{ z?: string }> }) {
  const z = (await searchParams).z;
  const source = z && SOURCES.includes(z) ? z : "landing";
  return (
    <div className="flex min-h-dvh flex-col bg-[#f3e7cf] px-5 text-[#14261b]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between py-5">
        <Logo className="text-2xl" />
        <Link href="/" className="text-sm text-[#14261b]/60 hover:text-[#14261b]">
          Zpět na web
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center pb-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2c5e3f]">Early access</p>
        <h1 className="mt-4 text-balance font-display text-4xl font-semibold tracking-tight sm:text-6xl">
          tainy spouštíme <em className="font-normal text-[#2c5e3f]">postupně</em>
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-lg text-[#14261b]/70">
          Registrace zatím není veřejná. Zapiš se a pošleme ti přístup, jakmile na tebe přijde řada. Prvním uživatelům první měsíc zdarma.
        </p>
        <div className="mt-9">
          <EarlyAccessForm source={source} />
        </div>
        <p className="mt-10 text-sm text-[#14261b]/60">
          Už máš účet?{" "}
          <Link href="/login" className="font-medium text-[#2c5e3f] underline-offset-2 hover:underline">
            Přihlásit se
          </Link>
        </p>
      </main>
    </div>
  );
}
