"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useAdminData } from "@/lib/admin";
import { useConfirm } from "@/components/ConfirmDialog";
import { uploadSitePhoto } from "@/lib/image";
import {
  MAX_REVIEWS,
  REVIEW_LAYOUTS,
  cleanReviewsLayout,
  newReview,
  parseReviews,
  reviewSource,
  serializeReviews,
  type Review,
  type ReviewsLayout,
} from "@/lib/reviews";

// Panel sekce Recenze v úpravách webu: zapnutí a seznam recenzí (jméno, text,
// hvězdičky, doplněk, fotka). Pořadí jde měnit šipkami.

type Value = { reviewsEnabled: boolean; reviews: string; reviewsLayout: string };

export function ReviewsSettings({ value, onChange }: { value: Value; onChange: (patch: Partial<Value>) => void }) {
  const list = parseReviews(value.reviews);
  // Nově přidaná recenze je rozbalená
  const [open, setOpen] = useState<string | null>(null);
  const save = (next: Review[]) => onChange({ reviews: serializeReviews(next) });
  const confirmDlg = useConfirm();
  async function remove(r: Review) {
    const ok = await confirmDlg.ask({
      title: "Smazat recenzi?",
      message: r.name ? `Recenze od ${r.name} zmizí z webu.` : "Recenze zmizí z webu.",
      confirmLabel: "Smazat",
    });
    if (ok) save(list.filter((x) => x.id !== r.id));
  }
  const update = (id: string, patch: Partial<Review>) => save(list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...list];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-bg px-4 py-3">
        <span>
          <span className="block text-sm font-semibold">Zobrazit recenze na webu</span>
          <span className="block text-xs text-soft">Sekce „Co říkají hosté“ před rezervací.</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--pine)]"
          checked={value.reviewsEnabled}
          onChange={(e) => onChange({ reviewsEnabled: e.target.checked })}
        />
      </label>

      <div>
        <span className="mb-2 block text-sm font-medium">Vzhled</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Vzhled recenzí">
          {REVIEW_LAYOUTS.map((l) => {
            const on = cleanReviewsLayout(value.reviewsLayout) === l.key;
            return (
              <button
                key={l.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ reviewsLayout: l.key })}
                className={`rounded-xl border p-2.5 text-left transition ${
                  on ? "border-pine bg-pine/5 ring-2 ring-pine/20" : "border-line bg-surface hover:border-pine/40"
                }`}
              >
                <LayoutPreview layout={l.key} />
                <span className="mt-2 block text-sm font-semibold">{l.label}</span>
                <span className="block text-xs text-soft">{l.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {list.length === 0 && (
        <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-soft">
          Zatím žádná recenze. Zkopíruj hodnocení z Googlu, Bookingu nebo z e-mailu od hosta.
        </p>
      )}

      <div className="space-y-2">
        {list.map((r, i) => (
          <ReviewEditor
            key={r.id}
            r={r}
            index={i}
            count={list.length}
            open={open === r.id}
            onToggle={() => setOpen(open === r.id ? null : r.id)}
            onChange={(patch) => update(r.id, patch)}
            onMove={(by) => move(i, by)}
            onRemove={() => remove(r)}
          />
        ))}
      </div>

      {list.length < MAX_REVIEWS && (
        <button
          type="button"
          onClick={() => {
            const r = newReview();
            // Přidáním první recenze se sekce rovnou zapne
            onChange({ reviews: serializeReviews([...list, r]), ...(value.reviewsEnabled ? {} : { reviewsEnabled: true }) });
            setOpen(r.id);
          }}
          className="btn-ghost w-full !py-2.5 text-sm"
        >
          + Přidat recenzi
        </button>
      )}
      {confirmDlg.node}
    </div>
  );
}

function ReviewEditor({
  r,
  index,
  count,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  r: Review;
  index: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Review>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { slug } = useAdminData();
  const [uploading, setUploading] = useState(false);
  const [showLink, setShowLink] = useState(!!r.link);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);

  async function upload(f: File) {
    if (!slug) return;
    setUploading(true);
    setError("");
    try {
      onChange({ photo: await uploadSitePhoto(slug, f) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fotku se nepodařilo nahrát.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`rounded-xl border bg-surface ${open ? "border-pine/40" : "border-line"}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <span className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-pine/10 text-sm font-semibold text-pine" style={{ width: 32, height: 32 }}>
            {r.photo ? <Image src={r.photo} alt="" fill sizes="32px" className="object-cover" /> : (r.name || "?").charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{r.name || "Nová recenze"}</span>
            <span className="block truncate text-xs text-soft">{r.text || "Doplň text recenze"}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onToggle}
            className="mr-1 rounded-md px-2 py-1 text-xs font-semibold text-pine hover:bg-bg"
          >
            {open ? "Hotovo" : "Upravit"}
          </button>
          <button
            type="button"
            aria-label="Smazat recenzi"
            title="Smazat recenzi"
            onClick={onRemove}
            className="flex h-8 w-7 items-center justify-center rounded-md text-soft hover:bg-bg hover:text-coral"
          >
            <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 5.5h13M8 5.5V4h4v1.5M5 5.5l.8 10.5h8.4L15 5.5M8.5 9v4.5M11.5 9v4.5" />
            </svg>
          </button>
          <button type="button" aria-label="Posunout výš" disabled={index === 0} onClick={() => onMove(-1)} className="h-8 w-7 rounded-md text-soft hover:bg-bg hover:text-ink disabled:opacity-30">
            ↑
          </button>
          <button type="button" aria-label="Posunout níž" disabled={index === count - 1} onClick={() => onMove(1)} className="h-8 w-7 rounded-md text-soft hover:bg-bg hover:text-ink disabled:opacity-30">
            ↓
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-line p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Jméno hosta</span>
            <input className="field !py-2 text-sm" maxLength={60} placeholder="Tereza a Martin" value={r.name} onChange={(e) => onChange({ name: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Text recenze</span>
            <textarea className="field min-h-24 !py-2 text-sm" maxLength={1200} placeholder="Co hosté napsali…" value={r.text} onChange={(e) => onChange({ text: e.target.value })} />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium">Hodnocení</span>
              <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Hodnocení">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={r.rating === n}
                    aria-label={`${n} z 5`}
                    onClick={() => onChange({ rating: r.rating === n ? 0 : n })}
                    className="p-0.5 text-pine"
                  >
                    <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden fill={n <= r.rating ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4">
                      <path d="m10 2.2 2.4 4.9 5.4.8-3.9 3.8.9 5.4L10 14.6l-4.8 2.5.9-5.4L2.2 7.9l5.4-.8Z" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-xs font-medium">Doplněk (nepovinné)</span>
              <input className="field !py-2 text-sm" maxLength={80} placeholder="Srpen 2026 · Google" value={r.meta} onChange={(e) => onChange({ meta: e.target.value })} />
            </label>
          </div>
          {/* Odkaz na původní recenzi: schovaný, dokud ho majitel nerozklikne (nebo už odkaz má) */}
          {!showLink ? (
            <button
              type="button"
              onClick={() => setShowLink(true)}
              className="text-xs font-semibold text-pine hover:underline"
            >
              + Přidat odkaz na recenzi (Google, Booking…)
            </button>
          ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Odkaz na recenzi (nepovinné)</span>
            <input
              className="field !py-2 text-sm"
              type="url"
              inputMode="url"
              maxLength={600}
              placeholder="https://maps.app.goo.gl/…"
              autoFocus={!r.link}
              value={r.link}
              onChange={(e) => onChange({ link: e.target.value })}
            />
            {r.link.trim() && !reviewSource(r.link) ? (
              <span className="mt-1 block text-xs font-medium text-coral">Odkaz musí začínat https://</span>
            ) : (
              <span className="mt-1 block text-xs text-soft">
                {reviewSource(r.link) === "google"
                  ? "✓ Recenze z Googlu — na kartě bude „Zobrazit na Googlu“."
                  : "V Mapách Google otevři recenzi → Sdílet → Kopírovat odkaz. Funguje i Booking nebo Airbnb."}
              </span>
            )}
          </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">Fotka</span>
            <button type="button" onClick={() => file.current?.click()} disabled={uploading || !slug} className="btn-ghost !px-3 !py-1.5 text-xs">
              {uploading ? "Nahrávám…" : r.photo ? "Změnit" : "Nahrát"}
            </button>
            {r.photo && (
              <button type="button" onClick={() => onChange({ photo: "" })} className="text-xs font-medium text-soft hover:text-coral">
                Odebrat
              </button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
            <button type="button" onClick={onRemove} className="ml-auto text-xs font-medium text-coral hover:underline">
              Smazat recenzi
            </button>
          </div>
          {error && <p className="text-xs font-medium text-coral">{error}</p>}
        </div>
      )}
    </div>
  );
}

/** Malý náhled vzhledu: mřížka karet, nebo řada karet s šipkami. */
function LayoutPreview({ layout }: { layout: ReviewsLayout }) {
  const card = (key: number, extra = "") => (
    <span key={key} className={`flex flex-col gap-1 rounded-md border border-line bg-surface p-1.5 ${extra}`}>
      <span className="h-1 w-6 rounded-full bg-pine/50" />
      <span className="h-1 w-full rounded-full bg-line" />
      <span className="h-1 w-3/4 rounded-full bg-line" />
    </span>
  );
  return (
    <span className="block overflow-hidden rounded-lg bg-bg p-2" style={{ height: 64 }} aria-hidden>
      {layout === "grid" ? (
        <span className="grid grid-cols-3 gap-1">{[0, 1, 2, 3, 4].map((i) => card(i))}</span>
      ) : (
        <span className="flex h-full items-center gap-1">
          <span className="shrink-0 text-[10px] text-soft">←</span>
          <span className="flex min-w-0 flex-1 gap-1 overflow-hidden">
            {[0, 1, 2].map((i) => card(i, "shrink-0 w-[42%]"))}
          </span>
          <span className="shrink-0 text-[10px] text-soft">→</span>
        </span>
      )}
    </span>
  );
}
