"use client";

import {
  COUNTRY_OPTIONS,
  DOC_REQUIRED_AGE,
  DOC_TYPES,
  EXEMPTIONS,
  PURPOSES,
  ageAt,
  isForeign,
  type GuestPerson,
} from "@/lib/guestbook";

// Pole jedné osoby z check-inu — sdílí je formulář hosta i ruční doplnění
// v administraci. Pole pro cizince (vízum, účel pobytu) se ukážou jen u jiného
// občanství než českého; osvobození od poplatku vidí jen majitel.

type Props = {
  value: GuestPerson;
  onChange: (p: GuestPerson) => void;
  arrival: string;
  /** Chybné pole (podle validatePerson) — zvýrazní se a dostane fokus. */
  errorField?: keyof GuestPerson | null;
  /** Adresu převzít od první osoby (zaškrtávátko „Stejná adresa jako osoba 1“). */
  sameAddress?: { checked: boolean; onToggle: (v: boolean) => void } | null;
  owner?: boolean;
};

export function GuestPersonFields({ value: p, onChange, arrival, errorField, sameAddress, owner = false }: Props) {
  const set = <K extends keyof GuestPerson>(k: K, v: GuestPerson[K]) => onChange({ ...p, [k]: v });
  const err = (k: keyof GuestPerson) => (errorField === k ? "!border-coral ring-2 ring-coral/15" : "");
  const young = p.birthDate ? ageAt(p.birthDate, arrival) < DOC_REQUIRED_AGE : false;
  const foreign = isForeign(p);
  const label = "mb-1 block text-xs font-medium text-soft";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className={label}>Jméno</span>
        <input className={`field ${err("firstName")}`} autoComplete="off" value={p.firstName} onChange={(e) => set("firstName", e.target.value)} />
      </label>
      <label className="block">
        <span className={label}>Příjmení</span>
        <input className={`field ${err("lastName")}`} autoComplete="off" value={p.lastName} onChange={(e) => set("lastName", e.target.value)} />
      </label>
      <label className="block">
        <span className={label}>Datum narození</span>
        <input
          type="date"
          className={`field field-time ${err("birthDate")}`}
          max={new Date().toISOString().slice(0, 10)}
          value={p.birthDate}
          onChange={(e) => set("birthDate", e.target.value)}
        />
      </label>
      <label className="block">
        <span className={label}>Státní občanství</span>
        <select className="field" value={p.nationality} onChange={(e) =>
            // Stát bydliště jde s občanstvím, dokud ho host nezměnil zvlášť
            onChange({ ...p, nationality: e.target.value, ...(p.country === p.nationality && { country: e.target.value }) })
          }>
          {COUNTRY_OPTIONS.map(([c, n]) => (
            <option key={c} value={c}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={label}>Doklad</span>
        <select className="field" value={p.docType} onChange={(e) => set("docType", e.target.value as GuestPerson["docType"])}>
          {DOC_TYPES.map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={label}>
          Číslo dokladu{young && <span className="font-normal"> (u dětí do {DOC_REQUIRED_AGE} let nepovinné)</span>}
        </span>
        <input
          className={`field uppercase ${err("docNumber")}`}
          autoComplete="off"
          value={p.docNumber}
          onChange={(e) => set("docNumber", e.target.value)}
        />
      </label>

      {sameAddress && (
        <label className="flex cursor-pointer items-center gap-2.5 text-sm sm:col-span-2">
          <input type="checkbox" checked={sameAddress.checked} onChange={(e) => sameAddress.onToggle(e.target.checked)} className="h-5 w-5 accent-[var(--pine)]" />
          Stejná adresa jako osoba 1
        </label>
      )}
      {!sameAddress?.checked && (
        <>
          <p className="-mb-1 mt-1 text-xs font-semibold uppercase tracking-wider text-soft sm:col-span-2">
            Adresa bydliště{foreign ? " (v cizině)" : ""}
          </p>
          <label className="block sm:col-span-2">
            <span className={label}>Ulice a číslo domu</span>
            <input className={`field ${err("street")}`} autoComplete="off" value={p.street} onChange={(e) => set("street", e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>Obec / město</span>
            <input className={`field ${err("city")}`} autoComplete="off" value={p.city} onChange={(e) => set("city", e.target.value)} />
          </label>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
            <label className="block">
              <span className={label}>PSČ</span>
              <input className="field" autoComplete="off" value={p.zip} onChange={(e) => set("zip", e.target.value)} />
            </label>
            <label className="block">
              <span className={label}>Stát</span>
              <select className="field" value={p.country} onChange={(e) => set("country", e.target.value)}>
                {COUNTRY_OPTIONS.map(([c, n]) => (
                  <option key={c} value={c}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}

      {foreign && (
        <>
          <p className="-mb-1 mt-1 text-xs font-semibold uppercase tracking-wider text-soft sm:col-span-2">Pro cizince</p>
          <label className="block">
            <span className={label}>Číslo víza (pokud máš)</span>
            <input className="field uppercase" autoComplete="off" value={p.visa} onChange={(e) => set("visa", e.target.value)} />
          </label>
          <label className="block">
            <span className={label}>Účel pobytu</span>
            <select className="field" value={p.purpose} onChange={(e) => set("purpose", e.target.value)}>
              {PURPOSES.map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {owner && (
        <>
          <label className="block">
            <span className={label}>Osvobození od poplatku</span>
            <select className="field" value={p.exempt} onChange={(e) => set("exempt", e.target.value as GuestPerson["exempt"])}>
              {EXEMPTIONS.map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-soft">Děti do 18 let se poznají z data narození samy.</span>
          </label>
          <label className="block">
            <span className={label}>Poznámka</span>
            <input className="field" value={p.note} onChange={(e) => set("note", e.target.value)} />
          </label>
        </>
      )}
    </div>
  );
}
