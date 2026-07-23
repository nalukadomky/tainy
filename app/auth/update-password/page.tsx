"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

// Sem uživatel dorazí po kliknutí na odkaz z e-mailu (recovery session je aktivní).
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10">
      <header className="py-5">
        <Logo className="text-xl" />
      </header>
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Nové heslo</h1>
        <p className="mt-2 mb-7 text-soft">Zvol si nové heslo ke svému účtu.</p>
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Nové heslo</span>
            <input
              className="field"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="alespoň 6 znaků"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Ukládám…" : "Nastavit heslo"}
          </button>
        </form>
      </div>
    </div>
  );
}
