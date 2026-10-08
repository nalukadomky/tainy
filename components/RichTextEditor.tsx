"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { htmlToRichText, richTextToHtml } from "@/lib/richtext";
import { Skeleton } from "@/components/Skeleton";

// Vizuální editor (jako ve Wordu): nadpis je rovnou velký, tučné tučně, odrážky
// jako odrážky — žádné značky. Ukládá se do našeho jednoduchého zápisu
// (lib/richtext), takže web text vykresluje stejně bezpečně jako dřív.

// Vzhled obsahu (nadpisy, odrážky…) je ve třídě .rich-editor v app/globals.css
// a odpovídá tomu, jak text uvidí hosté (components/RichText).
const CONTENT = "rich-editor";

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  // Poslední hodnota, kterou editor sám odeslal — změnu zvenku (vzor, převod
  // z Wordu) do editoru propíšeme, vlastní psaní ne (jinak by skákal kurzor).
  const emitted = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
      Placeholder.configure({ placeholder }),
    ],
    content: richTextToHtml(value),
    editorProps: { attributes: { class: CONTENT, "aria-label": placeholder, role: "textbox", "aria-multiline": "true" } },
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

  const buttons: { label: React.ReactNode; title: string; on?: boolean; run: () => void }[] = editor
    ? [
        { label: "Nadpis", title: "Nadpis", on: active?.h1, run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
        { label: "Podnadpis", title: "Podnadpis", on: active?.h2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
        { label: <span className="font-bold">B</span>, title: "Tučně", on: active?.bold, run: () => editor.chain().focus().toggleBold().run() },
        { label: <span className="font-serif italic">I</span>, title: "Kurzíva", on: active?.italic, run: () => editor.chain().focus().toggleItalic().run() },
        { label: "• Odrážky", title: "Seznam s odrážkami", on: active?.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
        { label: "1. Číslování", title: "Číslovaný seznam", on: active?.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
      ]
    : [];

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface focus-within:border-pine/50">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-bg px-2 py-1.5" role="toolbar" aria-label="Formátování textu">
        {buttons.map((b) => (
          <button
            key={b.title}
            type="button"
            title={b.title}
            aria-pressed={!!b.on}
            onMouseDown={(e) => e.preventDefault()} // neztratit kurzor v textu
            onClick={b.run}
            className={`rounded-lg px-2.5 py-1 text-sm font-medium transition ${
              b.on ? "bg-ink text-white" : "text-ink hover:bg-surface"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {editor ? (
        <EditorContent editor={editor} className="max-h-[70vh] overflow-y-auto" />
      ) : (
        <div className="min-h-64 space-y-2.5 px-4 py-4" aria-hidden>
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}
    </div>
  );
}
