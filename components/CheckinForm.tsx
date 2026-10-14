"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { GuestPersonFields } from "@/components/GuestPersonFields";
import { emptyPerson, validatePerson, type GuestPerson } from "@/lib/guestbook";

// Check-in hosta: seznam osob a průvodce osobou po osobě. Na telefonu jedna
// osoba na obrazovku, na počítači seznam vlevo a formulář vpravo. Uložení
// běží na pozadí — průvodce hned pokračuje, při chybě se vrátí k osobě.
// Uložené údaje se sem zpátky nenačítají (vidí je jen ubytovatel).

export type CheckinSlot = { position: number; label: string; filled: boolean; name: string };

type Props = {
  token: string;
  slots: CheckinSlot[];
  guestName: string;
  arrival: string;
};

const ADDRESS = ["street", "city", "zip", "country"] as const;

export function CheckinForm({ token, slots: initial, guestName, arrival }: Props) {
  const [slots, setSlots] = useState(initial);
  const [step, setStep] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, GuestPerson>>({});
  const [same, setSame] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<{ position: number; text: string; field: keyof GuestPerson | null } | null>(null);
  const [finishing, setFinishing] = useState(false);
  // Rozpracované uložení: odchod ze stránky by ho přerušil — prohlížeč se zeptá
  const pending = useRef(0);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const total = slots.length;
  const filled = slots.filter((s) => s.filled).length;
  const done = filled === total;

  const draftOf = (i: number) => drafts[i] ?? emptyPerson(i === 0 ? guestName : "");
  // Adresu první osoby jde převzít, jen když ji host vyplnil teď (uložené se nenačítají)
  const firstAddress = drafts[0]?.street ? drafts[0] : null;
  const usesSame = (i: number) => i > 0 && !!firstAddress && (same[i] ?? true);

  function open(i: number) {
    setError(null);
    setStep(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(i: number) {
    let person = draftOf(i);
    if (usesSame(i) && firstAddress) for (const k of ADDRESS) person = { ...person, [k]: firstAddress[k] };
    const v = validatePerson(person, arrival);
    if ("error" in v) return setError({ position: i, text: v.error, field: v.field });
    setError(null);
    const before = slots;
    const name = `${v.person.firstName} ${v.person.lastName.charAt(0)}.`;
    const next = slots.map((s) => (s.position === i ? { ...s, filled: true, name } : s));
    const following = next.find((s) => !s.filled && s.position > i) ?? next.find((s) => !s.filled);
    // Další osoba hned (uložení běží na pozadí); poslední krok počká, než je vše uložené
    if (following) {
      setSlots(next);
      setStep(following.position);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else setFinishing(true);

    pending.current++;
    const res = await fetch(`/api/checkin/${token}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ position: i, person: v.person }),
    }).catch(() => null);
    pending.current--;
    if (!following) {
      // Hotovo až po uložení všech rozpracovaných osob
      while (pending.current) await new Promise((r) => setTimeout(r, 100));
      setFinishing(false);
      if (res?.ok) {
        setSlots(next);
        setStep(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setSlots((cur) => cur.map((s) => (s.position === i ? (before.find((b) => b.position === i) ?? s) : s)));
      setStep(i);
      setError({ position: i, text: data?.error ?? "Uložení se nepovedlo. Zkus to prosím znovu.", field: data?.field ?? null });
    }
  }

  const editing = step !== null;
  const current = editing ? slots.find((s) => s.position === step)! : null;

  return (
    <div className="md:grid md:grid-cols-[250px_minmax(0,1fr)] md:items-start md:gap-8">
      {/* Seznam osob — na telefonu jen mimo vyplňování */}
      <aside className={editing ? "hidden md:block" : ""}>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Check-in</h1>
        <p className="mt-2 text-sm text-soft">
          Ze zákona vedeme knihu ubytovaných. Vyplň prosím údaje za všechny, kdo přijedou — {total}{" "}
          {total === 1 ? "osobu" : total < 5 ? "osoby" : "osob"}.
        </p>
        <ol className="mt-5 space-y-2 md:space-y-1">
          {slots.map((s) => {
            const active = s.position === step;
            return (
              <li key={s.position}>
                <button
                  type="button"
                  onClick={() => open(s.position)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition md:border-transparent md:px-3 md:py-2.5 ${
                    active ? "border-pine/30 bg-surface font-semibold shadow-sm" : "border-line bg-surface hover:border-pine/30 md:bg-transparent md:hover:bg-surface"
                  }`}
                >
                  {s.filled ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pine text-[10px] font-bold text-white">✓</span>
                  ) : active ? (
                    <span className="h-5 w-5 shrink-0 rounded-full border-[5px] border-pine" />
                  ) : (
                    <span className="h-5 w-5 shrink-0 rounded-full border-2 border-dashed border-line" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{s.filled ? s.name : `Osoba ${s.position + 1} · ${s.label}`}</span>
                  <span className={`shrink-0 font-semibold md:hidden ${s.filled ? "text-soft" : "text-pine"}`}>{s.filled ? "Upravit" : "Vyplnit"}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {!editing && !done && (
          <button type="button" className="btn-primary mt-5 w-full md:hidden" onClick={() => open(slots.find((s) => !s.filled)!.position)}>
            {filled ? "Pokračovat" : "Začít"} →
          </button>
        )}
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-pine/5 px-4 py-3 text-xs text-soft md:bg-transparent md:px-3">
          <Icon name="lock" size={15} className="mt-0.5 shrink-0 text-pine" />
          Údaje se ukládají šifrovaně, vidí je jen ubytovatel a po uplynutí zákonné lhůty se smažou.
        </p>
      </aside>

      <section className={`${editing ? "" : "mt-6 md:mt-0"} min-w-0`}>
        {current ? (
          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">
                Osoba {current.position + 1} z {total}
              </h2>
              <span className="text-sm text-soft">{current.label}</span>
            </div>
            {current.filled && (
              <p className="mt-2 rounded-xl bg-bg px-3 py-2 text-sm text-soft">
                Údaje už máme. Pokud se něco změnilo, vyplň je prosím znovu — uložené nahradí.
              </p>
            )}
            <div className="mt-5">
              <GuestPersonFields
                value={draftOf(current.position)}
                onChange={(p) => setDrafts((d) => ({ ...d, [current.position]: p }))}
                arrival={arrival}
                errorField={error?.position === current.position ? error.field : null}
                sameAddress={
                  current.position > 0 && firstAddress
                    ? { checked: usesSame(current.position), onToggle: (v) => setSame((s) => ({ ...s, [current.position]: v })) }
                    : null
                }
              />
            </div>
            {error?.position === current.position && (
              <p className="mt-4 text-sm text-coral" role="alert">
                {error.text}
              </p>
            )}
            <div className="mt-7 flex items-center justify-between gap-3">
              <button type="button" className="text-sm font-medium text-soft hover:text-ink" onClick={() => setStep(current.position > 0 ? current.position - 1 : null)}>
                ← {current.position > 0 ? `Osoba ${current.position}` : "Zpět"}
              </button>
              <button type="button" className="btn-primary" disabled={finishing} onClick={() => save(current.position)}>
                {finishing ? "Ukládám…" : slots.some((s) => !s.filled && s.position !== current.position) ? "Uložit a další osoba →" : "Uložit a dokončit"}
              </button>
            </div>
          </div>
        ) : done ? (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center sm:p-10">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pine text-2xl text-white">✓</span>
            <p className="mt-4 font-display text-2xl font-semibold">Check-in hotový</p>
            <p className="mt-2 text-soft">Díky! Údaje za {total === 1 ? "tebe" : `všech ${total} osob`} máme. Při příjezdu už nic vyplňovat nemusíš.</p>
          </div>
        ) : (
          <div className="hidden rounded-2xl border border-dashed border-line p-10 text-center text-soft md:block">
            Vyber osobu vlevo a vyplň její údaje.
            <div className="mt-5">
              <button type="button" className="btn-primary" onClick={() => open(slots.find((s) => !s.filled)!.position)}>
                {filled ? "Pokračovat" : "Začít"} →
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
