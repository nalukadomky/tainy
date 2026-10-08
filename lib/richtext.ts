// Jednoduchý formátovaný text pro obchodní podmínky a zásady (podmnožina Markdownu):
//   # Nadpis, ## Podnadpis, **tučně**, *kurzíva*, - odrážka, 1. číslovaný bod,
//   prázdný řádek = nový odstavec. Vykresluje se do React prvků (components/RichText),
//   nikdy jako surové HTML — text od majitele tak nemůže vložit skript.

export type Inline = { text: string; bold?: boolean; italic?: boolean };
export type Block =
  | { type: "h1" | "h2" | "p"; content: Inline[] }
  | { type: "ul" | "ol"; items: Inline[][] };

/** **tučně** a *kurzíva* uvnitř řádku. */
// Hvězdička napsaná jako obyčejný znak se ukládá jako \* — dočasně ji nahradíme
// znakem, který v textu nebývá, ať ji regulární výraz nebere jako formátování.
const STAR = "\u0001";
const restore = (s: string) => s.replaceAll(STAR, "*");

export function parseInline(raw: string): Inline[] {
  const line = raw.replace(/\\\*/g, STAR);
  const out: Inline[] = [];
  const re = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index > last) out.push({ text: restore(line.slice(last, m.index)) });
    const token = m[0];
    out.push(
      token.startsWith("***")
        ? { text: restore(token.slice(3, -3)), bold: true, italic: true }
        : token.startsWith("**")
          ? { text: restore(token.slice(2, -2)), bold: true }
          : { text: restore(token.slice(1, -1)), italic: true }
    );
    last = m.index + token.length;
  }
  if (last < line.length) out.push({ text: restore(line.slice(last)) });
  return out;
}

const BULLET = /^\s*[-•*]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;

export function parseRichText(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", content: parseInline(para.join("\n")) });
    para = [];
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    // „\- text" = obyčejný řádek, který jen začíná pomlčkou, mřížkou nebo číslem
    if (/^\\[#\-•\d]/.test(line)) {
      para.push(line.slice(1));
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^##\s+/.test(line)) {
      flush();
      blocks.push({ type: "h2", content: parseInline(line.replace(/^##\s+/, "")) });
    } else if (/^#\s+/.test(line)) {
      flush();
      blocks.push({ type: "h1", content: parseInline(line.replace(/^#\s+/, "")) });
    } else if (BULLET.test(line) || NUMBER.test(line)) {
      flush();
      const type = BULLET.test(line) ? "ul" : "ol";
      const item = parseInline(line.replace(type === "ul" ? BULLET : NUMBER, ""));
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === type) prev.items.push(item);
      else blocks.push({ type, items: [item] });
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/* ---- Náš zápis → HTML pro editor (vizuální úpravy bez značek) ---- */

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function inlineHtml(content: Inline[]): string {
  return content
    .map((c) => {
      let h = escapeHtml(c.text).replace(/\n/g, "<br>");
      if (c.italic) h = `<em>${h}</em>`;
      if (c.bold) h = `<strong>${h}</strong>`;
      return h;
    })
    .join("");
}

/** Uložený text → HTML, které editor zobrazí jako formátovaný text. */
export function richTextToHtml(src: string): string {
  return parseRichText(src)
    .map((b) => {
      if ("items" in b) return `<${b.type}>${b.items.map((i) => `<li><p>${inlineHtml(i)}</p></li>`).join("")}</${b.type}>`;
      return `<${b.type}>${inlineHtml(b.content)}</${b.type}>`;
    })
    .join("");
}

/* ---- Převod HTML (z editoru nebo z Wordu přes mammoth) na náš zápis ---- */

function inlineOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\s+/g, " ").replace(/\*/g, "\\*");
  if (!(node instanceof Element)) return "";
  const inner = [...node.childNodes].map(inlineOf).join("");
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (!inner.trim()) return inner;
  // Mezery na krajích nechat mimo značky, jinak by se ** nerozpoznaly
  const [, lead, core, trail] = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  if (tag === "strong" || tag === "b") return `${lead}**${core}**${trail}`;
  if (tag === "em" || tag === "i") return `${lead}*${core}*${trail}`;
  return inner;
}

/** Řádky odstavce, které by se jinak četly jako nadpis nebo seznam, dostanou „\\". */
const protectLines = (text: string) =>
  text
    .split("\n")
    .map((l) => (/^\s*(#|[-•]\s|\d+[.)]\s)/.test(l) ? `\\${l.trimStart()}` : l))
    .join("\n");

/** HTML (z Wordu) → náš zápis. Běží jen v prohlížeči (DOMParser). */
export function htmlToRichText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: string[] = [];
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      const tag = child.tagName.toLowerCase();
      const text = inlineOf(child).trim();
      if (tag === "h1") out.push(`# ${text}`, "");
      else if (/^h[2-6]$/.test(tag)) out.push(`## ${text}`, "");
      else if (tag === "ul" || tag === "ol") {
        [...child.children].forEach((li, i) => {
          const t = inlineOf(li).trim();
          if (t) out.push(tag === "ul" ? `- ${t}` : `${i + 1}. ${t}`);
        });
        out.push("");
      } else if (tag === "table") {
        for (const row of child.querySelectorAll("tr")) {
          const cells = [...row.children].map((c) => inlineOf(c).trim()).filter(Boolean);
          if (cells.length) out.push(cells.join(" — "));
        }
        out.push("");
      } else if (tag === "p") {
        if (text) out.push(protectLines(text), "");
      } else walk(child);
    }
  };
  walk(doc.body);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
