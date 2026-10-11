"use client";

import { createContext, useContext, useLayoutEffect, useRef } from "react";
import type { MovableSection, TitleKey } from "@/lib/sections";

// Úpravy přímo ve webu (builder): text, do kterého se dá kliknout a psát,
// a obal sekce s tlačítkem „Upravit". Bez `editing` se vykreslí jako obyčejný
// web — veřejná stránka se tím nijak nemění.

/** Pole webu, která jdou upravit přímo v textu. */
export type EditableField =
  | "name"
  | "tagline"
  | "description"
  | "contactEmail"
  | "contactPhone"
  | "aboutTitle"
  | "aboutText"
  | "aboutSignature"
  // Nadpisy sekcí (lib/sections.ts) — jen v editoru webu
  | `title:${TitleKey}`;

/** Sekce webu (id v SiteView), které mají vlastní nastavení v bočním panelu. */
export type EditableSection = "uvod" | "galerie" | "o-miste" | "vybaveni" | "o-nas" | "recenze" | "poloha" | "rezervace" | "paticka";

export type SiteEditing = {
  text: (field: EditableField, value: string) => void;
  open: (section: EditableSection) => void;
  /** Posun sekce v pořadí (jen v editoru webu, jinde šipky nejsou). */
  move?: (section: EditableSection, by: -1 | 1) => void;
  /** Nadpisy sekcí jdou přepsat (jen v editoru webu, ne v onboardingu). */
  titles?: boolean;
};

export function EditableText({
  editing,
  field,
  value,
  placeholder,
  multiline = false,
  className = "",
  as: Tag = "span",
}: {
  editing?: SiteEditing;
  field: EditableField;
  value: string;
  placeholder: string;
  multiline?: boolean;
  className?: string;
  as?: "span" | "h1" | "h2" | "p" | "blockquote";
}) {
  const ref = useRef<HTMLElement>(null);

  // Nekontrolovaný prvek: text přepíšeme jen když v něm majitel zrovna nepíše,
  // jinak by React při každém písmenu skočil kurzorem na začátek.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value]);

  if (!editing) return <Tag className={className}>{value || placeholder}</Tag>;

  return (
    <Tag
      ref={ref as never}
      className={`editable ${className}`}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-label={placeholder}
      aria-multiline={multiline}
      data-placeholder={placeholder}
      onInput={(e) => editing.text(field, (e.currentTarget.textContent ?? "").replace(/ /g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") e.currentTarget.blur();
      }}
    />
  );
}

// Styly režimu úprav jedou s komponentou (ne v globals.css), aby náhled
// v iframe vypadal správně i bez ohledu na to, kterou verzi CSS prohlížeč drží.
// --edit-scale = zmenšení náhledu v builderu; ovládací prvky ho vyrovnávají,
// aby štítky a rámečky měly stejnou velikost i v malém náhledu.
const EDIT_CSS = `
:root{--edit-scale:1}
.editable{border-radius:6px;outline:1.5px dashed transparent;outline-offset:4px;cursor:text;transition:outline-color .15s,background-color .15s}
.editable:hover{outline-color:rgba(44,94,63,.45)}
.editable:focus{outline:2px solid #2c5e3f;background-color:rgba(44,94,63,.06)}
.editable:empty::before{content:attr(data-placeholder);opacity:.5;pointer-events:none}
.edit-section{position:relative;cursor:pointer;outline:calc(2px / var(--edit-scale)) dashed transparent;outline-offset:calc(-2px / var(--edit-scale));transition:outline-color .15s}
.edit-section:hover{outline-color:rgba(44,94,63,.4)}
.edit-chip-row{position:absolute;top:12px;right:12px;z-index:35;zoom:calc(1 / var(--edit-scale));display:flex;align-items:center;gap:6px}
.edit-chip{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:999px;background:#2c5e3f;color:#fff;padding:7px 14px;font:600 13px/1.2 var(--font-instrument),system-ui,sans-serif;box-shadow:0 4px 14px rgba(30,42,32,.25);cursor:pointer;opacity:0;transform:translateY(-4px);transition:opacity .15s,transform .15s,background-color .15s}
.edit-chip:hover{background:#21492f}
.edit-section:hover>.edit-chip-row>.edit-chip,.edit-chip:focus-visible{opacity:1;transform:none}
.move-block{position:relative}
.move-block::after{content:"";position:absolute;inset:0;z-index:34;pointer-events:none;outline:calc(2px / var(--edit-scale)) solid transparent;outline-offset:calc(-2px / var(--edit-scale));transition:outline-color .15s,background-color .15s}
.move-block:has(.move-row:hover)::after{outline-color:#2c5e3f;background:rgba(44,94,63,.06)}
.move-row{display:flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:#fff;box-shadow:0 4px 14px rgba(30,42,32,.25);font:600 12px/1.2 var(--font-instrument),system-ui,sans-serif;color:#2c5e3f;opacity:0;transform:translateY(-4px);transition:opacity .15s,transform .15s}
.move-row>span{padding:0 8px 0 4px;white-space:nowrap}
.move-row>button{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:999px;background:transparent;color:#2c5e3f;font-size:15px;cursor:pointer}
.move-row>button:hover{background:#eef2ea}
.move-row>button:disabled{cursor:default;color:rgba(44,94,63,.3);background:transparent}
.move-block:hover .move-row,.move-row:focus-within{opacity:1;transform:none}
@media (max-width:639px){.move-row>span{display:none}}
@media (hover:none){.edit-chip,.move-row{opacity:1;transform:none}}
`;

/** Styly režimu úprav — vykreslí se jednou na stránce, jen když se upravuje. */
export function EditStyles() {
  // Náhled běží v iframe zmenšeném přes CSS transform — zjistíme, o kolik.
  useLayoutEffect(() => {
    const frame = window.frameElement as HTMLElement | null;
    if (!frame) return;
    const sync = () => {
      const scale = frame.getBoundingClientRect().width / (window.innerWidth || 1);
      if (scale > 0) document.documentElement.style.setProperty("--edit-scale", String(Math.min(1, scale)));
    };
    sync();
    const id = window.setInterval(sync, 400);
    return () => window.clearInterval(id);
  }, []);
  return <style>{EDIT_CSS}</style>;
}

const SECTION_LABEL: Record<EditableSection, string> = {
  uvod: "Upravit úvod",
  galerie: "Upravit fotky",
  "o-miste": "Upravit popis a kontakt",
  vybaveni: "Upravit vybavení",
  poloha: "Upravit polohu",
  "o-nas": "Upravit O nás",
  recenze: "Upravit recenze",
  paticka: "Upravit patičku",
  rezervace: "Ceník a pobyt",
};

export function EditSection({
  editing,
  section,
  children,
}: {
  editing?: SiteEditing;
  section: EditableSection;
  children: React.ReactNode;
}) {
  const mv = useContext(MoveContext);
  if (!editing) return <>{children}</>;
  return (
    <div
      className="edit-section"
      // Klik kamkoli do sekce otevře její úpravy — kromě textu, který se píše přímo,
      // a ovládacích prvků webu (kalendář, tlačítka, mapa…)
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest(".editable, button, a, input, textarea, select, label, [role=dialog], .leaflet-control")) return;
        if (window.getSelection()?.toString()) return;
        e.stopPropagation();
        editing.open(section);
      }}
    >
      {children}
      <span className="edit-chip-row">
        {/* Šipky pro posun celého bloku — u první sekce bloku, vedle „Upravit" */}
        {mv?.block === section && !mv.split && <MoveArrows mv={mv} />}
        <button type="button" className="edit-chip" onClick={() => editing.open(section)}>
          ✎ {SECTION_LABEL[section]}
        </button>
      </span>
    </div>
  );
}

