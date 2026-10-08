// Ložnice a lůžka ubytování (Site.sleeping, JSON). Souhrn za celé ubytování:
// počet ložnic a počty jednotlivých druhů lůžek. Rozkládací pohovka může být
// pro 1 nebo 2 osoby.

import { plural } from "@/lib/pricing";

export type Sleeping = {
  bedrooms: number;
  double: number;
  single: number;
  extra: number;
  sofa: number;
  sofaSleeps: 1 | 2;
};

export const EMPTY_SLEEPING: Sleeping = { bedrooms: 0, double: 0, single: 0, extra: 0, sofa: 0, sofaSleeps: 2 };

const count = (v: unknown) => Math.max(0, Math.min(50, Math.round(Number(v) || 0)));

export function parseSleeping(raw: string | null | undefined): Sleeping {
  try {
    const d = raw ? JSON.parse(raw) : {};
    return {
      bedrooms: count(d.bedrooms),
      double: count(d.double),
      single: count(d.single),
      extra: count(d.extra),
      sofa: count(d.sofa),
      sofaSleeps: d.sofaSleeps === 1 ? 1 : 2,
    };
  } catch {
    return { ...EMPTY_SLEEPING };
  }
}

/** Prázdné nastavení se ukládá jako "" — web pak nic neukazuje. */
export function serializeSleeping(s: Sleeping): string {
  const clean = parseSleeping(JSON.stringify(s));
  const empty = !clean.bedrooms && !clean.double && !clean.single && !clean.extra && !clean.sofa;
  return empty ? "" : JSON.stringify(clean);
}

/** Kolik lidí se celkem vyspí. */
export function sleepsTotal(s: Sleeping): number {
  return s.single + s.double * 2 + s.extra + s.sofa * s.sofaSleeps;
}

/** Jednotlivá lůžka jako krátké štítky: „2× manželská postel", „1× rozkládací pohovka pro 2". */
export function bedLabels(s: Sleeping): string[] {
  return [
    s.double && `${s.double}× ${plural(s.double, "manželská postel", "manželské postele", "manželských postelí")}`,
    s.single && `${s.single}× ${plural(s.single, "jednolůžko", "jednolůžka", "jednolůžek")}`,
    s.extra && `${s.extra}× ${plural(s.extra, "přistýlka", "přistýlky", "přistýlek")}`,
    s.sofa &&
      `${s.sofa}× ${plural(s.sofa, "rozkládací pohovka", "rozkládací pohovky", "rozkládacích pohovek")} pro ${s.sofaSleeps}`,
  ].filter(Boolean) as string[];
}

export function bedroomsLabel(n: number): string {
  return n ? `${n} ${plural(n, "ložnice", "ložnice", "ložnic")}` : "";
}

/** Celý souhrn jedním řádkem: „3 ložnice · 2× manželská postel · 1× jednolůžko". */
export function describeSleeping(s: Sleeping): string {
  return [bedroomsLabel(s.bedrooms), ...bedLabels(s)].filter(Boolean).join(" · ");
}
