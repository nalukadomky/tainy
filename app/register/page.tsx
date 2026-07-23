import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AuthForm } from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10">
      <header className="flex items-center justify-between py-5">
        <Logo className="text-xl" />
        <Link href="/" className="text-sm text-soft hover:text-ink">
          Zavřít ✕
        </Link>
      </header>

      <div className="flex flex-1 flex-col justify-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Vytvoř si účet</h1>
        <p className="mt-2 mb-7 text-soft">
          Pár vteřin a máš přístup do svého prostředí — správa webu, rezervací i výdělků.
        </p>

        <Suspense>
          <AuthForm mode="register" />
        </Suspense>

        <p className="mt-6 text-center text-xs text-soft">
          Registrací souhlasíš s podmínkami služby a zpracováním údajů.
        </p>
      </div>
    </div>
  );
}
