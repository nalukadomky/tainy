"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { Logo } from "@/components/Logo";
import { Dropdown } from "@/components/Dropdown";
import { createClient } from "@/lib/supabase/client";

// Navigace administrace:
// - telefon (< 640 px): plovoucí spodní lišta s ikonami, zbytek pod „Více",
// - tablet a počítač: menu v horní liště; když se do ní nevejde, schová se do burgeru.

type Item = { href: string; label: string; icon: IconName };

/** Událost po uložení webu, ať se přepínač nemovitostí v navigaci obnoví. */
export const SITES_CHANGED = "tainy:sites-changed";

// Hlavní položky jsou vidět vždy, ostatní v nabídce „Více".
const MAIN: Item[] = [
  { href: "/admin", label: "Přehled", icon: "home" },
  { href: "/admin/kalendar", label: "Kalendář", icon: "calendar" },
  { href: "/admin/rezervace", label: "Rezervace", icon: "list" },
  { href: "/admin/hoste", label: "Hosté", icon: "users" },
  { href: "/admin/web", label: "Můj web", icon: "web" },
];
const MORE: Item[] = [
  { href: "/admin/kalendar/uklid", label: "Úklid", icon: "broom" },
  { href: "/admin/naklady", label: "Náklady", icon: "receipt" },
  { href: "/admin/vouchery", label: "Vouchery", icon: "ticket" },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [sites, setSites] = useState<{ slug: string; name: string }[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [menu, setMenu] = useState<"more" | "burger" | "mobile" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLElement>(null);

  // Seznam webů načteme jednou a znovu po uložení webu (SITES_CHANGED) — jinak by
  // přepínač po přejmenování nemovitosti ukazoval starý název. Ne při každém
  // přechodu: zbytečný požadavek by zdržoval přepínání sekcí.
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
  }, []);

  // Data administrace se načítají v hooku při mountu, takže přepnutí
  // nemovitosti znamená načíst stránku znovu — jinak by zůstala stará čísla.
  function switchSite(slug: string) {
    localStorage.setItem("tainy.site", slug);
    window.location.reload();
  }
  // Aktivní je nejdelší odpovídající položka (Úklid je pod Kalendářem, svítit má jen Úklid).
  const ALL = [...MAIN, ...MORE].map((i) => i.href);
  const matches = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  const isActive = (href: string) => matches(href) && !ALL.some((h) => h.length > href.length && h.startsWith(href) && matches(h));
  const moreActive = MORE.some((i) => isActive(i.href));

  // Všechny sekce se po otevření administrace přednačtou (i ty schované v „Více"),
  // takže klik mezi nimi nečeká na server. Data si stránky berou z paměti
  // (useAdminData) a obnovují je na pozadí.
  useEffect(() => {
    const hrefs = [...MAIN, ...MORE].map((i) => i.href);
    const warm = () => {
      for (const href of hrefs) router.prefetch(href, { kind: PrefetchKind.FULL });
    };
    const id = "requestIdleCallback" in window ? requestIdleCallback(warm) : setTimeout(warm, 300);
    return () => ("cancelIdleCallback" in window ? cancelIdleCallback(id as number) : clearTimeout(id));
  }, [router]);

  // Nabídky: zavřít po přechodu na jinou stránku, klikem mimo a Esc.
  useEffect(() => setMenu(null), [pathname]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      const inside = (el: HTMLElement | null) => !!el?.contains(e.target as Node);
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !inside(menuRef.current) && !inside(mobileRef.current)) {
        setMenu(null);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  // Burger jen když je to nutné: změříme, kolik místa menu potřebuje
  // (skrytá kopie) a kolik ho v liště je.
  const slotRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const slot = slotRef.current;
    const measure = measureRef.current;
    if (!slot || !measure) return;
    const check = () => setCompact(measure.scrollWidth > slot.clientWidth);
    const ro = new ResizeObserver(check);
    ro.observe(slot);
    ro.observe(measure);
    check();
    return () => ro.disconnect();
  }, [pathname]);

  async function signOut() {
    await createClient().auth.signOut();
    await fetch("/auth/dev", { method: "DELETE" }); // vývojové přihlášení, pokud je
    router.push("/");
    router.refresh();
  }

  // Builder má vlastní horní lištu přes celou obrazovku — navigace by tam jen překážela.
  if (pathname.startsWith("/admin/web/builder")) return null;

  const signOutButton = (
    <button
      type="button"
      onClick={signOut}
      className="whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium text-soft transition hover:bg-line/50 hover:text-ink"
      title="Odhlásit se"
    >
      Odhlásit
    </button>
  );

  // Plné menu do horní lišty (a jeho skrytá kopie pro měření)
  const fullNav = (measuring: boolean) => (
    <>
      {MAIN.map((item) => (
        <NavLink key={item.href} item={item} active={!measuring && isActive(item.href)} tabIndex={measuring ? -1 : undefined} />
      ))}
      <div className="relative" ref={measuring ? undefined : menu === "more" ? menuRef : undefined}>
        <button
          type="button"
          tabIndex={measuring ? -1 : undefined}
          aria-haspopup="menu"
          aria-expanded={!measuring && menu === "more"}
          onClick={() => setMenu((m) => (m === "more" ? null : "more"))}
          className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition ${
            !measuring && moreActive ? "bg-ink text-white" : "text-soft hover:bg-line/50 hover:text-ink"
          }`}
        >
          {!measuring && moreActive ? MORE.find((i) => isActive(i.href))!.label : "Více"} ▾
        </button>
        {!measuring && menu === "more" && (
          <MenuPanel>
            {MORE.map((item) => (
              <MenuLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </MenuPanel>
        )}
      </div>
      {signOutButton}
    </>
  );

  return (
    <>
      {/* Horní lišta */}
      <header data-admin-nav className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <div className="flex shrink-0 items-center gap-3">
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

          {/* Tablet a počítač: menu v liště, nebo burger když se nevejde */}
          <div ref={slotRef} className="relative hidden min-w-0 flex-1 justify-end sm:flex">
            <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute right-0 top-0 flex items-center gap-0.5">
              {fullNav(true)}
            </div>
            {compact ? (
              <div className="relative" ref={menu === "burger" ? menuRef : undefined}>
                <button
                  type="button"
                  aria-label="Menu"
                  aria-haspopup="menu"
                  aria-expanded={menu === "burger"}
                  onClick={() => setMenu((m) => (m === "burger" ? null : "burger"))}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink transition hover:border-pine/40"
                >
                  <Icon name={menu === "burger" ? "close" : "menu"} />
                </button>
                {menu === "burger" && (
                  <MenuPanel wide>
                    {[...MAIN, ...MORE].map((item) => (
                      <MenuLink key={item.href} item={item} active={isActive(item.href)} />
                    ))}
                    <div className="my-1 border-t border-line" />
                    <button
                      type="button"
                      onClick={signOut}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm text-soft transition hover:bg-bg hover:text-ink"
                    >
                      <Icon name="logout" /> Odhlásit
                    </button>
                  </MenuPanel>
                )}
              </div>
            ) : (
              <nav className="flex items-center gap-0.5">{fullNav(false)}</nav>
            )}
          </div>
        </div>
      </header>

      {/* Telefon: plovoucí spodní lišta */}
      <nav
        ref={mobileRef}
        className="fixed inset-x-3 z-40 sm:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        {menu === "mobile" && (
          <div className="rise mb-2 overflow-hidden rounded-2xl border border-line bg-surface/95 p-1.5 shadow-xl backdrop-blur">
            {MORE.map((item) => (
              <MenuLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
            <div className="my-1 border-t border-line" />
            <button
              type="button"
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm text-soft hover:bg-bg hover:text-ink"
            >
              <Icon name="logout" /> Odhlásit
            </button>
          </div>
        )}
        <div className="flex items-stretch justify-between rounded-2xl border border-line/80 bg-surface p-1.5 shadow-[0_8px_30px_rgba(30,42,32,0.12)]">
          {MAIN.map((item) => (
            <TabLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
          <button
            type="button"
            aria-expanded={menu === "mobile"}
            onClick={() => setMenu((m) => (m === "mobile" ? null : "mobile"))}
            className={tabClass(moreActive || menu === "mobile")}
          >
            <Icon name={menu === "mobile" ? "close" : "dots"} />
            <span>Více</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function NavLink({ item, active, tabIndex }: { item: Item; active: boolean; tabIndex?: number }) {
  return (
    <Link
      href={item.href}
      prefetch
      tabIndex={tabIndex}
      className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition ${
        active ? "bg-ink text-white" : "text-soft hover:bg-line/50 hover:text-ink"
      }`}
    >
      {item.label}
    </Link>
  );
}

