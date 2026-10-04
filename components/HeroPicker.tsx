"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import type { Photo } from "@/lib/photos";
import { uploadSitePhoto } from "@/lib/image";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Volba úvodu webu: jen text, nebo nadpis přes velkou úvodní fotku.
// Úvodní fotka je samostatná — nahraje se zvlášť, nebo se vybere z galerie.
// Každá změna se hned uloží.

type HeroStyle = "text" | "photo";

export function HeroPicker({
  slug,
  siteName,
  tagline,
  propertyType,
  heroStyle,
  heroPhoto,
  gallery,
  onChange,
}: {
  slug: string;
  siteName: string;
  tagline: string;
  propertyType: string;
  heroStyle: HeroStyle;
  heroPhoto: string;
  gallery: Photo[];
  onChange: (patch: { heroStyle: HeroStyle; heroPhoto: string }) => void;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function save(patch: { heroStyle: HeroStyle; heroPhoto: string }) {
    onChange(patch);
    setStatus("saving");
    try {
      const res = await fetch(`/api/sites/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  /** Nahranou fotku, která není v galerii, smaže i z úložiště. */
  function dropStored(src: string) {
    if (!src || gallery.some((p) => p.src === src)) return;
    fetch(`/api/sites/${slug}/photos?src=${encodeURIComponent(src)}`, { method: "DELETE" });
  }

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const src = await uploadSitePhoto(slug, file);
      const old = heroPhoto;
      await save({ heroStyle: "photo", heroPhoto: src });
      dropStored(old);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nahrání selhalo.");
    } finally {
      setUploading(false);
    }
  }

  function pick(src: string) {
    setPicking(false);
    const old = heroPhoto;
    save({ heroStyle: "photo", heroPhoto: src });
    if (old !== src) dropStored(old);
  }

  // Fotka nahraná zvlášť (není v galerii) se při odebrání smaže i z úložiště.
  const removeDeletesFile = !!heroPhoto && !gallery.some((p) => p.src === heroPhoto) && !heroPhoto.startsWith("/");

  function remove() {
    setConfirmRemove(false);
    const old = heroPhoto;
    save({ heroStyle, heroPhoto: "" });
    dropStored(old);
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-line bg-bg p-1" role="radiogroup" aria-label="Styl úvodu">
        {(
          [
            ["photo", "Úvodní fotka"],
            ["text", "Minimalistický"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={heroStyle === value}
            onClick={() => heroStyle !== value && save({ heroStyle: value, heroPhoto })}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              heroStyle === value ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Živý náhled úvodu — zmenšená verze toho, co uvidí hosté */}
      <div className="overflow-hidden rounded-2xl border border-line">
        {heroStyle === "photo" ? (
          heroPhoto ? (
            <div className="relative flex min-h-56 items-end bg-ink sm:min-h-0 sm:aspect-[16/7]">
              <Image src={heroPhoto} alt="" fill sizes="(max-width: 640px) 100vw, 800px" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
              <PreviewText name={siteName} tagline={tagline} type={propertyType} light />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex min-h-56 w-full flex-col items-center justify-center gap-1 border-2 border-dashed border-line bg-bg text-center sm:min-h-0 sm:aspect-[16/7]"
            >
              <span className="text-2xl" aria-hidden>
                🖼
              </span>
              <span className="font-semibold">Nahraj nebo vyber úvodní fotku</span>
              <span className="text-xs text-soft">Do té doby se web ukáže s minimalistickým úvodem.</span>
            </button>
          )
        ) : (
          <div className="paper flex min-h-56 items-center bg-cream sm:min-h-0 sm:aspect-[16/7]">
            <PreviewText name={siteName} tagline={tagline} type={propertyType} />
          </div>
        )}
      </div>

      {heroStyle === "photo" && (
        <div className="space-y-3">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary h-10 !px-4 !py-0 text-sm"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? "Nahrávám…" : heroPhoto ? "Nahrát jinou fotku" : "Nahrát fotku"}
            </button>
            {gallery.length > 0 && (
              <button
                type="button"
                className="btn-ghost h-10 !px-4 !py-0 text-sm"
                aria-expanded={picking}
                onClick={() => setPicking((p) => !p)}
              >
                Vybrat z galerie
              </button>
            )}
            {heroPhoto && (
              <button
                type="button"
                className="h-10 px-2 text-sm font-medium text-soft transition hover:text-coral"
                onClick={() => setConfirmRemove(true)}
              >
                Odebrat
              </button>
            )}
            {confirmRemove && (
              <ConfirmDialog
                title="Odebrat úvodní fotku?"
                confirmLabel="Odebrat fotku"
                onConfirm={remove}
                onCancel={() => setConfirmRemove(false)}
              >
                <div className="relative aspect-[16/7] overflow-hidden rounded-xl bg-ink">
                  <Image src={heroPhoto} alt="" fill sizes="384px" className="object-cover" />
                </div>
                <p>
                  {removeDeletesFile
                    ? "Fotka se smaže natrvalo. Kdybys ji chtěl zpátky, budeš ji muset nahrát znovu."
                    : "Fotka zůstane v galerii, jen přestane být úvodní."}{" "}
                  Dokud nevybereš novou, web se ukáže s minimalistickým úvodem.
                </p>
              </ConfirmDialog>
            )}
          </div>

          {picking && (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {gallery.map((p, i) => (
                <button
                  key={p.src}
                  type="button"
                  onClick={() => pick(p.src)}
                  aria-label={`Použít fotku ${i + 1}${p.alt ? `: ${p.alt}` : ""}`}
                  className={`relative aspect-square overflow-hidden rounded-xl border-2 transition ${
                    p.src === heroPhoto ? "border-pine" : "border-transparent hover:border-line"
                  }`}
                >
                  <Image src={p.src} alt="" fill sizes="120px" className="object-cover" />
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-soft">
            Nejlépe vypadá fotka na šířku, alespoň 1 600 px široká. Text leží na tmavém přechodu ve spodní části, takže bude čitelný.
          </p>
        </div>
      )}

      {error && <p className="text-sm font-medium text-coral">{error}</p>}
      <p className="text-xs text-soft">
        {status === "saving" && "Ukládám…"}
        {status === "saved" && <span className="font-medium text-pine">✓ Uloženo</span>}
        {status === "error" && <span className="font-medium text-coral">Uložení selhalo, zkus to znovu.</span>}
      </p>
    </div>
  );
}

function PreviewText({
  name,
  tagline,
  type,
  light = false,
}: {
  name: string;
  tagline: string;
  type: string;
  light?: boolean;
}) {
  return (
    <div className={`relative w-full p-5 sm:p-7 ${light ? "text-white" : "text-ink"}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-widest ${light ? "text-white/80" : "text-soft"}`}>
        {type}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">
        {name || "Tvůj web"}
      </p>
      {tagline && (
        <p className={`mt-1 max-w-md font-display text-sm italic sm:text-base ${light ? "text-white/90" : "text-soft"}`}>
          {tagline}
        </p>
      )}
      <span className="mt-3 inline-flex rounded-full bg-pine px-3.5 py-1.5 text-xs font-semibold text-white">
        Rezervovat termín
      </span>
    </div>
  );
}
