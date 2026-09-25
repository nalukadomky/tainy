import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AuthForm } from "@/components/AuthForm";
import { devLoginEmail, devLoginEnabled } from "@/lib/dev-login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

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

        {devLoginEnabled() && (
          <form
            method="post"
            action={`/auth/dev?next=${encodeURIComponent(next || "/admin")}`}
            className="mb-6 rounded-2xl border border-dashed border-amber bg-amber/10 p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-[#92600a]">Jen při vývoji</p>
            <button type="submit" className="btn-primary mt-3 w-full">
              ⚡ Přihlásit jedním klikem
            </button>
            <p className="mt-2 text-center text-xs text-soft">jako {devLoginEmail()}, bez hesla</p>
          </form>
        )}

        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </div>
  );
}
