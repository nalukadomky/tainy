import Image from "next/image";
import QRCode from "qrcode";
import { Icon } from "@/components/Icon";
import { PaymentSwitch } from "@/components/landing/PaymentSwitch";
import { MailSteps } from "@/components/landing/MailSteps";
import { CleaningTasks } from "@/components/landing/CleaningTasks";
import { EarningsCard } from "@/components/landing/EarningsCard";

// Vizualizace produktu na úvodní stránce. Jen HTML/CSS a fotky z public/demo —
// ostré na každém displeji a bez screenshotů, které by po každé změně UI zastaraly.
// Všechny jsou dekorace (aria-hidden): totéž říká text vedle nich.

/* ---------- drobnosti ---------- */

/** Kam vede QR kód na úvodní stránce: naskenuješ telefonem a jsi v registraci. */
export const REGISTER_URL = "https://tainy.cz/register";

/** Skutečný QR kód (SVG z matice modulů, ostrý v každé velikosti). Výchozí odkaz vede na registraci. */
export function Qr({ value = REGISTER_URL, size = 96, className = "" }: { value?: string; size?: number; className?: string }) {
  const { size: n, data } = QRCode.create(value, { errorCorrectionLevel: "M" }).modules;
  const q = 2; // tichá zóna kolem kódu
  let d = "";
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (data[y * n + x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  return (
    <svg viewBox={`0 0 ${n + q * 2} ${n + q * 2}`} width={size} height={size} className={className} shapeRendering="crispEdges" role="img" aria-label="QR kód na registraci">
      <rect width={n + q * 2} height={n + q * 2} fill="white" />
      <path d={d} fill="currentColor" />
    </svg>
  );
}

export function Chip({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`absolute flex items-center gap-3 rounded-2xl border border-line/80 bg-surface/95 px-4 py-3 shadow-[0_12px_40px_-12px_rgba(30,42,32,0.25)] backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

/* ---------- Hero ---------- */

// Ukázkový měsíc pro telefon: příští měsíc od sestavení stránky
const DEMO_MONTH = (() => {
  const d = new Date();
  return { y: d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear(), m: (d.getMonth() + 1) % 12 };
})();
const MONTHS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const BOOKED = "#ddd3c1";
const SEL = "var(--pine)";

/**
 * Podoba výběru termínu z rezervace (components/DayPicker.tsx), zmenšená a bez cen:
 * půldny jako úhlopříčně rozdělené buňky, obsazeno béžově, vybraný pobyt barvou webu.
 * Vybraný pobyt 12.–15., obsazeno 5.–8. (odjezd 8. dopoledne).
 */
export function MiniDayPicker() {
  const { y, m } = DEMO_MONTH;
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const half = (d: number) => ({
    am: d > 5 && d <= 8 ? BOOKED : d > 12 && d <= 15 ? SEL : "transparent",
    pm: d >= 5 && d < 8 ? BOOKED : d >= 12 && d < 15 ? SEL : "transparent",
  });
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[9px] text-soft">←</span>
        <span className="text-[8px] font-medium uppercase tracking-wider text-soft">Vybraný termín</span>
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line text-[9px] text-soft">→</span>
      </div>
      <p className="mb-1 mt-1.5 text-center font-display text-[11px] font-semibold capitalize">
        {MONTHS[m]} {y}
      </p>
      <div className="grid grid-cols-7 text-center text-[7px] font-semibold uppercase tracking-wider text-soft">
        {["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].map((w) => (
          <span key={w} className="py-0.5">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[2px]">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`x${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const h = half(d);
          const full = h.am === BOOKED && h.pm === BOOKED;
          const edge = h.am === SEL || h.pm === SEL;
          const free = h.am === "transparent" && h.pm === "transparent";
          return (
            <span
              key={d}
              className={`flex aspect-square flex-col items-center justify-center rounded-[5px] leading-none ${full ? "text-soft/50" : "text-ink"} ${edge ? "font-semibold" : ""}`}
              style={free ? undefined : { background: `linear-gradient(to bottom right, ${h.am} 50%, ${h.pm} 50%)` }}
            >
              <span className={`text-[10px] tabular-nums ${h.am === SEL ? "text-white drop-shadow-[0_1px_2px_rgba(30,42,32,0.9)]" : ""}`}>{d}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function HeroVisual() {
  return (
    <div aria-hidden className="relative mx-auto h-[440px] w-full max-w-[540px] select-none sm:h-[480px]">
      {/* Web chaty v prohlížeči */}
      <div className="absolute right-0 top-6 w-[86%] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(30,42,32,0.35)]">
        <div className="flex items-center gap-1.5 border-b border-line bg-cream px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-[#e4ddcf]" />
          <span className="h-2 w-2 rounded-full bg-[#e4ddcf]" />
          <span className="h-2 w-2 rounded-full bg-[#e4ddcf]" />
          <span className="ml-3 rounded-md bg-surface px-2.5 py-0.5 text-[10px] text-soft">tinyvyhlidka.cz</span>
        </div>
        <div className="relative aspect-[16/10]">
          <Image src="/demo/10-tiny-vyhlidka.jpg" alt="" fill priority sizes="(min-width: 1024px) 480px, 90vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <div className="absolute bottom-4 right-5 text-right text-white">
            <p className="font-display text-2xl font-semibold leading-tight sm:text-3xl">Tiny Vyhlídka</p>
            <p className="mt-0.5 text-xs opacity-90">Prosklený tiny house s výhledem do krajiny</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex gap-1.5">
            {["/demo/05-sauna.jpg", "/demo/06-loznice.jpg", "/demo/03-kamna.jpg"].map((src) => (
              <div key={src} className="relative h-9 w-12 overflow-hidden rounded-md">
                <Image src={src} alt="" fill sizes="48px" className="object-cover" />
              </div>
            ))}
          </div>
          <span className="rounded-full bg-pine px-3.5 py-1.5 text-[11px] font-semibold text-white">Rezervovat</span>
        </div>
      </div>

      {/* Telefon s výběrem termínu */}
      <div className="float absolute bottom-0 left-0 w-[46%] max-w-[230px] rounded-[2.2rem] border-[7px] border-ink bg-surface p-3.5 shadow-[0_30px_70px_-25px_rgba(30,42,32,0.55)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <MiniDayPicker />
        <div className="mt-3 rounded-xl bg-bg px-3 py-2">
          <p className="text-[10px] text-soft">12.–15. · 3 noci · 2 dospělí</p>
          <p className="text-sm font-semibold">10 500 Kč</p>
        </div>
        <span className="mt-2.5 block rounded-full bg-pine py-2 text-center text-[11px] font-semibold text-white">Rezervovat 3 noci</span>
      </div>

      {/* Plovoucí oznámení */}
      <Chip className="float bottom-4 right-0 sm:-bottom-2 sm:right-2">
        <Qr size={48} className="rounded text-ink" />
        <span>
          <span className="block text-[11px] text-soft">QR platba přímo na účet</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pine text-[9px] text-white">✓</span>
            Zaplaceno 10 500 Kč
          </span>
        </span>
      </Chip>
      {/* Oznámení vpravo nahoře pod sebou — vznáší se společně */}
      <div className="float-slow absolute -right-3 top-[22%] z-10 flex flex-col items-end gap-2 sm:-right-8">
        <Chip className="!relative">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pine/10 text-pine">
            <Icon name="calendar" size={18} />
          </span>
          <span>
            <span className="block text-[11px] text-soft">Nová rezervace</span>
            <span className="block text-sm font-semibold">Petra K. · 3 noci</span>
          </span>
        </Chip>
        <Chip className="!relative hidden !px-3 !py-2 sm:flex">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff5a5f]/12 text-[11px] font-bold text-[#e0484d]">A</span>
          <span className="text-xs font-medium">Airbnb · kalendář sladěn</span>
        </Chip>
      </div>
    </div>
  );
}

/* ---------- Web, který prodává ---------- */

const GALLERY = ["/demo/02-a-frame.jpg", "/demo/05-sauna.jpg", "/demo/06-loznice.jpg", "/demo/08-houpaci-sit.jpg"];

/** Web chaty na počítači a v telefonu — barvy bere z --pine, takže ho přebarví ThemeSwitch. */
export function SiteVisual() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[560px] select-none pb-8">
      {/* Počítač */}
      <div className="relative ml-auto w-[88%] overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(30,42,32,0.35)]">
        <div className="flex items-center gap-1.5 border-b border-line bg-cream px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-line" />
          <span className="h-2 w-2 rounded-full bg-line" />
          <span className="h-2 w-2 rounded-full bg-line" />
          <span className="ml-3 rounded-md bg-surface px-2.5 py-0.5 text-[10px] text-soft">tinyvyhlidka.cz</span>
        </div>
        <div className="relative aspect-[16/9]">
          <Image src="/demo/10-tiny-vyhlidka.jpg" alt="" fill sizes="(min-width: 1024px) 480px, 90vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <div className="absolute bottom-4 right-5 text-right text-white">
            <p className="font-display text-2xl font-semibold leading-tight sm:text-3xl">Tiny Vyhlídka</p>
            <p className="mt-0.5 text-xs opacity-90">Prosklený tiny house s výhledem do krajiny</p>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_1.2fr] gap-4 p-4">
          <div className="grid grid-cols-2 gap-1.5">
            {GALLERY.map((src) => (
              <div key={src} className="relative aspect-[4/3] overflow-hidden rounded-md">
                <Image src={src} alt="" fill sizes="80px" className="object-cover" />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-pine">O domku</p>
            <div className="h-1.5 w-full rounded-full bg-line" />
            <div className="h-1.5 w-11/12 rounded-full bg-line" />
            <div className="h-1.5 w-4/5 rounded-full bg-line" />
            <div className="flex flex-wrap gap-1 pt-1.5">
              {["Terasa", "Výhled", "Wi-Fi"].map((a) => (
                <span key={a} className="rounded-full bg-pine/10 px-2 py-0.5 text-[9px] font-medium text-pine">
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-xs text-soft">
            od <strong className="text-sm text-ink">3 500 Kč</strong> / noc
          </span>
          <span className="rounded-full bg-pine px-3.5 py-1.5 text-[11px] font-semibold text-white">Rezervovat</span>
        </div>
      </div>

      {/* Telefon */}
      <div className="float absolute bottom-0 left-0 w-[40%] max-w-[210px] overflow-hidden rounded-[2rem] border-[7px] border-ink bg-surface shadow-[0_30px_70px_-25px_rgba(30,42,32,0.55)]">
        <div className="relative aspect-[4/3]">
          <Image src="/demo/03-kamna.jpg" alt="" fill sizes="200px" className="object-cover" />
        </div>
        <div className="space-y-2 p-3">
          <p className="font-display text-base font-semibold leading-tight text-pine">Tiny Vyhlídka</p>
          <p className="text-[10px] text-soft">až 4 hosté · výhled · terasa</p>
          <span className="block rounded-full bg-pine py-2 text-center text-[11px] font-semibold text-white">Vybrat termín</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Rezervace a platby ---------- */

export function PaymentVisual() {
  return <PaymentSwitch qr={<Qr size={104} className="rounded-lg text-ink" />} />;
}

/* ---------- Jeden kalendář pro všechno ---------- */

const SOURCES = {
  web: { label: "Web", cls: "bg-pine text-white" },
  airbnb: { label: "Airbnb", cls: "bg-[#e0484d] text-white" },
  booking: { label: "Booking", cls: "bg-[#1f5fbf] text-white" },
} as const;

/** Měsíc v administraci: pobyty z webu a portálů jako pruhy přes dny (jako v Kalendáři). */
export function SyncVisual() {
  // [týden, od sloupce, počet dní, zdroj, jméno]
  const bars: [number, number, number, keyof typeof SOURCES, string][] = [
    [0, 1, 3, "airbnb", "Novák"],
    [0, 4, 3, "web", "Petra K."],
    [1, 2, 4, "booking", "Müller"],
    [2, 0, 2, "web", "Dvořákovi"],
    [2, 4, 3, "airbnb", "Smith"],
    [3, 1, 5, "web", "Horák"],
  ];
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[520px] select-none">
      <div className="rounded-3xl border border-line bg-surface p-5 text-ink shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-semibold">Kalendář</p>
          <div className="flex gap-1.5">
            {Object.values(SOURCES).map((s) => (
              <span key={s.label} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.cls}`}>
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-wider text-soft">
          {["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-2 space-y-1.5">
          {[0, 1, 2, 3].map((w) => (
            <div key={w} className="relative h-11 rounded-lg bg-bg">
              <div className="absolute inset-0 grid grid-cols-7">
                {Array.from({ length: 7 }, (_, d) => (
                  <span key={d} className="border-l border-surface pl-1 pt-0.5 text-[9px] text-soft first:border-l-0">
                    {w * 7 + d + 2}
                  </span>
                ))}
              </div>
              {bars
                .filter((b) => b[0] === w)
                .map(([, from, len, src, name]) => (
                  <span
                    key={name}
                    className={`absolute bottom-1.5 h-5 truncate rounded-md px-1.5 text-[9px] font-semibold leading-5 ${SOURCES[src].cls}`}
                    style={{ left: `calc(${((from + 0.5) / 7) * 100}% + 2px)`, width: `calc(${(len / 7) * 100}% - 4px)` }}
                  >
                    {name}
                  </span>
                ))}
            </div>
          ))}
        </div>
      </div>
      <Chip className="float -bottom-5 -left-2 sm:-left-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pine/10 text-pine">⇄</span>
        <span>
          <span className="block text-[11px] text-soft">Synchronizováno před 2 min</span>
          <span className="block text-sm font-semibold">Žádná dvojí rezervace</span>
        </span>
      </Chip>
    </div>
  );
}

/* ---------- Automatické e-maily ---------- */

export function EmailVisual() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[480px] select-none">
      <div className="rounded-3xl border border-line bg-surface p-6 text-ink shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)]">
        <p className="text-xs font-semibold uppercase tracking-widest text-soft">E-maily hostovi · Petra K.</p>
        <MailSteps />
      </div>
      <div className="float absolute -right-2 -top-6 w-[210px] rounded-2xl border border-line bg-surface p-4 text-ink shadow-xl sm:-right-8">
        <p className="text-[11px] text-soft">Před příjezdem</p>
        <p className="mt-1 text-sm">Kód k zámku</p>
        <p className="font-display text-3xl font-semibold tracking-[0.2em] text-pine">4821</p>
        <p className="mt-1 text-[11px] text-soft">Wi-Fi: TinyVyhlidka · vyhled2026</p>
      </div>
    </div>
  );
}

/* ---------- Úklid ---------- */

export function CleaningVisual() {
  return (
    <div aria-hidden className="relative mx-auto flex w-full max-w-[480px] select-none justify-center">
      <div className="w-[260px] rounded-[2.2rem] border-[7px] border-ink bg-surface p-4 text-ink shadow-[0_30px_70px_-25px_rgba(0,0,0,0.6)]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <p className="text-[11px] text-soft">Úklid · Jana</p>
        <p className="font-display text-xl font-semibold">Sobota 15. 11.</p>
        <p className="text-xs text-soft">10:00–14:00 · mezi Novákovými a Horákovými</p>
        <CleaningTasks />
      </div>
      <Chip className="float-slow -right-1 -top-7 sm:right-0">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pine/10 text-pine">
          <Icon name="broom" size={16} />
        </span>
        <span>
          <span className="block text-[11px] text-soft">Bez přihlášení</span>
          <span className="block text-sm font-semibold">Odkaz pro uklízečku</span>
        </span>
      </Chip>
    </div>
  );
}

/* ---------- Přehled výdělků ---------- */

export function EarningsVisual() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[500px] select-none">
      <EarningsCard />
    </div>
  );
}
