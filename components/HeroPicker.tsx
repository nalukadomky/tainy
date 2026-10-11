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

  /** Klik do fotky: výběr z galerie, nebo nahrání, když je galerie prázdná. */
  function choose() {
    if (gallery.length) setPicking((p) => !p);
    else fileInput.current?.click();
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

      {/* Náhled úvodu: u fotky jen fotka, u minimalistického zmenšený text */}
      <div className="overflow-hidden rounded-2xl border border-line">
        {heroStyle === "photo" ? (
          heroPhoto ? (
            // Jen samotná fotka (nadpis je vidět ve webu vedle panelu). Klik do fotky = výběr
            // jiné z galerie (nebo nahrání, když je galerie prázdná); ovládání je přímo ve fotce.
            <div className="group relative min-h-56 bg-ink sm:min-h-0 sm:aspect-[16/7]">
              <button
                type="button"
                onClick={choose}
                disabled={uploading}
                aria-label={gallery.length ? "Vybrat jinou úvodní fotku z galerie" : "Nahrát jinou úvodní fotku"}
                aria-expanded={gallery.length ? picking : undefined}
                className="absolute inset-0 cursor-pointer"
              >
                <Image src={heroPhoto} alt="" fill sizes="(max-width: 640px) 100vw, 800px" className="object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-ink/0 text-sm font-semibold text-white opacity-0 transition group-hover:bg-ink/35 group-hover:opacity-100">
                  {uploading ? "Nahrávám…" : "Vybrat jinou fotku"}
                </span>
                {uploading && (
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/45 text-sm font-semibold text-white">
                    Nahrávám…
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                aria-label="Odebrat úvodní fotku"
                title="Odebrat fotku"
                className="absolute right-2 top-2 flex items-center justify-center rounded-full bg-ink/55 text-white backdrop-blur transition hover:bg-coral"
                style={{ width: 30, height: 30 }}
              >
                ✕
              </button>
              <div className="absolute bottom-2 left-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading}
                  className="rounded-full bg-surface/95 px-3 py-1.5 text-xs font-semibold text-ink shadow backdrop-blur transition hover:bg-surface"
                >
                  ⤒ Nahrát jinou
                </button>
                {gallery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPicking((p) => !p)}
                    aria-expanded={picking}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold shadow backdrop-blur transition ${
                      picking ? "bg-pine text-white" : "bg-surface/95 text-ink hover:bg-surface"
                    }`}
                  >
                    Z galerie
                  </button>
                )}
              </div>
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

          {/* Bez fotky: tlačítka pod prázdným boxem (s fotkou je ovládání přímo ve fotce) */}
          <div className="flex flex-wrap gap-2">
            {!heroPhoto && (
            <button
              type="button"
              className="btn-primary h-10 !px-4 !py-0 text-sm"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? "Nahrávám…" : "Nahrát fotku"}
            </button>
            )}
            {!heroPhoto && gallery.length > 0 && (
              <button
                type="button"
                className="btn-ghost h-10 !px-4 !py-0 text-sm"
                aria-expanded={picking}
                onClick={() => setPicking((p) => !p)}
              >
                Vybrat z galerie
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
