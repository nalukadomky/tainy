"use client";

import { useRef, useState } from "react";

// Nabídka sekcí v nadpisu panelu editoru webu: přepnutí na jinou sekci,
// přetažení sekcí do jiného pořadí (za úchyt ⋮⋮, myší i prstem) a vypnutí
// nepovinných sekcí. Vypnuté jsou dole ve skupině „Neaktivní“.

export type MenuSection = {
  key: string;
  label: string;
  /** Blok, se kterým se sekce přetahuje (Popis + Vybavení jsou jeden); bez něj je sekce pevná. */
  block?: string;
  /** Nepovinná sekce, kterou jde vypnout. */
  optional?: boolean;
  /** Vypnutá na webu. */
  off?: boolean;
};

type Unit = { block?: string; items: MenuSection[] };

/** Sousední sekce se stejným blokem → jedna přetahovací jednotka. */
function toUnits(list: MenuSection[]): Unit[] {
  const units: Unit[] = [];
  for (const s of list) {
    const last = units[units.length - 1];
    if (s.block && last?.block === s.block) last.items.push(s);
    else units.push({ block: s.block, items: [s] });
  }
  return units;
}

export function SectionMenu({
  sections,
  current,
  onSwitch,
  onReorder,
  onToggle,
}: {
  sections: MenuSection[];
  current?: string;
  onSwitch: (key: string) => void;
  /** Nové pořadí zapnutých bloků (shora dolů). */
  onReorder?: (blocks: string[]) => void;
  onToggle?: (key: string, on: boolean) => void;
}) {
  const units = toUnits(sections.filter((s) => !s.off));
  const blocks = units.flatMap((u) => (u.block ? [u.block] : []));
  const off = sections.filter((s) => s.off);

  // Přetahování: pořadí bloků během tažení a výchozí středy jednotek
  const [drag, setDrag] = useState<{ block: string; order: string[] } | null>(null);
  const centers = useRef<{ block: string; y: number }[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  function start(e: React.PointerEvent, block: string) {
    if (!onReorder) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    centers.current = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-block]") ?? [])].map((el) => {
      const r = el.getBoundingClientRect();
      return { block: el.dataset.block!, y: r.top + r.height / 2 };
    });
    setDrag({ block, order: blocks });
  }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    // Nové místo = kolik ostatních bloků má střed nad prstem
    const others = centers.current.filter((c) => c.block !== drag.block);
    const index = others.filter((c) => c.y < e.clientY).length;
    const order = others.map((c) => c.block);
    order.splice(index, 0, drag.block);
    if (order.join() !== drag.order.join()) setDrag({ ...drag, order });
  }
  function end() {
    if (!drag) return;
    if (drag.order.join() !== blocks.join()) onReorder?.(drag.order);
    setDrag(null);
  }

  // Během tažení se jednotky vykreslí v novém pořadí (pevné zůstanou na svých místech)
  const shown = drag
    ? (() => {
        const queue = drag.order.map((b) => units.find((u) => u.block === b)!);
        return units.map((u) => (u.block ? queue.shift()! : u));
      })()
    : units;

  const row = (s: MenuSection, active: boolean) => (
    <div key={s.key} className="flex items-center">
      <button
        role="menuitem"
        type="button"
        onClick={() => onSwitch(s.key)}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-bg ${
          s.key === current ? "font-semibold text-pine" : active ? "text-ink" : "text-soft"
        }`}
      >
        <span className="truncate">{s.label}</span>
        {s.key === current && <span aria-hidden>✓</span>}
      </button>
      {s.optional && onToggle && <Switch on={active} label={s.label} onChange={(on) => onToggle(s.key, on)} />}
    </div>
  );

  return (
    <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-72 rounded-2xl border border-line bg-surface p-1.5 shadow-lg">
      <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-soft">Sekce webu</p>
      <div ref={listRef}>
        {shown.map((u) => {
          const dragging = drag?.block === u.block && !!u.block;
          return (
            <div
              key={u.block ?? u.items[0].key}
              data-block={u.block}
              className={`flex items-center rounded-xl transition-shadow ${dragging ? "relative z-10 bg-surface shadow-lg ring-1 ring-pine/30" : ""}`}
            >
              {u.block && onReorder ? (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Přetáhnout ${u.items.map((s) => s.label).join(" a ")}`}
                  title="Přetáhni na jiné místo"
                  onPointerDown={(e) => start(e, u.block!)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  className={`flex w-7 shrink-0 items-center justify-center self-stretch rounded-lg text-soft/70 hover:bg-bg hover:text-ink ${
                    dragging ? "cursor-grabbing" : "cursor-grab"
                  }`}
                  style={{ touchAction: "none" }}
                >
                  <Grip />
                </span>
              ) : (
                <span className="w-7 shrink-0" aria-hidden />
              )}
              <div className="min-w-0 flex-1">{u.items.map((s) => row(s, true))}</div>
            </div>
          );
        })}
      </div>
      {off.length > 0 && (
        <>
          <p className="mt-1 border-t border-line px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-soft">
            Neaktivní
          </p>
          {off.map((s) => (
            <div key={s.key} className="flex items-center">
              <span className="w-7 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">{row(s, false)}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${on ? "Vypnout" : "Zapnout"} sekci ${label}`}
      title={on ? "Vypnout sekci" : "Zapnout sekci"}
      onClick={() => onChange(!on)}
      className="mx-1.5 shrink-0 rounded-full p-1"
    >
      <span
        className={`relative block rounded-full transition-colors ${on ? "bg-pine" : "bg-line"}`}
        style={{ width: 34, height: 20 }}
      >
        <span
          className="absolute rounded-full bg-white shadow transition-transform"
          style={{ top: 2, left: 2, width: 16, height: 16, transform: on ? "translateX(14px)" : "none" }}
        />
      </span>
    </button>
  );
}

function Grip() {
  return (
    <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden fill="currentColor">
      {[3, 8, 13].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.3" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.3" />])}
    </svg>
  );
}
