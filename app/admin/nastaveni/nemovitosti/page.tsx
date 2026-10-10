"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { czk, plural } from "@/lib/pricing";
import { themeHex } from "@/lib/theme";
import { slugify, slugProblem } from "@/lib/site-slug";
import { useToast } from "@/components/Toast";
import { Skeleton } from "@/components/Skeleton";
import { SITES_CHANGED } from "@/components/AdminNav";

// Nastavení → Nemovitosti: všechny nemovitosti účtu v kartách — otevřít,
// upravit web, přejmenovat a změnit adresu, duplikovat, smazat, přidat další.

type Property = {
  slug: string;
  name: string;
  propertyType: string;
  themeColor: string;
  photo: string;
  upcoming: number;
  reservations: number;
  revenueYear: number;
};

const currentSlug = () => {
  try {
    return localStorage.getItem("tainy.site") ?? "";
  } catch {
    return "";
  }
};

export default function PropertiesPage() {
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = useState<Property[] | null>(null);
  const [current, setCurrent] = useState("");
  const [renaming, setRenaming] = useState<Property | null>(null);
  const [deleting, setDeleting] = useState<Property | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/sites/overview").catch(() => null);
    const data = await res?.json().catch(() => null);
    if (Array.isArray(data)) setList(data);
    else toast.show("Nemovitosti se nepodařilo načíst.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCurrent(currentSlug());
    load();
  }, [load]);

  /** Přepne nemovitost (data administrace se načtou znovu) a otevře danou stránku. */
  function open(slug: string, to: string) {
    localStorage.setItem("tainy.site", slug);
    window.location.href = to;
  }

  async function duplicate(p: Property) {
    setDuplicating(p.slug);
    const res = await fetch(`/api/sites/${p.slug}/duplicate`, { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setDuplicating(null);
    if (!res?.ok) return toast.show(data?.error ?? "Duplikace se nepovedla.");
    toast.show(`Vytvořeno: ${data.name}. Uprav ho podle nové nemovitosti.`, "success");
    window.dispatchEvent(new Event(SITES_CHANGED));
    load();
  }

  function renamed(old: Property, next: { name: string; slug: string }) {
    setList((l) => (l ?? []).map((x) => (x.slug === old.slug ? { ...x, ...next } : x)));
    if (current === old.slug && next.slug !== old.slug) {
      localStorage.setItem("tainy.site", next.slug);
      setCurrent(next.slug);
    }
    window.dispatchEvent(new Event(SITES_CHANGED));
  }

  function deleted(p: Property) {
    const rest = (list ?? []).filter((x) => x.slug !== p.slug);
    setList(rest);
    toast.show(`Nemovitost ${p.name} je smazaná.`, "success");
    if (current === p.slug && rest[0]) {
      // Smazaná byla otevřená — přepnout na jinou (načte data znovu)
      open(rest[0].slug, "/admin/nastaveni/nemovitosti");
      return;
    }
    window.dispatchEvent(new Event(SITES_CHANGED));
  }

  return (
    <div className="space-y-6">
      {toast.node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/admin/nastaveni" className="text-sm text-soft hover:text-ink">
            ← Nastavení
          </Link>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Nemovitosti</h1>
          <p className="mt-1 text-sm text-soft">Každá nemovitost má vlastní web, rezervace a nastavení.</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/onboarding?nova=1")}
          className="btn-primary !px-5 !py-2.5 text-sm"
        >
          + Přidat nemovitost
        </button>
      </div>

      {list === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <Skeleton className="h-36 w-full rounded-none" />
              <div className="space-y-2 p-5">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map((p) => (
            <PropertyCard
              key={p.slug}
              p={p}
              active={p.slug === current}
              busy={duplicating === p.slug}
              onOpen={() => open(p.slug, "/admin")}
              onEditWeb={() => open(p.slug, "/admin/web/builder")}
              onSettings={() => open(p.slug, "/admin/nastaveni")}
              onRename={() => setRenaming(p)}
              onDuplicate={() => duplicate(p)}
              onDelete={() => (list.length > 1 ? setDeleting(p) : toast.show("Poslední nemovitost účtu smazat nejde."))}
            />
          ))}
          <button
            type="button"
            onClick={() => router.push("/onboarding?nova=1")}
            className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-soft transition hover:border-pine/40 hover:text-ink"
          >
            <span className="text-3xl leading-none">+</span>
            <span className="font-semibold">Přidat nemovitost</span>
            <span className="text-xs">Krátký průvodce, pak úprava přímo ve webu</span>
          </button>
        </div>
      )}

      {renaming && (
        <RenameDialog
          p={renaming}
          onClose={() => setRenaming(null)}
          onDone={(n) => {
            renamed(renaming, n);
            setRenaming(null);
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          p={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            deleted(deleting);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function PropertyCard({
  p,
  active,
  busy,
  onOpen,
  onEditWeb,
  onSettings,
  onRename,
  onDuplicate,
  onDelete,
}: {
  p: Property;
  active: boolean;
  busy: boolean;
  onOpen: () => void;
  onEditWeb: () => void;
  onSettings: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
  const color = themeHex(p.themeColor);

  return (
    <div
      className={`flex flex-col rounded-2xl border bg-surface ${active ? "border-pine/50 ring-2 ring-pine/15" : "border-line"}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative block overflow-hidden rounded-t-2xl text-left"
        style={{ height: 144 }}
      >
        {p.photo ? (
          <Image src={p.photo} alt="" fill sizes="(min-width: 640px) 50vw, 100vw" className="object-cover" />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center font-display text-5xl font-semibold text-white"
            style={{ background: color }}
          >
            {p.name.charAt(0).toUpperCase()}
          </span>
        )}
        {active && (
          <span className="absolute left-3 top-3 rounded-full bg-surface/95 px-2.5 py-1 text-[11px] font-semibold text-pine shadow-sm">
            Právě otevřená
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-semibold">{p.name}</p>
            <p className="truncate text-sm text-soft">
              {p.propertyType} · tainy.cz/w/{p.slug}
            </p>
          </div>
          <div ref={ref} className="relative shrink-0">
            <button
              type="button"
              aria-label={`Další akce — ${p.name}`}
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
              className="-mr-2 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-soft transition hover:bg-bg hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <circle cx="5.5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="18.5" cy="12" r="1.6" />
              </svg>
            </button>
            {menu && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-1 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-lg"
              >
                {[
                  { label: "Přejmenovat a adresa webu", run: onRename },
                  { label: busy ? "Duplikuji…" : "Duplikovat", run: onDuplicate },
                  { label: "Nastavení nemovitosti", run: onSettings },
                  { label: "Smazat nemovitost", run: onDelete, danger: true },
                ].map((i) => (
                  <button
                    key={i.label}
                    role="menuitem"
                    type="button"
                    disabled={busy && i.run === onDuplicate}
                    onClick={() => {
                      setMenu(false);
                      i.run();
                    }}
                    className={`flex w-full rounded-xl px-3 py-2 text-left text-sm transition hover:bg-bg ${i.danger ? "text-coral" : "text-ink"}`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            [String(p.upcoming), plural(p.upcoming, "nadcházející", "nadcházející", "nadcházejících")],
            [String(p.reservations), plural(p.reservations, "rezervace", "rezervace", "rezervací")],
            [czk(p.revenueYear), "tržby letos"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-xl bg-bg px-2 py-2.5">
              <p className="truncate font-semibold tabular-nums">{v}</p>
              <p className="truncate text-[11px] text-soft">{l}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={onOpen} className="btn-primary !px-4 !py-2 text-sm">
            {active ? "Přehled" : "Otevřít"}
          </button>
          <button type="button" onClick={onEditWeb} className="btn-ghost !px-4 !py-2 text-sm">
            Upravit web
          </button>
          <a href={`/w/${p.slug}`} target="_blank" className="btn-ghost !px-4 !py-2 text-sm">
            Zobrazit ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="rise w-full max-w-md space-y-4 rounded-t-3xl bg-surface p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function RenameDialog({
  p,
  onClose,
  onDone,
}: {
  p: Property;
  onClose: () => void;
  onDone: (n: { name: string; slug: string }) => void;
}) {
  const [name, setName] = useState(p.name);
  const [slug, setSlug] = useState(p.slug);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const problem = slugProblem(slug);
  const changedSlug = slug !== p.slug;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || problem) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/sites/${p.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), ...(changedSlug ? { newSlug: slug } : {}) }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSaving(false);
    if (!res?.ok) return setError(data?.error ?? "Změnu se nepodařilo uložit.");
    onDone({ name: data.name, slug: data.slug });
  }

  return (
    <Modal title="Přejmenovat a adresa webu" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Název nemovitosti</span>
          <input className="field" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium">
            Adresa webu
            <button
              type="button"
              onClick={() => setSlug(slugify(name))}
              className="text-xs font-medium text-pine hover:underline"
            >
              Podle názvu
            </button>
          </span>
          <div className="flex items-center overflow-hidden rounded-xl border border-line bg-surface focus-within:border-pine">
            <span className="shrink-0 pl-4 text-sm text-soft">tainy.cz/w/</span>
            <input
              className="min-w-0 flex-1 bg-transparent py-3 pr-4 text-[15px] outline-none"
              value={slug}
              maxLength={48}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            />
          </div>
          {problem && <span className="mt-1 block text-xs text-coral">{problem}</span>}
        </label>
        {changedSlug && !problem && (
          <p className="rounded-xl bg-amber/15 px-4 py-3 text-xs text-[#92600a]">
            Stará adresa <strong>tainy.cz/w/{p.slug}</strong> přestane fungovat — pošli hostům a na sociální sítě nový
            odkaz. Kalendář pro Airbnb a Booking se nemění.
          </p>
        )}
        {error && <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            Zrušit
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={saving || name.trim().length < 2 || !!problem}>
            {saving ? "Ukládám…" : "Uložit"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ p, onClose, onDone }: { p: Property; onClose: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = confirm.trim() === p.name.trim();

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/sites/${p.slug}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: confirm }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(data?.error ?? "Nemovitost se nepodařilo smazat.");
    onDone();
  }

  return (
    <Modal title={`Smazat ${p.name}?`} onClose={onClose}>
      <form onSubmit={remove} className="space-y-4">
        <div className="rounded-xl bg-coral/10 px-4 py-3 text-sm text-ink">
          Trvale se smaže web <strong>tainy.cz/w/{p.slug}</strong> a s ním{" "}
          <strong>
            {p.reservations} {plural(p.reservations, "rezervace", "rezervace", "rezervací")}
          </strong>
          , hosté, náklady, vouchery, úklidy, blokace a propojené kalendáře. Akci nejde vrátit.
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Pro potvrzení opiš název: <strong>{p.name}</strong>
          </span>
          <input className="field" autoFocus value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && <p className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            Ponechat
          </button>
          <button type="submit" disabled={!ok || busy} className="btn-primary flex-1 !bg-coral hover:!bg-coral/90">
            {busy ? "Mažu…" : "Smazat nemovitost"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
