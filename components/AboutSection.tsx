"use client";

import { useRef } from "react";
import Image from "next/image";
import { cropStyle, parseCrop } from "@/lib/crop";
import { RichText } from "@/components/RichText";
import { EditableText, type SiteEditing } from "@/components/EditableText";
import { ABOUT_PHOTO_SHAPES, type AboutLayout, type AboutPhotoShape } from "@/lib/about";

// Sekce „O nás“ na webu — příběh majitele ve čtyřech šablonách vzhledu.

export type AboutData = {
  layout: AboutLayout;
  title: string;
  text: string;
  photo: string;
  /** Výřez fotky „x,y,zoom“ (lib/crop.ts). */
  crop?: string;
  /** Tvar fotky vedle textu (lib/about.ts) — „auto“ = výška podle textu. */
  shape?: AboutPhotoShape;
  signature: string;
};

const WRAP = "mx-auto max-w-4xl px-5 py-12 sm:py-16 lg:max-w-6xl lg:px-8 2xl:max-w-7xl";

function Signature({ text, className = "", editing }: { text: string; className?: string; editing?: SiteEditing }) {
  if (editing)
    return (
      <p className={`font-display text-lg italic text-pine ${className}`}>
        —{" "}
        <EditableText editing={editing} field="aboutSignature" value={text} placeholder="Jana a Petr, vaši hostitelé" />
      </p>
    );
  if (!text) return null;
  return <p className={`font-display text-lg italic text-pine ${className}`}>— {text}</p>;
}

