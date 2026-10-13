"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { htmlToRichText, richTextToHtml } from "@/lib/richtext";
import { EMAIL_VARS, isEmailVar } from "@/lib/email-templates";
import { Skeleton } from "@/components/Skeleton";
import { Icon } from "@/components/Icon";

// Úprava e-mailu přímo v jeho podobě: obálka, písmo a pevné části jsou stejné
// jako v odeslaném e-mailu (lib/email-templates → layout, renderEmailParts).
// Psát jde jen do průvodního textu; formátovací lišta se objeví nad označeným textem.

const VAR_RE = /\{([^{}\n]{1,30})\}/g;

/** {proměnné} jako zelené štítky — jen vzhled, uložený text se nemění. */
const MailVars = Extension.create({
  name: "mailVars",
  addProseMirrorPlugins() {
    const build = (doc: PmNode) => {
      const decos: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        for (const m of node.text.matchAll(VAR_RE)) {
          if (!isEmailVar(m[1])) continue;
          const from = pos + m.index;
          const to = from + m[0].length;
          decos.push(
            Decoration.inline(from, to, { class: "mail-var" }),
            Decoration.inline(from, from + 1, { class: "mail-var-brace" }),
            Decoration.inline(to - 1, to, { class: "mail-var-brace" }),
          );
        }
      });
      return DecorationSet.create(doc, decos);
    };
    return [
      new Plugin({
        state: {
          init: (_, { doc }) => build(doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

/** Text s {proměnnými} jako štítky (pro předmět). */
export function VarText({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(VAR_RE)) {
    if (!isEmailVar(m[1])) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={m.index} className="mail-var">
        <span className="mail-var-brace">{"{"}</span>
        {m[1]}
        <span className="mail-var-brace">{"}"}</span>
      </span>,
    );
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

/**
 * Předmět jako řádek v poště: textové pole leží přesně nad svou kopií, ve které
 * jsou proměnné vidět jako štítky. Dlouhý předmět se zalomí (hlavně na mobilu).
 */
export function SubjectField({
  value,
  onChange,
  inputRef,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onFocus: () => void;
}) {
  const shared = "whitespace-pre-wrap break-words px-1 py-0.5 font-semibold leading-snug";
  return (
    <div className="group relative min-w-0 flex-1 rounded-md transition focus-within:bg-pine/5 hover:bg-pine/5">
      <div aria-hidden className={`${shared} text-ink`}>
        <VarText text={value} />
        {"​"}
      </div>
      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        maxLength={150}
        aria-label="Předmět e-mailu"
        spellCheck={false}
        onFocus={onFocus}
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
        className={`${shared} absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent text-transparent caret-ink outline-none`}
      />
    </div>
  );
}

type Bar = { top: number; left: number; below: boolean };

/** Průvodní text e-mailu — píše se rovnou do e-mailu ve stejném písmu a velikostech. */
export function EmailTextEditor({
  value,
  onChange,
  insertRef,
  onFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  insertRef: React.MutableRefObject<((text: string) => void) | null>;
  onFocus: () => void;
}) {
  const emitted = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const wrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<Bar | null>(null);
  const [varsOpen, setVarsOpen] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: false,
      }),
      Placeholder.configure({ placeholder: "Napiš hostovi pár slov…" }),
      MailVars,
    ],
    content: richTextToHtml(value),
    editorProps: {
      attributes: {
        class: "email-editor",
        "aria-label": "Text e-mailu",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => {
      const next = editor.isEmpty ? "" : htmlToRichText(editor.getHTML());
      emitted.current = next;
      onChangeRef.current(next);
    },
  });

  useEffect(() => {
    if (!editor || value === emitted.current) return;
    emitted.current = value;
    editor.commands.setContent(richTextToHtml(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    insertRef.current = editor ? (text) => editor.chain().focus().insertContent(text).run() : null;
    return () => {
      insertRef.current = null;
    };
  }, [editor, insertRef]);

  // Lišta nad označeným textem; na dotykových zařízeních pod ním (nad textem je systémová nabídka)
  useEffect(() => {
    if (!editor) return;
    const place = () => {
      const wrap = wrapRef.current;
      const { from, to, empty } = editor.state.selection;
      if (!wrap || empty || !editor.isFocused) {
        setBar(null);
        setVarsOpen(false);
        return;
      }
      const w = wrap.getBoundingClientRect();
      const a = editor.view.coordsAtPos(from);
      const b = editor.view.coordsAtPos(to);
      const below = window.matchMedia("(pointer: coarse)").matches;
      const center = a.top === b.top ? (a.left + b.left) / 2 : a.left;
      setBar({ top: below ? b.bottom - w.top + 10 : a.top - w.top - 10, left: center - w.left, below });
    };
    const hide = () => {
      setBar(null);
      setVarsOpen(false);
    };
    editor.on("selectionUpdate", place);
    editor.on("focus", place);
    editor.on("blur", hide);
    return () => {
      editor.off("selectionUpdate", place);
      editor.off("focus", place);
      editor.off("blur", hide);
    };
  }, [editor]);

  // Lišta nesmí přetéct přes okraj e-mailu
  useLayoutEffect(() => {
    const el = barRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap || !bar) return;
    const max = wrap.clientWidth - el.offsetWidth / 2 + 8;
    const min = el.offsetWidth / 2 - 8;
    el.style.left = `${Math.max(min, Math.min(max, bar.left))}px`;
  }, [bar, varsOpen]);

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            h1: e.isActive("heading", { level: 1 }),
            h2: e.isActive("heading", { level: 2 }),
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
          }
        : null,
  });

  return (
    <div ref={wrapRef} className="mail-edit" onFocusCapture={onFocus}>
      <span className="mail-edit-tag" aria-hidden>
        {editor?.isFocused ? "Pro formátování označ text" : "Klikni a piš"}
      </span>
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div className="space-y-3 py-1" aria-hidden>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}
      {editor && bar && (
        <FormatBar
          barRef={barRef}
          editor={editor}
          bar={bar}
          active={active}
          varsOpen={varsOpen}
          setVarsOpen={setVarsOpen}
        />
      )}
    </div>
  );
}

function FormatBar({
  barRef,
  editor,
  bar,
  active,
  varsOpen,
  setVarsOpen,
}: {
  barRef: React.RefObject<HTMLDivElement | null>;
  editor: Editor;
  bar: Bar;
  active: Record<string, boolean> | null;
  varsOpen: boolean;
  setVarsOpen: (v: boolean) => void;
}) {
  const c = () => editor.chain().focus();
  const buttons = [
    { label: "H1", title: "Nadpis", on: active?.h1, run: () => c().toggleHeading({ level: 1 }).run() },
    { label: "H2", title: "Podnadpis", on: active?.h2, run: () => c().toggleHeading({ level: 2 }).run() },
    { sep: true },
    { label: <span className="font-bold">B</span>, title: "Tučně", on: active?.bold, run: () => c().toggleBold().run() },
    { label: <span className="font-serif italic">I</span>, title: "Kurzíva", on: active?.italic, run: () => c().toggleItalic().run() },
    { sep: true },
    { label: <BulletIcon />, title: "Odrážky", on: active?.bullet, run: () => c().toggleBulletList().run() },
    { label: "1.", title: "Číslování", on: active?.ordered, run: () => c().toggleOrderedList().run() },
    { sep: true },
    { label: "{ }", title: "Vložit údaj z rezervace", on: varsOpen, run: () => setVarsOpen(!varsOpen) },
  ] as const;

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Formátování textu"
      onMouseDown={(e) => e.preventDefault()} // neztratit označený text
      className="absolute z-20 w-max max-w-[calc(100%+16px)] rounded-xl bg-ink p-1 text-white shadow-[0_10px_28px_-8px_rgba(0,0,0,.45)]"
      style={{
        top: bar.top,
        left: bar.left,
        transform: bar.below ? "translateX(-50%)" : "translate(-50%, -100%)",
      }}
    >
      <div className="flex items-center gap-0.5">
        {buttons.map((b, i) =>
          "sep" in b ? (
            <span key={i} className="mx-0.5 h-5 w-px bg-white/20" />
          ) : (
            <button
              key={b.title}
              type="button"
              title={b.title}
              aria-label={b.title}
              aria-pressed={!!b.on}
              onClick={b.run}
              className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[13px] font-semibold transition ${
                b.on ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              {b.label}
            </button>
          ),
        )}
      </div>
      {varsOpen && (
        <div className="mt-1 flex max-w-72 flex-wrap gap-1 border-t border-white/15 px-0.5 pt-1.5 pb-0.5">
          {EMAIL_VARS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                c().insertContent(`{${v}}`).run();
                setVarsOpen(false);
              }}
              className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium transition hover:bg-white/20"
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BulletIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="14" r="1" fill="currentColor" />
      <path d="M8.5 6h8M8.5 14h8" />
    </svg>
  );
}

/**
 * Obálka e-mailu jako v poště: béžový podklad, bílá karta 520 px, logo.
 * Styly odpovídají layout() v lib/email-templates.
 */
export function EmailCanvas({ intro, body }: { intro: React.ReactNode; body: string }) {
  return (
    <div className="rounded-b-2xl border border-t-0 border-line bg-bg px-2.5 py-3 sm:p-6">
      <div className="email-html mx-auto max-w-[520px] rounded-2xl border border-line bg-white p-5 sm:p-7">
        <p style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, letterSpacing: "-.01em" }}>tainy</p>
        {intro}
        <div title="Doplní se automaticky z rezervace a nastavení">
          <span className="mt-3 -mb-1 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-soft shadow-sm">
            <Icon name="lock" size={12} />
            Doplní se automaticky z rezervace
          </span>
          {/* Naše vlastní HTML (lib/email-templates, údaje hosta jsou ošetřené) — jen ukázka, neklikatelné */}
          <div inert className="select-none opacity-55 grayscale-[.3]" dangerouslySetInnerHTML={{ __html: body }} />
        </div>
      </div>
    </div>
  );
}
