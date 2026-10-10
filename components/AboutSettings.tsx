"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAdminData } from "@/lib/admin";
import {
  ABOUT_LAYOUTS,
  ABOUT_PHOTO_SHAPES,
  ABOUT_SAMPLE,
  cleanAboutLayout,
  cleanPhotoShape,
  type AboutLayout,
} from "@/lib/about";
import { AboutSection } from "@/components/AboutSection";
import { parsePhotoLines } from "@/lib/photos";
import { uploadSitePhoto } from "@/lib/image";
import { RichTextEditor } from "@/components/RichTextEditor";
import { PhotoCropDialog } from "@/components/PhotoCropDialog";
import { cropStyle, parseCrop } from "@/lib/crop";

// Nastavení sekce „O nás“ — v Můj web i v úpravách přímo ve webu.

type Value = {
  aboutEnabled: boolean;
  aboutLayout: string;
  aboutTitle: string;
  aboutText: string;
  aboutPhoto: string;
  aboutPhotoCrop: string;
  aboutPhotoShape: string;
  aboutSignature: string;
  photos: string;
};
type Patch = Partial<Omit<Value, "photos">>;

const PREVIEW_W = 820;
const PREVIEW_H = 124;

/** Skutečný zmenšený náhled šablony s ukázkovou fotkou a textem (vystředěný v kartičce). */
function TemplatePreview({ layout, photo }: { layout: AboutLayout; photo: string }) {
  const [box, setBox] = useState<HTMLSpanElement | null>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ scale: 0.2, top: 0 });
  useEffect(() => {
    if (!box) return;
    const update = () => {
      const scale = box.clientWidth / PREVIEW_W;
      const h = (inner.current?.offsetHeight ?? 0) * scale;
      setFit({ scale, top: Math.max(0, (PREVIEW_H - h) / 2) });
    };
    const ro = new ResizeObserver(update);
    ro.observe(box);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [box]);
  return (
    <span
      ref={setBox}
      aria-hidden
      className="pointer-events-none relative block overflow-hidden rounded-lg bg-cream"
      style={{ height: PREVIEW_H }}
    >
      <span
        ref={inner}
        className="absolute left-0 block origin-top-left"
        style={{ width: PREVIEW_W, top: fit.top, transform: `scale(${fit.scale})` }}
      >
        <AboutSection
          preview
          about={{
            layout,
            title: ABOUT_SAMPLE.title,
            text: ABOUT_SAMPLE.text,
            signature: ABOUT_SAMPLE.signature,
            photo: photo || ABOUT_SAMPLE.photo,
          }}
        />
      </span>
    </span>
  );
}

