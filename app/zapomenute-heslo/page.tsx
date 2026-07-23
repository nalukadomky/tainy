"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/auth/update-password`,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setSent(true);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10">
      <header className="flex items-center justify-between py-5">
        <Logo className="text-xl" />
        <Link href="/login" className="text-sm text-soft hover:text-ink">
          Zpět na přihlášení
        </Link>
      </header>

      <div className="flex flex-1 flex-col justify-center">
        {sent ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pine/10 text-2xl">
              ✉️
            </div>
            <h1 className="mt-4 font-display text-2xl font-semibold">Zkontroluj e-mail</h1>
            <p className="mt-2 text-soft">
              Na <strong className="text-ink">{email}</strong> jsme poslali odkaz pro nastavení
              nového hesla.
            </p>
          </div>
        ) : (
          <>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Zapomenuté heslo</h1>
            <p className="mt-2 mb-7 text-soft">
              Zadej svůj e-mail a pošleme ti odkaz pro nastavení nového hesla.
            </p>
            <form onSubmit={submit} className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">E-mail</span>
                <input
                  className="field"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="ty@email.cz"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {error && (
                <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? "Odesílám…" : "Poslat odkaz"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