export function AboutSection({
  about,
  preview = false,
  editing,
}: {
  about: AboutData;
  preview?: boolean;
  /** Úpravy přímo ve webu: nadpis, příběh i podpis jdou přepsat v textu. */
  editing?: SiteEditing;
}) {
  // Náhled ve výběru šablony nesmí mít id sekce (na stránce by bylo dvakrát)
  const id = preview ? undefined : "o-nas";
  // Náhled šablony: menší okraje, ať je v kartičce vidět celé rozvržení
  const wrap = preview ? "px-10 py-8" : WRAP;
  const heading = (className: string, as: "h2" | "p" = "h2") =>
    editing ? (
      <EditableText as={as} editing={editing} field="aboutTitle" value={title} placeholder="O nás" className={className} />
    ) : as === "h2" ? (
      <h2 className={className}>{title}</h2>
    ) : (
      <p className={className}>{title}</p>
    );
  // Příběh: na webu formátovaný text, v úpravách obyčejný text k přímému přepsání
  const story = (value: string, className: string, field: (v: string) => void = (v) => editing?.text("aboutText", v)) =>
    editing ? (
      <EditableText
        as="p"
        editing={{ ...editing, text: (_f, v) => field(v) }}
        field="aboutText"
        value={value}
        placeholder="Napiš svůj příběh…"
        multiline
        className={`whitespace-pre-line text-[15px] leading-relaxed ${className}`}
      />
    ) : (
      <RichText text={value} className={className} />
    );
  const { layout, title, text, photo, signature } = about;
  // Citát a zbytek příběhu se při psaní skládají do jednoho textu. Poslední verzi
  // obou částí držíme tady — náhled dostává nová data se zpožděním a rychlé
  // přepnutí z citátu do příběhu by jinak složilo text ze staré verze.
  const parts = useRef<{ first: string; rest: string; at: number } | null>(null);

  if (layout === "quote") {
    // První odstavec jako citát, zbytek příběhu pod ním
    const [first, ...rest] = text.trim().split(/\n\s*\n/);
    // Paměť platí jen chvíli po psaní — pak už náhled má čerstvá data (i změny z panelu)
    const latest = () =>
      parts.current && Date.now() - parts.current.at < 3000
        ? parts.current
        : { first: first.trim(), rest: rest.join("\n\n") };
    const saveParts = (next: { first: string; rest: string }) => {
      parts.current = { ...next, at: Date.now() };
      editing?.text("aboutText", [next.first.trim(), next.rest.trim()].filter(Boolean).join("\n\n"));
    };
    return (
      <section id={id} className={`scroll-mt-20 ${preview ? "" : "border-t border-line bg-bg"}`}>
        <div className={`${wrap} text-center`}>
          {heading("text-xs font-semibold uppercase tracking-widest text-soft", "p")}
          {editing ? (
            <blockquote className="mx-auto mt-5 max-w-3xl font-display text-2xl italic leading-snug text-ink sm:text-3xl">
              „
              <EditableText
                editing={{ ...editing, text: (_f, v) => saveParts({ ...latest(), first: v }) }}
                field="aboutText"
                value={first.trim()}
                placeholder="Citát — první věta vašeho příběhu"
              />
              “
            </blockquote>
          ) : (
            <blockquote className="mx-auto mt-5 max-w-3xl font-display text-2xl italic leading-snug text-ink sm:text-3xl">
              „{first.replace(/\*\*|\*/g, "").trim()}“
            </blockquote>
          )}
          {(photo || signature || editing) && (
            <div className="mt-6 flex items-center justify-center gap-3">
              {photo && (
                <span
                  className="relative block shrink-0 overflow-hidden border-2 border-surface shadow"
                  style={{ width: 56, height: 56, borderRadius: "50%" }}
                >
                  <Image src={photo} alt="" fill sizes="56px" style={cropStyle(parseCrop(about.crop))} />
                </span>
              )}
              <Signature text={signature} className="!text-base" editing={editing} />
            </div>
          )}
          {(rest.length > 0 || editing) && (
            <div className="mx-auto mt-8 max-w-2xl text-left">
              {story(rest.join("\n\n"), "text-soft", (v) => saveParts({ ...latest(), rest: v }))}
            </div>
          )}
        </div>
      </section>
    );
  }

  if (layout === "text" || !photo) {
    return (
      <section id={id} className={`scroll-mt-20 ${preview ? "" : "border-t border-line"}`}>
        <div className={wrap}>
          <div className="mx-auto max-w-2xl">
            {heading("font-display text-3xl font-semibold tracking-tight")}
            {story(text, "mt-5 text-soft")}
            <Signature text={signature} className="mt-6" editing={editing} />
          </div>
        </div>
      </section>
    );
  }

  const right = layout === "photo-right";
  const auto = !about.shape || about.shape === "auto";
  const ratio = ABOUT_PHOTO_SHAPES.find((s) => s.key === about.shape)?.ratio || "4 / 5";
  return (
    <section id={id} className={`scroll-mt-20 ${preview ? "" : "border-t border-line"}`}>
      <div
        className={`${wrap} grid gap-8 ${auto ? "items-stretch" : "items-center"} ${preview ? "grid-cols-2 gap-10" : "sm:grid-cols-2 sm:gap-12"}`}
      >
        <div
          className={`relative w-full overflow-hidden bg-bg ${right ? (preview ? "order-2" : "sm:order-2") : ""} ${auto ? "about-photo-auto" : ""}`}
          // Rozměry přímo ve stylu — fotka (next/image fill) nesmí mít nulovou výšku ani se starší verzí CSS.
          // „Podle textu“: výška jako text vedle (na mobilu 4 : 3), jinak pevný poměr stran.
          style={{ aspectRatio: auto ? "4 / 3" : ratio, borderRadius: 24, minHeight: auto ? 260 : undefined }}
        >
          <Image src={photo} alt="" fill sizes="(min-width: 640px) 50vw, 100vw" style={cropStyle(parseCrop(about.crop))} />
        </div>
        <div className="flex flex-col justify-center py-2">
          {heading("font-display text-3xl font-semibold tracking-tight")}
          {story(text, "mt-5 text-soft")}
          <Signature text={signature} className="mt-6" editing={editing} />
        </div>
      </div>
    </section>
  );
}

/** Úpravy přímo ve webu: výzva k přidání sekce, dokud je vypnutá nebo prázdná. */
export function AboutPlaceholder() {
  return (
    <section id="o-nas" className="scroll-mt-20 border-t border-line">
      <div className={WRAP}>
        <div className="rounded-3xl border-2 border-dashed border-line px-6 py-10 text-center">
          <p className="font-display text-xl font-semibold">+ Přidat sekci O nás</p>
          <p className="mt-1 text-sm text-soft">Příběh vašeho místa a hostitelů — vyberte si vzhled a pište rovnou do webu.</p>
        </div>
      </div>
    </section>
  );
}
