"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Telefon s předvolbou: výchozí Česko (+420), předvolbu jde změnit přes nabídku
// s vyhledáváním (název země nebo číslo). Hodnota je celé číslo „+420 777 123 456“.

type Country = { iso: string; name: string; dial: string };

// Evropa a nejčastější země hostů odjinud, česky
const COUNTRIES: Country[] = [
  ["CZ", "Česko", "+420"], ["SK", "Slovensko", "+421"], ["DE", "Německo", "+49"], ["AT", "Rakousko", "+43"],
  ["PL", "Polsko", "+48"], ["HU", "Maďarsko", "+36"], ["UA", "Ukrajina", "+380"], ["GB", "Spojené království", "+44"],
  ["IE", "Irsko", "+353"], ["FR", "Francie", "+33"], ["IT", "Itálie", "+39"], ["ES", "Španělsko", "+34"],
  ["PT", "Portugalsko", "+351"], ["NL", "Nizozemsko", "+31"], ["BE", "Belgie", "+32"], ["LU", "Lucembursko", "+352"],
  ["CH", "Švýcarsko", "+41"], ["LI", "Lichtenštejnsko", "+423"], ["DK", "Dánsko", "+45"], ["SE", "Švédsko", "+46"],
  ["NO", "Norsko", "+47"], ["FI", "Finsko", "+358"], ["IS", "Island", "+354"], ["EE", "Estonsko", "+372"],
  ["LV", "Lotyšsko", "+371"], ["LT", "Litva", "+370"], ["SI", "Slovinsko", "+386"], ["HR", "Chorvatsko", "+385"],
  ["RS", "Srbsko", "+381"], ["BA", "Bosna a Hercegovina", "+387"], ["ME", "Černá Hora", "+382"],
  ["MK", "Severní Makedonie", "+389"], ["AL", "Albánie", "+355"], ["BG", "Bulharsko", "+359"], ["RO", "Rumunsko", "+40"],
  ["MD", "Moldavsko", "+373"], ["GR", "Řecko", "+30"], ["CY", "Kypr", "+357"], ["MT", "Malta", "+356"],
  ["AD", "Andorra", "+376"], ["MC", "Monako", "+377"], ["SM", "San Marino", "+378"], ["TR", "Turecko", "+90"],
  ["BY", "Bělorusko", "+375"], ["RU", "Rusko", "+7"], ["GE", "Gruzie", "+995"], ["AM", "Arménie", "+374"],
  ["AZ", "Ázerbájdžán", "+994"], ["IL", "Izrael", "+972"], ["AE", "Spojené arabské emiráty", "+971"],
  ["US", "Spojené státy", "+1"], ["CA", "Kanada", "+1"], ["MX", "Mexiko", "+52"], ["BR", "Brazílie", "+55"],
  ["AR", "Argentina", "+54"], ["AU", "Austrálie", "+61"], ["NZ", "Nový Zéland", "+64"], ["JP", "Japonsko", "+81"],
  ["KR", "Jižní Korea", "+82"], ["CN", "Čína", "+86"], ["IN", "Indie", "+91"], ["VN", "Vietnam", "+84"],
  ["TH", "Thajsko", "+66"], ["SG", "Singapur", "+65"], ["PH", "Filipíny", "+63"], ["ID", "Indonésie", "+62"],
  ["MY", "Malajsie", "+60"], ["ZA", "Jihoafrická republika", "+27"], ["EG", "Egypt", "+20"],
].map(([iso, name, dial]) => ({ iso, name, dial }));

const DEFAULT = COUNTRIES[0];

/** Vlajka z kódu země (regionální symboly). */
const flag = (iso: string) => String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Rozdělí uložené číslo na zemi (nejdelší shodná předvolba) a zbytek. */
function split(value: string): { country: Country; number: string } {
  const v = value.trim();
  if (!v.startsWith("+")) return { country: DEFAULT, number: v };
  const match = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => v.replace(/\s/g, "").startsWith(c.dial));
  return match ? { country: match, number: v.slice(v.indexOf(match.dial) + match.dial.length).trim() } : { country: DEFAULT, number: v };
}

/** Telefon je vyplněný rozumně: 6–14 číslic za předvolbou. */
export function isPhoneComplete(value: string): boolean {
  const { number } = split(value);
  const digits = number.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 14;
}

export function PhoneInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const initial = useMemo(() => split(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [country, setCountry] = useState<Country>(initial.country);
  const [number, setNumber] = useState(initial.number);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);

  const emit = (c: Country, n: string) => onChange(n.trim() ? `${c.dial} ${n.trim()}` : "");

  const results = useMemo(() => {
    const q = norm(query.trim()).replace(/^\+/, "");
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => norm(c.name).includes(q) || c.dial.slice(1).startsWith(q) || c.iso.toLowerCase() === q);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(c: Country) {
    setCountry(c);
    setOpen(false);
    setQuery("");
    emit(c, number);
    requestAnimationFrame(() => numberRef.current?.focus());
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Předvolba ${country.name} ${country.dial}`}
          className="field flex shrink-0 items-center gap-1.5 !px-3 tabular-nums"
          style={{ width: "auto" }}
        >
          <span aria-hidden>{flag(country.iso)}</span>
          <span>{country.dial}</span>
          <span className="text-xs text-soft" aria-hidden>
            ▾
          </span>
        </button>
        <input
          ref={numberRef}
          className="field min-w-0 flex-1"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="777 123 456"
          value={number}
          onChange={(e) => {
            setNumber(e.target.value);
            emit(country, e.target.value);
          }}
        />
      </div>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              className="field !py-2"
              placeholder="Hledat zemi nebo předvolbu…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) {
                  e.preventDefault();
                  pick(results[0]);
                }
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>
          <ul role="listbox" aria-label="Předvolby" className="max-h-60 overflow-y-auto overscroll-contain p-1">
            {results.map((c) => (
              <li key={c.iso}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.iso === country.iso}
                  onClick={() => pick(c)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-bg ${
                    c.iso === country.iso ? "bg-pine/10 font-semibold text-pine" : "text-ink"
                  }`}
                >
                  <span aria-hidden>{flag(c.iso)}</span>
                  <span className="flex-1">{c.name}</span>
                  <span className="tabular-nums text-soft">{c.dial}</span>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="px-3 py-3 text-sm text-soft">Žádná země neodpovídá.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