function MenuPanel({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      role="menu"
      className={`absolute right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lg ${
        wide ? "w-56" : "w-44"
      }`}
    >
      {children}
    </div>
  );
}

function MenuLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      prefetch
      role="menuitem"
      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition hover:bg-bg ${
        active ? "bg-pine/10 font-semibold text-pine" : "text-ink"
      }`}
    >
      <Icon name={item.icon} />
      {item.label}
    </Link>
  );
}

const tabClass = (active: boolean) =>
  `flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[10.5px] font-medium transition ${
    active ? "bg-pine/10 text-pine" : "text-soft active:bg-line/50"
  }`;

function TabLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link href={item.href} prefetch aria-current={active ? "page" : undefined} className={tabClass(active)}>
      <Icon name={item.icon} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

// Jednotné kreslené ikony (místo emoji, které každý systém kreslí jinak)
type IconName = "home" | "calendar" | "list" | "users" | "web" | "broom" | "receipt" | "ticket" | "dots" | "menu" | "close" | "logout";
const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M4 20V10M20 20V10" />
      <path d="M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  list: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
      <path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M17.5 14.8c2 .7 3.4 2.5 3.9 5.2" />
    </>
  ),
  web: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  broom: (
    <>
      <path d="M14.5 3.5 10 12" />
      <path d="M6.5 13h7l2.5 7.5H4z" />
      <path d="M8 17v3.5M12 17v3.5" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  ticket: (
    <>
      <path d="M3.5 7.5a2 2 0 0 0 2-2h13a2 2 0 0 0 2 2v3a2 2 0 0 0 0 3v3a2 2 0 0 0-2 2h-13a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-3z" />
      <path d="M14 7v10" strokeDasharray="2 2" />
    </>
  ),
  dots: (
    <>
      <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  logout: (
    <>
      <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </>
  ),
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      {PATHS[name]}
    </svg>
  );
}
