import { Fragment } from "react";
import { parseRichText, type Inline } from "@/lib/richtext";

// Vykreslení formátovaného textu (obchodní podmínky, zásady) — jen React prvky.

function Spans({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((c, i) => {
        const lines = c.text.split("\n").map((t, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {t}
          </Fragment>
        ));
        if (c.bold && c.italic)
          return (
            <strong key={i}>
              <em>{lines}</em>
            </strong>
          );
        if (c.bold) return <strong key={i}>{lines}</strong>;
        if (c.italic) return <em key={i}>{lines}</em>;
        return <Fragment key={i}>{lines}</Fragment>;
      })}
    </>
  );
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseRichText(text);
  return (
    <div className={`space-y-3 text-[15px] leading-relaxed text-ink ${className}`}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h1":
            return (
              <h2 key={i} className="pt-2 font-display text-2xl font-semibold first:pt-0">
                <Spans content={b.content} />
              </h2>
            );
          case "h2":
            return (
              <h3 key={i} className="pt-2 text-lg font-semibold first:pt-0">
                <Spans content={b.content} />
              </h3>
            );
          case "p":
            return (
              <p key={i}>
                <Spans content={b.content} />
              </p>
            );
          case "ul":
          case "ol": {
            const List = b.type;
            return (
              <List key={i} className={`space-y-1 pl-6 ${b.type === "ul" ? "list-disc" : "list-decimal"}`}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Spans content={item} />
                  </li>
                ))}
              </List>
            );
          }
        }
      })}
    </div>
  );
}
