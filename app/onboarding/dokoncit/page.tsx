"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

// Jediné místo „vytvoř web po přihlášení" — funguje pro e-mail i OAuth.
// Nepřihlášeného pošle na registraci, přihlášenému vytvoří web z draftu.
export default function FinalizePage() {
  const router = useRouter();
  const ran = useRef(false);
  const [msg, setMsg] = useState("Dokončuji tvůj web…");

  useEffect(() => {
    if (ran.current) return; // guard proti dvojímu běhu (StrictMode)
    ran.current = true;

    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/register?next=/onboarding/dokoncit");
        return;
      }

      const raw = localStorage.getItem("tainy.draft");
      if (!raw) {
        router.replace("/admin");
        return;
      }

      try {
        const res = await fetch("/api/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: raw, // ownerId doplní server ze session
        });
        const data = await res.json();
        if (!res.ok) {
          setMsg(data.error ?? "Web se nepodařilo vytvořit. Zkus to prosím znovu.");
          return;
        }
        localStorage.setItem("tainy.site", data.slug);
        localStorage.removeItem("tainy.draft");
        router.replace("/admin?vitej=1");
      } catch {
        setMsg("Web se nepodařilo vytvořit. Zkontroluj připojení a zkus to znovu.");
      }
    })();
  }, [router]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-5 text-center">
      <Logo className="text-2xl" />
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-pine" />
      <p className="text-soft">{msg}</p>
    </div>
  );
}