type MoveInfo = {
  move: (block: MovableSection, by: -1 | 1) => void;
  block: MovableSection;
  label: string;
  first: boolean;
  last: boolean;
  /** Blok z více sekcí vedle sebe (Popis + Vybavení): šipky vpravo nahoře celého bloku. */
  split?: boolean;
};
const MoveContext = createContext<MoveInfo | null>(null);

/**
 * Obal sekce (nebo více sekcí, např. Popis + Vybavení), který jde v editoru
 * webu posunout. Šipky vykreslí EditSection první sekce bloku vedle „Upravit“;
 * při najetí na ně se orámuje celý blok.
 */
export function MoveBlock({ move, children, ...info }: Omit<MoveInfo, "move"> & { move?: MoveInfo["move"]; children: React.ReactNode }) {
  if (!move) return <>{children}</>;
  return (
    <MoveContext.Provider value={{ move, ...info }}>
      <div className="move-block">
        {children}
        {info.split && (
          <span className="edit-chip-row">
            <MoveArrows mv={{ move, ...info }} />
          </span>
        )}
      </div>
    </MoveContext.Provider>
  );
}

/** Šipky ↑↓ s názvem bloku (vedle „Upravit“, u bloku z více sekcí vpravo nahoře). */
function MoveArrows({ mv }: { mv: MoveInfo }) {
  return (
    <span className="move-row" role="group" aria-label={`Pořadí sekce ${mv.label}`}>
      <button type="button" aria-label={`Posunout ${mv.label} výš`} title="Posunout výš" disabled={mv.first} onClick={() => mv.move(mv.block, -1)}>
        ↑
      </button>
      <button type="button" aria-label={`Posunout ${mv.label} níž`} title="Posunout níž" disabled={mv.last} onClick={() => mv.move(mv.block, 1)}>
        ↓
      </button>
      <span>{mv.label}</span>
    </span>
  );
}
