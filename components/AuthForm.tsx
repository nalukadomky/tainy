"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Sdílený formulář pro přihlášení i registraci: Google OAuth + e-mail/heslo.
// Registrace běží bez potvrzení e-mailu, takže signUp rovnou vrátí session.

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34Z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58Z" />
  </svg>
);

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const next = useSearchParams().get("next") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleGoogle() {
    setGoogleLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(googleErr(error.message));
      setGoogleLoading(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();

    if (isRegister) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) return fail(error.message);
      if (data.session) {
        // Potvrzení e-mailu je vypnuté → rovnou přihlášen
        router.push(next);
        router.refresh();
      } else if (data.user && data.user.identities && data.user.identities.length === 0) {
        // Prázdné identities = e-mail už je registrovaný
        fail("Tento e-mail už je registrovaný. Zkus se přihlásit.");
      } else {
        // Potvrzení e-mailu je zapnuté → čekáme na klik v e-mailu
        setLoading(false);
        setCheckEmail(true);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return fail("Nesprávný e-mail nebo heslo.");
      router.push(next);
      router.refresh();
    }
  }

  function fail(msg: string) {
    setError(msg);
    setLoading(false);
  }

  if (checkEmail) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pine/10 text-2xl">
          ✉️
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold">Zkontroluj e-mail</h2>
        <p className="mt-2 text-soft">
          Na <strong className="text-ink">{email}</strong> jsme poslali potvrzovací odkaz. Klikni
          na něj a dokončíme založení tvého webu.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading || loading}
        className="flex w-full items-center justify-center gap-2.5 rounded-full border border-line bg-surface py-3 text-sm font-semibold text-ink transition hover:border-pine/40 disabled:opacity-60"
      >
        <GoogleIcon />
        {googleLoading ? "Přesměrovávám…" : "Pokračovat přes Google"}
      </button>

      <div className="flex items-center gap-3 text-xs text-soft">
        <span className="h-px flex-1 bg-line" />
        nebo e-mailem
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleEmail} className="space-y-3">
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
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Heslo</span>
          <input
            className="field"
            type="password"
            required
            minLength={6}
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder={isRegister ? "alespoň 6 znaků" : "••••••••"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{error}</p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading || googleLoading}>
          {loading ? "Moment…" : isRegister ? "Vytvořit účet" : "Přihlásit se"}
        </button>
      </form>

      {!isRegister && (
        <p className="text-center text-sm text-soft">
          <Link href="/zapomenute-heslo" className="hover:text-ink">
            Zapomenuté heslo?
          </Link>
        </p>
      )}

      <p className="text-center text-sm text-soft">
        {isRegister ? "Už máš účet? " : "Nemáš účet? "}
        <Link
          href={`${isRegister ? "/login" : "/register"}?next=${encodeURIComponent(next)}`}
          className="font-semibold text-pine hover:underline"
        >
          {isRegister ? "Přihlas se" : "Zaregistruj se"}
        </Link>
      </p>
    </div>
  );
}

function googleErr(msg: string): string {
  if (/provider is not enabled/i.test(msg)) {
    return "Přihlášení přes Google zatím není nastavené (Supabase → Providers → Google).";
  }
  return msg;
}
