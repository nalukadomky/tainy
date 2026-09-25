"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Dropdown } from "@/components/Dropdown";
import { createClient } from "@/lib/supabase/client";

const ITEMS = [
  { href: "/admin", label: "Přehled", icon: "📊" },
  { href: "/admin/rezervace", label: "Rezervace", icon: "🗓️" },
  { href: "/admin/hoste", label: "Hosté", icon: "🧳" },
  { href: "/admin/naklady", label: "Náklady", icon: "🧾" },
  { href: "/admin/web", label: "Můj web", icon: "🏡" },
  { href: "/admin/asistent", label: "Asistent", icon: "🎙️", ai: true },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [sites, setSites] = useState<{ slug: string; name: string }[]>([]);
  const [current, setCurrent] = useState<string>("");

  useEffect(() => {
    setCurrent(localStorage.getItem("tainy.site") ?? "");
    fetch("/api/sites")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setSites(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, []);

  // Data administrace se načítají v hooku při mountu, takže přepnutí
  // nemovitosti znamená načíst stránku znovu — jinak by zůstala stará čísla.
  function switchSite(slug: string) {
    localStorage.setItem("tainy.site", slug);
    window.location.reload();
  }
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  async function signOut() {
    await createClient().auth.signOut();
    await fetch("/auth/dev", { method: "DELETE" }); // vývojové přihlášení, pokud je
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {/* Horní lišta */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <Logo className="text-xl" />
            {sites.length > 1 ? (
              <Dropdown
                label="Nemovitost"
                size="sm"
                value={current || sites[0]?.slug}
                onChange={switchSite}
                items={sites.map((s) => ({ value: s.slug, label: s.name }))}
              />
            ) : (
              <span className="rounded-full bg-line/60 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-soft">
                Administrace
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Desktop navigace */}
            <nav className="hidden items-center gap-1 sm:flex">
              {ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                    isActive(item.href)
                      ? "bg-ink text-white"
                      : "text-soft hover:bg-line/50 hover:text-ink"
                  } ${item.ai && !isActive(item.href) ? "ai-chip !text-ink" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <button
              type="button"
              onClick={signOut}
              className="ml-1 rounded-full px-3.5 py-2 text-sm font-medium text-soft transition hover:bg-line/50 hover:text-ink"
              title="Odhlásit se"
            >
              Odhlásit
            </button>
          </div>
        </div>
      </header>

      {/* Mobilní spodní navigace */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur sm:hidden">
        <div className="grid grid-cols-6">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${
                isActive(item.href) ? "text-pine" : "text-soft"
              }`}
            >
              <span className={`text-lg leading-none ${isActive(item.href) ? "" : "grayscale opacity-70"}`}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
