"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { Photo } from "@/lib/photos";

// Galerie nemovitosti: mřížka náhledů + lightbox přes celou obrazovku.
// Přepínat jde šipkami, klávesnicí (← → Esc) i svípnutím prstem.

export function Gallery({ photos, siteName }: { photos: Photo[]; siteName: string }) {
  const [open, setOpen] = useState<number | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {photos.slice(0, 6).map((photo, i) => {
          const isHero = i === 0;
          return (
            <button
              key={photo.src}
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`Zvětšit fotku: ${photo.alt}`}
              className={`group relative overflow-hidden rounded-2xl border border-line bg-line/30 transition ${
                // Hlavní dlaždice je široká 2 sloupce + mezeru, což se přesně rovná výšce
                // dvou čtvercových dlaždic nad sebou — proto čtverec, jinak vznikne mezera.
                isHero ? "col-span-2 row-span-2 aspect-square" : "aspect-square"
              }`}
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes={isHero ? "(max-width: 640px) 66vw, 580px" : "(max-width: 640px) 33vw, 290px"}
                priority={isHero}
                className="object-cover transition duration-500 group-hover:scale-105"
              />
              {/* Poslední dlaždice napoví, že fotek je víc */}
              {i === 5 && photos.length > 6 && (
                <span className="absolute inset-0 flex items-center justify-center bg-ink/55 font-display text-xl font-semibold text-white">
                  +{photos.length - 6}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setOpen(0)}
        className="btn-ghost mt-3 !px-4 !py-2 text-sm"
      >
        Zobrazit všech {photos.length} fotek
      </button>

      {open !== null && (
        <Lightbox
          photos={photos}
          index={open}
          siteName={siteName}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function Lightbox({
  photos,
  index,
  siteName,
  onIndex,
  onClose,
}: {
  photos: Photo[];
  index: number;
  siteName: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const go = useCallback(
    (by: number) => onIndex((index + by + photos.length) % photos.length),
    [index, photos.length, onIndex]
  );

  useEffect(() => setMounted(true), []);

  // Klávesnice, uzamčený scroll stránky a vrácení fokusu po zavření
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Tab") {
        // Fokus zůstává uvnitř dialogu
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button");
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [go, onClose]);

  if (!mounted) return null;

  const photo = photos[index];

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Galerie ${siteName}, fotka ${index + 1} z ${photos.length}`}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col bg-surface outline-none"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        if (start === null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      {/* Lišta: počítadlo a zavření */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3 sm:px-6">
        <span className="text-sm font-medium tabular-nums text-soft">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Zavřít galerii"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-xl text-ink transition hover:bg-line"
        >
          ✕
        </button>
      </div>

      {/* Fotka */}
      <div className="relative min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
        <Image
          key={photo.src}
          src={photo.src}
          alt={photo.alt}
          fill
          sizes="100vw"
          priority
          className="object-contain"
        />
      </div>

      {/* Popisek a přepínání */}
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          aria-label="Předchozí fotka"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bg text-xl text-ink transition hover:bg-line"
        >
          ←
        </button>
        <p className="min-w-0 flex-1 text-center text-sm text-soft">{photo.alt}</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          aria-label="Další fotka"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bg text-xl text-ink transition hover:bg-line"
        >
          →
        </button>
      </div>
    </div>,
    document.body
  );
}
