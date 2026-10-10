"use client";

import { useLayoutEffect, useRef } from "react";

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
  | "aboutSignature";

/** Sekce webu (id v SiteView), které mají vlastní nastavení v bočním panelu. */
export type EditableSection = "uvod" | "galerie" | "o-miste" | "vybaveni" | "o-nas" | "poloha" | "rezervace" | "paticka";

export type SiteEditing = {
  text: (field: EditableField, value: string) => void;
  open: (section: EditableSection) => void;
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
.edit-chip{position:absolute;top:12px;right:12px;z-index:35;zoom:calc(1 / var(--edit-scale));display:inline-flex;align-items:center;gap:6px;border:0;border-radius:999px;background:#2c5e3f;color:#fff;padding:7px 14px;font:600 13px/1.2 var(--font-instrument),system-ui,sans-serif;box-shadow:0 4px 14px rgba(30,42,32,.25);cursor:pointer;opacity:0;transform:translateY(-4px);transition:opacity .15s,transform .15s,background-color .15s}
.edit-chip:hover{background:#21492f}
.edit-section:hover>.edit-chip,.edit-chip:focus-visible{opacity:1;transform:none}
@media (hover:none){.edit-chip{opacity:1;transform:none}}
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
      <button type="button" className="edit-chip" onClick={() => editing.open(section)}>
        ✎ {SECTION_LABEL[section]}
      </button>
    </div>
  );
}
