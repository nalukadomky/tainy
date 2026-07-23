import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10">
      <header className="flex items-center justify-between py-5">
        <Logo className="text-xl" />
        <Link href="/" className="text-sm text-soft hover:text-ink">
          Zavřít ✕
        </Link>
      </header>

      <div className="flex flex-1 flex-col justify-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Vítej zpět</h1>
        <p className="mt-2 mb-7 text-soft">Přihlas se do svého prostředí tainy.</p>

        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </div>
  );
}
