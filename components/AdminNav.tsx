"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Dropdown } from "@/components/Dropdown";
import { createClient } from "@/lib/supabase/client";

type Item = { href: string; label: string; icon: string };

/** Událost po uložení webu, ať se přepínač nemovitostí v navigaci obnoví. */
export const SITES_CHANGED = "tainy:sites-changed";

// Hlavní položky jsou vidět vždy, ostatní v nabídce „Více“ (na mobilu i na počítači).
const MAIN: Item[] = [
  { href: "/admin", label: "Přehled", icon: "📊" },
  { href: "/admin/kalendar", label: "Kalendář", icon: "📅" },
  { href: "/admin/rezervace", label: "Rezervace", icon: "🗓️" },
  { href: "/admin/hoste", label: "Hosté", icon: "🧳" },
  { href: "/admin/web", label: "Můj web", icon: "🏡" },
];
const MORE: Item[] = [
  { href: "/admin/naklady", label: "Náklady", icon: "🧾" },
  { href: "/admin/vouchery", label: "Vouchery", icon: "🎟️" },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [sites, setSites] = useState<{ slug: string; name: string }[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLElement>(null);

  // Seznam webů obnovíme po každém přechodu a po uložení webu — jinak by
  // přepínač po přejmenování nemovitosti ukazoval starý název.
  useEffect(() => {
    const load = () => {
      setCurrent(localStorage.getItem("tainy.site") ?? "");
      fetch("/api/sites")
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => setSites(Array.isArray(list) ? list : []))
        .catch(() => {});
    };
    load();
    window.addEventListener(SITES_CHANGED, load);
    return () => window.removeEventListener(SITES_CHANGED, load);
  }, [pathname]);

  // Data administrace se načítají v hooku při mountu, takže přepnutí
  // nemovitosti znamená načíst stránku znovu — jinak by zůstala stará čísla.
  function switchSite(slug: string) {
    localStorage.setItem("tainy.site", slug);
    window.location.reload();
  }
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  // Nabídka „Více“: zavřít po přechodu na jinou stránku, klikem mimo a Esc.
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      const inside = (el: HTMLElement | null) => !!el?.contains(e.target as Node);
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !inside(moreRef.current) && !inside(mobileRef.current)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [moreOpen]);
  const moreActive = MORE.some((i) => isActive(i.href));

  async function signOut() {
    await createClient().auth.signOut();
    await fetch("/auth/dev", { method: "DELETE" }); // vývojové přihlášení, pokud je
    router.push("/");
    router.refresh();
  }

  // Builder má vlastní horní lištu přes celou obrazovku — navigace by tam jen překážela.
  if (pathname.startsWith("/admin/web/builder")) return null;

  return (
    <>
      {/* Horní lišta */}
      <header data-admin-nav className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
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
            <nav className="hidden items-center gap-0.5 lg:flex">
              {MAIN.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
              <div ref={moreRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((o) => !o)}
                  className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition ${
                    moreActive ? "bg-ink text-white" : "text-soft hover:bg-line/50 hover:text-ink"
                  }`}
                >
                  {moreActive ? MORE.find((i) => isActive(i.href))!.label : "Více"} ▾
                </button>
                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-1.5 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg"
                  >
                    {MORE.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        className={`flex items-center gap-2.5 px-3.5 py-2 text-sm transition hover:bg-bg ${
                          isActive(item.href) ? "font-semibold text-pine" : "text-ink"
                        }`}
                      >
                        <span aria-hidden>{item.icon}</span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
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

      {/* Mobilní spodní navigace: hlavní položky + „Více“ s ostatními */}
      <nav ref={mobileRef} className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        {moreOpen && (
          <div className="border-b border-line px-3 py-2">
            <div className="grid grid-cols-3 gap-2">
              {MORE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-medium ${
                    isActive(item.href) ? "bg-pine/10 text-pine" : "bg-bg text-ink"
                  }`}
                >
                  <span className="text-xl leading-none">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-6">
          {MAIN.map((item) => (
            <MobileLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${
              moreActive || moreOpen ? "text-pine" : "text-soft"
            }`}
          >
            <span className="text-lg leading-none">{moreOpen ? "✕" : "⋯"}</span>
            Více
          </button>
        </div>
      </nav>
    </>
  );
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition ${
        active ? "bg-ink text-white" : "text-soft hover:bg-line/50 hover:text-ink"
      }`}
    >
      {item.label}
    </Link>
  );
}

function MobileLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${active ? "text-pine" : "text-soft"}`}
    >
      <span className={`text-lg leading-none ${active ? "" : "grayscale opacity-70"}`}>{item.icon}</span>
      {item.label}
    </Link>
  );
}
