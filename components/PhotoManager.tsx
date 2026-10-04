"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { parsePhotoLines, serializePhotos, type Photo } from "@/lib/photos";
import { uploadSitePhoto } from "@/lib/image";

// Správa galerie v administraci: mozaika jako na webu, nahrávání přetažením,
// přeuspořádání, hlavní fotka a popisky. Každá změna se hned uloží.

const ACCEPT = "image/jpeg,image/png,image/webp";

type Upload = { id: string; name: string; error?: string };

export function PhotoManager({
  slug,
  value,
  onChange,
}: {
  slug: string;
  /** Site.photos — jedna fotka na řádek `adresa|popisek`. */
  value: string;
  onChange: (value: string) => void;
}) {
  const photos = parsePhotoLines(value);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [detail, setDetail] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropOver, setDropOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Nahrávání běží souběžně; poslední známý stav držíme mimo render.
  const latest = useRef(photos);
  latest.current = photos;

  const save = useCallback(
    async (next: Photo[]) => {
      latest.current = next;
      const raw = serializePhotos(next);
      onChange(raw);
      setStatus("saving");
      try {
        const res = await fetch(`/api/sites/${slug}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photos: raw }),
        });
        setStatus(res.ok ? "saved" : "error");
      } catch {
        setStatus("error");
      }
    },
    [slug, onChange]
  );

  async function uploadFiles(files: FileList | File[]) {
    const list = [...files].filter((f) => ACCEPT.split(",").includes(f.type) || f.type.startsWith("image/"));
    for (const file of list) {
      const id = Math.random().toString(36).slice(2);
      setUploads((u) => [...u, { id, name: file.name }]);
      try {
        const src = await uploadSitePhoto(slug, file);
        await save([...latest.current, { src, alt: "" }]);
        setUploads((u) => u.filter((x) => x.id !== id));
      } catch (e) {
        const error = e instanceof Error ? e.message : "Nahrání selhalo.";
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, error } : x)));
      }
    }
  }

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= photos.length) return;
    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    save(next);
    return to;
  }

  async function remove(i: number) {
    const photo = photos[i];
    if (!confirm("Smazat tuhle fotku z galerie?")) return;
    setDetail(null);
    await save(photos.filter((_, j) => j !== i));
    fetch(`/api/sites/${slug}/photos?src=${encodeURIComponent(photo.src)}`, { method: "DELETE" });
  }

  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  return (
    <div
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setDropOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOver(false);
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setDropOver(false);
        uploadFiles(e.dataTransfer.files);
      }}
      className={`relative rounded-2xl transition ${dropOver ? "ring-2 ring-pine ring-offset-4 ring-offset-surface" : ""}`}
    >
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {photos.length === 0 && uploads.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-bg px-6 py-14 text-center transition hover:border-pine/50"
        >
          <span className="text-3xl" aria-hidden>
            🖼
          </span>
          <span className="font-semibold">Přetáhni sem fotky nebo klikni</span>
          <span className="text-sm text-soft">JPG, PNG nebo WebP · první fotka bude hlavní</span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
          {photos.map((photo, i) => (
            <div
              key={photo.src}
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragFrom(null)}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.stopPropagation();
                move(dragFrom, i);
                setDragFrom(null);
              }}
              className={`group relative cursor-grab overflow-hidden rounded-2xl border border-line bg-line/30 active:cursor-grabbing ${
                i === 0 ? "col-span-2 row-span-2 aspect-square" : "aspect-square"
              } ${dragFrom === i ? "opacity-40" : ""}`}
            >
              <button
                type="button"
                onClick={() => setDetail(i)}
                aria-label={`Upravit fotku ${i + 1}`}
                className="absolute inset-0"
              >
                <Image
                  src={photo.src}
                  alt={photo.alt || `Fotka ${i + 1}`}
                  fill
                  sizes={i === 0 ? "(max-width: 640px) 66vw, 420px" : "(max-width: 640px) 33vw, 210px"}
                  className="object-cover"
                  draggable={false}
                />
              </button>
              {i === 0 && (
                <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-ink/75 px-2.5 py-1 text-[11px] font-semibold text-white">
                  ★ Hlavní
                </span>
              )}
              {photo.alt && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink/70 to-transparent px-2.5 pb-2 pt-6 text-[11px] text-white">
                  {photo.alt}
                </span>
              )}
              <div className="absolute right-1.5 top-1.5 flex gap-1 transition sm:opacity-0 sm:group-hover:opacity-100">
                {i > 0 && (
                  <TileButton label="Nastavit jako hlavní" onClick={() => move(i, 0)}>
                    ★
                  </TileButton>
                )}
                <TileButton label="Smazat fotku" onClick={() => remove(i)}>
                  🗑
                </TileButton>
              </div>
            </div>
          ))}

          {uploads.map((u) => (
            <div
              key={u.id}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-bg p-3 text-center"
            >
              {u.error ? (
                <>
                  <p className="text-xs font-medium text-coral">{u.error}</p>
                  <button
                    type="button"
                    className="text-xs text-soft underline"
                    onClick={() => setUploads((list) => list.filter((x) => x.id !== u.id))}
                  >
                    Zavřít
                  </button>
                </>
              ) : (
                <>
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-pine" />
                  <p className="w-full truncate text-[11px] text-soft">{u.name}</p>
                </>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line bg-bg text-soft transition hover:border-pine/50 hover:text-pine"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="text-xs font-semibold">Přidat fotky</span>
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-soft">
        {status === "saving" && "Ukládám…"}
        {status === "saved" && <span className="font-medium text-pine">✓ Uloženo</span>}
        {status === "error" && <span className="font-medium text-coral">Uložení selhalo, zkus to znovu.</span>}
        {status === "idle" &&
          (photos.length > 0
            ? "Pořadí změníš přetažením. Kliknutím na fotku upravíš popisek."
            : "")}
      </p>

      {detail !== null && photos[detail] && (
        <PhotoDetail
          key={photos[detail].src}
          photo={photos[detail]}
          index={detail}
          count={photos.length}
          onClose={() => setDetail(null)}
          onMove={(to) => {
            const at = move(detail, to);
            if (at !== undefined) setDetail(at);
          }}
          onCaption={(alt) => save(photos.map((p, j) => (j === detail ? { ...p, alt } : p)))}
          onDelete={() => remove(detail)}
        />
      )}
    </div>
  );
}

function TileButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-surface/90 text-sm shadow-sm backdrop-blur transition hover:bg-surface"
    >
      {children}
    </button>
  );
}

function PhotoDetail({
  photo,
  index,
  count,
  onClose,
  onMove,
  onCaption,
  onDelete,
}: {
  photo: Photo;
  index: number;
  count: number;
  onClose: () => void;
  onMove: (to: number) => void;
  onCaption: (alt: string) => void;
  onDelete: () => void;
}) {
  const [alt, setAlt] = useState(photo.alt);
  const dirty = alt.trim() !== photo.alt;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Fotka ${index + 1} z ${count}`}
        className="w-full max-w-2xl overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[4/3] bg-ink">
          <Image src={photo.src} alt={photo.alt || `Fotka ${index + 1}`} fill sizes="672px" className="object-contain" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-lg"
          >
            ✕
          </button>
          {index === 0 && (
            <span className="absolute left-3 top-3 rounded-full bg-surface/90 px-3 py-1 text-xs font-semibold">
              ★ Hlavní fotka
            </span>
          )}
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Popisek</span>
            <div className="flex gap-2">
              <input
                className="control w-full"
                placeholder="např. Sauna s výhledem do lesa"
                value={alt}
                maxLength={120}
                onChange={(e) => setAlt(e.target.value.replace(/[|\n]/g, " "))}
                onKeyDown={(e) => e.key === "Enter" && dirty && onCaption(alt.trim())}
              />
              <button
                type="button"
                className="btn-primary h-10 shrink-0 !px-4 !py-0 text-sm"
                disabled={!dirty}
                onClick={() => onCaption(alt.trim())}
              >
                Uložit
              </button>
            </div>
            <span className="mt-1 block text-xs text-soft">
              Hosté ho uvidí ve zvětšené fotce; pomáhá i vyhledávačům a nevidomým.
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost !px-3 !py-1.5 text-sm"
                disabled={index === 0}
                onClick={() => onMove(index - 1)}
              >
                ← Dřív
              </button>
              <span className="text-sm text-soft">
                {index + 1} / {count}
              </span>
              <button
                type="button"
                className="btn-ghost !px-3 !py-1.5 text-sm"
                disabled={index === count - 1}
                onClick={() => onMove(index + 1)}
              >
                Později →
              </button>
              {index > 0 && (
                <button type="button" className="btn-ghost !px-3 !py-1.5 text-sm" onClick={() => onMove(0)}>
                  ★ Hlavní
                </button>
              )}
            </div>
            <button type="button" className="text-sm font-medium text-coral hover:underline" onClick={onDelete}>
              Smazat fotku
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