export function AboutSettings({
  value,
  onChange,
  inlineText = false,
}: {
  value: Value;
  onChange: (patch: Patch) => void;
  /** Úpravy přímo ve webu: texty se píšou v náhledu, v panelu jen vzhled a fotka. */
  inlineText?: boolean;
}) {
  const { slug } = useAdminData();
  const layout = cleanAboutLayout(value.aboutLayout);
  const gallery = parsePhotoLines(value.photos);
  const [uploading, setUploading] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    if (!slug) return;
    setUploading(true);
    setError("");
    try {
      onChange({ aboutPhoto: await uploadSitePhoto(slug, file), aboutPhotoCrop: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fotku se nepodařilo nahrát.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-bg px-4 py-3">
        <span>
          <span className="block text-sm font-semibold">Zobrazit sekci O nás</span>
          <span className="block text-xs text-soft">Váš příběh a hostitelé — mezi popisem a rezervací.</span>
        </span>
        <input
          type="checkbox"
          className="h-5 w-5 accent-[var(--pine)]"
          checked={value.aboutEnabled}
          onChange={(e) => onChange({ aboutEnabled: e.target.checked })}
        />
      </label>

      <div>
        <span className="mb-2 block text-sm font-medium">Vzhled</span>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Vzhled sekce O nás">
          {ABOUT_LAYOUTS.map((l) => (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={layout === l.key}
              // Výběr šablony sekci rovnou zapne — v náhledu webu je hned vidět (s ukázkou, dokud chybí text)
              onClick={() => onChange({ aboutLayout: l.key, aboutEnabled: true })}
              className={`rounded-xl border p-2.5 text-left transition ${
                layout === l.key
                  ? "border-pine bg-pine/5 ring-2 ring-pine/20"
                  : "border-line bg-surface hover:border-pine/40"
              }`}
            >
              <TemplatePreview layout={l.key} photo={value.aboutPhoto} />
              <span className="mt-2 block text-sm font-semibold">{l.label}</span>
              <span className="block text-xs text-soft">{l.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {inlineText ? (
        <p className="rounded-xl bg-bg px-4 py-3 text-sm text-soft">
          ✍️ Nadpis, příběh i podpis přepíšeš přímo ve webu — klikni do textu v náhledu.
          {layout === "quote" && " První odstavec se ukáže jako citát."}
        </p>
      ) : (
        <>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Nadpis</span>
            <input
              className="field"
              maxLength={80}
              value={value.aboutTitle}
              onChange={(e) => onChange({ aboutTitle: e.target.value })}
            />
          </label>

          <div>
            <span className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium">
              Váš příběh
              <span className="text-xs font-normal text-soft">
                {layout === "quote" && "První odstavec se ukáže jako citát."}
              </span>
            </span>
            <RichTextEditor
              value={value.aboutText}
              onChange={(aboutText) => onChange({ aboutText })}
              placeholder="Kdo jste, jak místo vzniklo a proč u vás bude hostům dobře…"
            />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Podpis</span>
            <input
              className="field"
              maxLength={120}
              placeholder="Jana a Petr, vaši hostitelé"
              value={value.aboutSignature}
              onChange={(e) => onChange({ aboutSignature: e.target.value })}
            />
          </label>
        </>
      )}

      {layout !== "text" && (
        <div>
          <span className="mb-1.5 block text-sm font-medium">
            Fotka <span className="font-normal text-soft">(vy, rodina, nebo místo)</span>
          </span>
          <div className="flex items-center gap-3">
            <span
              className="relative block shrink-0 overflow-hidden border border-line bg-bg"
              style={{ width: 64, height: 80, borderRadius: 10 }}
            >
              {value.aboutPhoto && (
                <Image
                  src={value.aboutPhoto}
                  alt=""
                  fill
                  sizes="64px"
                  style={cropStyle(parseCrop(value.aboutPhotoCrop))}
                />
              )}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading || !slug}
                className="btn-ghost !px-4 !py-2 text-sm"
              >
                {uploading ? "Nahrávám…" : value.aboutPhoto ? "Nahrát jinou" : "Nahrát fotku"}
              </button>
              {value.aboutPhoto && (
                <button type="button" onClick={() => setCropping(true)} className="btn-ghost !px-4 !py-2 text-sm">
                  Upravit výřez
                </button>
              )}
              {value.aboutPhoto && (
                <button
                  type="button"
                  onClick={() => onChange({ aboutPhoto: "", aboutPhotoCrop: "" })}
                  className="text-sm font-medium text-soft hover:text-coral"
                >
                  Odebrat
                </button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </div>
          {gallery.length > 0 && (
            <div className="mt-3">
              <span className="mb-1.5 block text-xs text-soft">Nebo vyber z galerie:</span>
              <div className="flex flex-wrap gap-1.5">
                {gallery.slice(0, 12).map((p) => (
                  <button
                    key={p.src}
                    type="button"
                    onClick={() => onChange({ aboutPhoto: p.src, aboutPhotoCrop: "" })}
                    aria-label="Použít tuto fotku"
                    className={`relative overflow-hidden ${value.aboutPhoto === p.src ? "ring-2 ring-pine ring-offset-2" : ""}`}
                    style={{ width: 48, height: 48, borderRadius: 8 }}
                  >
                    <Image src={p.src} alt="" fill sizes="48px" className="object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {(layout === "photo-left" || layout === "photo-right") && (
            <div className="mt-4">
              <span className="mb-1.5 block text-sm font-medium">Tvar fotky</span>
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Tvar fotky">
                {ABOUT_PHOTO_SHAPES.map((sh) => {
                  const on = cleanPhotoShape(value.aboutPhotoShape) === sh.key;
                  return (
                    <button
                      key={sh.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onChange({ aboutPhotoShape: sh.key })}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[11px] font-medium transition ${
                        on
                          ? "border-pine bg-pine/5 text-ink ring-2 ring-pine/20"
                          : "border-line bg-surface text-soft hover:border-pine/40"
                      }`}
                    >
                      {/* Malý obdélník ve tvaru fotky; „Podle textu“ = fotka vedle čar textu */}
                      <span style={{ height: 30, display: "flex", alignItems: "center", gap: 3 }} aria-hidden>
                        <span
                          style={{
                            display: "block",
                            background: "color-mix(in srgb, var(--pine) 45%, transparent)",
                            borderRadius: 3,
                            ...(sh.key === "auto"
                              ? { width: 14, height: 26 }
                              : sh.key === "portrait"
                                ? { width: 20, height: 25 }
                                : sh.key === "square"
                                  ? { width: 24, height: 24 }
                                  : { width: 30, height: 22 }),
                          }}
                        />
                        {sh.key === "auto" && (
                          <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {[16, 14, 16, 10].map((w, i) => (
                              <span
                                key={i}
                                style={{
                                  display: "block",
                                  width: w,
                                  height: 2,
                                  borderRadius: 2,
                                  background: "var(--line)",
                                }}
                              />
                            ))}
                          </span>
                        )}
                      </span>
                      {sh.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-xs font-medium text-coral">{error}</p>}
          {cropping && value.aboutPhoto && (
            <PhotoCropDialog
              src={value.aboutPhoto}
              value={value.aboutPhotoCrop}
              // Rámeček výřezu jako na webu („Podle textu“ ≈ 4 : 3)
              shape={
                layout === "quote"
                  ? "circle"
                  : ABOUT_PHOTO_SHAPES.find((sh) => sh.key === cleanPhotoShape(value.aboutPhotoShape))?.ratio || "4 / 3"
              }
              onClose={() => setCropping(false)}
              onSave={(aboutPhotoCrop) => {
                setCropping(false);
                onChange({ aboutPhotoCrop });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
