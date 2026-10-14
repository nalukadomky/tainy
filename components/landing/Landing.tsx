import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Icon, type IconName } from "@/components/Icon";
import { ThemeSwitch } from "@/components/landing/ThemeSwitch";
import { RotatingWord } from "@/components/landing/RotatingWord";
import { EarlyAccessForm } from "@/components/landing/EarlyAccessForm";
import { CleaningVisual, EarningsVisual, EmailVisual, HeroVisual, PaymentVisual, SiteVisual, SyncVisual } from "@/components/landing/Visuals";

// Prezentační web tainy (úvodní stránka). Hlavní výzva všude stejná:
// early access → formulář dole (#early-access); veřejně se zatím nic nezakládá. Barvy jsou v proměnných (PALETTE), takže stránka
// umí světlou i tmavou variantu se stejným obsahem; nasazená je světlá.

const TRY = "#early-access";
const TRY_LABEL = "Chci early access";
const MICRO = "Spouštíme brzy · prvním uživatelům měsíc zdarma · přístupy posíláme postupně";

function Header({ dark = false }: { dark?: boolean }) {
  const link = `hover:text-[var(--lp-fg)] ${dark ? "text-white/70" : "text-soft"}`;
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--lp-line)] bg-[var(--lp-bg)]/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Logo className={`text-[26px] ${dark ? "text-white" : ""}`} />
        <nav className="hidden items-center gap-7 text-sm font-medium md:flex">
          <a href="#funkce" className={link}>
            Funkce
          </a>
          <a href="#jak-to-funguje" className={link}>
            Jak to funguje
          </a>
          <a href="#cenik" className={link}>
            Cena
          </a>
          <Link href="/demo" className={link}>
            Demo
          </Link>
        </nav>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/login" className={`text-sm font-medium ${link}`}>
            Přihlásit se
          </Link>
          <a href={TRY} className="inline-flex items-center rounded-full bg-[var(--lp-btn)] px-4 py-2.5 text-sm font-semibold text-[var(--lp-btn-fg)] sm:px-5">
            Early access
          </a>
        </div>
      </div>
    </header>
  );
}

const GOLD = "var(--lp-accent)";
const CREAM = "var(--lp-card)";

/** Barvy celé stránky: tmavá (návrh 3) a světlá (návrh 5) varianta se liší jen tady. */
const PALETTE = {
  dark: {
    "--lp-bg": "#14261b", "--lp-alt": "#182d20", "--lp-fg": "#ffffff", "--lp-muted": "rgba(255,255,255,.65)",
    "--lp-faint": "rgba(255,255,255,.45)", "--lp-line": "rgba(255,255,255,.1)", "--lp-line-strong": "rgba(255,255,255,.22)",
    "--lp-accent": "#e9c98f", "--lp-accent-soft": "rgba(233,201,143,.15)", "--lp-accent-faint": "rgba(233,201,143,.35)",
    "--lp-card": "#f3e7cf", "--lp-btn": "#f3e7cf", "--lp-btn-fg": "#14261b", "--lp-glow": "#3f7a52",
  },
  light: {
    "--lp-bg": "#f6f3ec", "--lp-alt": "#fdfbf6", "--lp-fg": "#1e2a20", "--lp-muted": "#5a6557",
    "--lp-faint": "#8a9387", "--lp-line": "#e4ddcf", "--lp-line-strong": "#d6ccb8",
    "--lp-accent": "#2c5e3f", "--lp-accent-soft": "rgba(44,94,63,.1)", "--lp-accent-faint": "rgba(44,94,63,.25)",
    "--lp-card": "#f3e7cf", "--lp-btn": "#2c5e3f", "--lp-btn-fg": "#ffffff", "--lp-glow": "#f3dfb8",
  },
};

function DarkRow({
  id,
  eyebrow,
  title,
  text,
  points,
  visual,
  alt = false,
}: {
  id?: string;
  eyebrow: string;
  title: React.ReactNode;
  text: string;
  points: React.ReactNode[];
  visual: React.ReactNode;
  alt?: boolean;
}) {
  return (
    <section id={id} className={`scroll-mt-16 ${alt ? "bg-[var(--lp-alt)]" : ""}`}>
      <div className="reveal mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:py-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
            {eyebrow}
          </p>
          <h2 className="mt-4 text-balance font-display text-3xl font-semibold leading-[1.08] tracking-tight sm:text-[44px]">{title}</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[var(--lp-muted)]">{text}</p>
          <ul className="mt-7 space-y-3">
            {points.map((p, i) => (
              <li key={i} className="flex gap-3 text-[15px] text-[var(--lp-fg)]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "var(--lp-accent-soft)", color: GOLD }} aria-hidden>
                  ✓
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 text-ink">{visual}</div>
      </div>
    </section>
  );
}

/** Štítek u funkce, kterou teprve připravujeme. */
const Soon = () => (
  <span className="ml-1 rounded-full bg-amber/15 px-2 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wide text-[#92600a]">Brzy</span>
);

const Em = ({ children }: { children: React.ReactNode }) => (
  <em className="font-normal" style={{ color: GOLD }}>
    {children}
  </em>
);

const EXTRAS: { icon: IconName; title: string; text: string }[] = [
  { icon: "ticket", title: "Vouchery a slevy", text: "Dárkové poukazy a slevové kódy, které si host uplatní sám." },
  { icon: "home", title: "Máš už web?", text: "Přeneseme ho, nebo k němu přidáš tlačítko Rezervovat." },
  { icon: "file", title: "Podmínky a GDPR", text: "Obchodní podmínky a ochrana údajů připravené automaticky." },
  { icon: "zap", title: "Vlastní doména", text: "Připojíš doménu, kterou už máš (koupíš ji u kteréhokoli registrátora). Zabezpečení nastavíme sami." },
  { icon: "clipboard", title: "Více nemovitostí", text: "Chata, apartmán i tiny house v jednom účtu." },
  { icon: "user", title: "Hosté a export", text: "Přehled hostů, kolik utratili, a export do Excelu." },
];

const BEFORE = ["Stavebnice webu a k tomu rezervační systém", "Tabulka v Excelu a papírový kalendář", "Ručně psané e-maily a kódy k zámku", "Provize portálům z každé rezervace", "SMSky uklízečce, kdy a kde uklízet"];
const AFTER = ["Web s rezervacemi v jednom", "Jeden kalendář sladěný s portály", "E-maily a kódy odcházejí samy", "Přímé rezervace bez provize", "Uklízečka vidí rozpis ve svém odkazu"];

const FAQ: [string, string][] = [
  ["Kdy se dostanu dovnitř?", "tainy spouštíme postupně. Zapiš se o early access a jakmile na tebe přijde řada, pošleme ti přístup e-mailem."],
  ["Kolik to bude stát?", "Prvním uživatelům dáme první měsíc zdarma. Pak férová měsíční cena bez provizí z rezervací — přesnou cenu pošleme spolu s přístupem."],
  ["Už mám vlastní web. Musím ho zrušit?", "Nemusíš. Buď k němu přidáš tlačítko Rezervovat, nebo ho do tainy přeneseme i s fotkami a texty."],
  ["Pronajímám i přes Airbnb a Booking.com.", "Kalendáře se navzájem sladí, takže se ti termíny nikdy nepřekryjí. Portály můžeš dál používat vedle přímých rezervací."],
  ["Jak hosté platí?", "QR kódem ze své bankovní aplikace, rovnou na tvůj účet a bez poplatků. Brzy přidáme i platbu kartou, Apple Pay a Google Pay přes Stripe — pak si vybereš, co nabídneš, nebo obojí."],
];

const WORDS = ["Tvoje chata.", "Tvůj tiny.", "Tvůj apartmán.", "Tvůj glamping."];

const Glow = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute right-0 top-0 h-[600px] w-[600px] rounded-full opacity-40 blur-3xl"
    style={{ background: "radial-gradient(circle, var(--lp-glow), transparent 65%)" }}
  />
);

const Perks = ({ className = "" }: { className?: string }) => (
  <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-[var(--lp-muted)] ${className}`}>
    {["Spouštíme brzy", "Měsíc zdarma", "Bez provizí"].map((t) => (
      <li key={t} className="flex items-center gap-1.5">
        <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold" style={{ background: "var(--lp-accent-soft)", color: GOLD }} aria-hidden>
          ✓
        </span>
        {t}
      </li>
    ))}
  </ul>
);

/** Úvodní obrazovka: nadpis na střed (od lg vlevo), jedno hlavní tlačítko, demo jako odkaz. */
function Hero() {
  return (
    <section className="relative">
      <Glow />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-10 lg:grid-cols-2 lg:gap-10 lg:pb-10 lg:pt-4">
        <div className="text-center lg:text-left">
          <h1 className="font-display text-[44px] font-semibold leading-[1.04] tracking-tight sm:text-[66px]">
            <RotatingWord words={WORDS} />
            <br />
            Tvoji hosté.
            <br />
            <span className="whitespace-nowrap">
              <Em>Tvoje peníze.</Em>
            </span>
          </h1>
          <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row lg:justify-start sm:justify-center">
            <a href={TRY} className="inline-flex w-full max-w-xs items-center justify-center rounded-full bg-[var(--lp-btn)] px-7 py-4 font-semibold text-[var(--lp-btn-fg)] shadow-[0_12px_30px_-12px_rgba(44,94,63,0.6)] sm:w-auto">
              {TRY_LABEL} →
            </a>
            <Link href="/demo" className="font-semibold underline decoration-[var(--lp-line-strong)] underline-offset-4 hover:decoration-[var(--lp-fg)]">
              Prohlédnout demo
            </Link>
          </div>
          <Perks className="mt-6 justify-center lg:justify-start" />
        </div>
        <div className="min-w-0 text-ink">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

export function Landing({ light = false }: { light?: boolean }) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-[var(--lp-bg)] text-[var(--lp-fg)]" style={PALETTE[light ? "light" : "dark"] as React.CSSProperties}>
      <Header dark={!light} />

      <Hero />

      {/* Čísla */}
      <section className="border-y border-[var(--lp-line)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-3">
          {[
            ["0 %", "provize z přímých rezervací — peníze jdou rovnou na tvůj účet"],
            ["pár minut", "od prvního kliknutí k hotovému webu s kalendářem"],
            ["1 místo", "pro web, rezervace, hosty, platby i úklid"],
          ].map(([b, t]) => (
            <div key={b}>
              <p className="font-display text-4xl font-semibold" style={{ color: GOLD }}>
                {b}
              </p>
              <p className="mt-1.5 max-w-xs text-[15px] text-[var(--lp-muted)]">{t}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Funkce */}
      <DarkRow
        id="funkce"
        eyebrow="Prezentační web"
        title={
          <>
            Web, který <Em>prodává</Em> tvoje ubytování
          </>
        }
        text="Fotky, popis, vybavení, recenze a mapa v moderním designu. Na mobilu vypadá stejně dobře jako na počítači a každou změnu hned vidíš v živém náhledu."
        points={["10 barevných témat nebo vlastní barva", "Sekce, které si poskládáš a přejmenuješ", "Připojení vlastní domény i se zabezpečením"]}
        visual={
          <ThemeSwitch>
            <SiteVisual />
          </ThemeSwitch>
        }
      />
      <DarkRow
        alt
        eyebrow="Rezervace a platby"
        title={
          <>
            Rezervace i peníze <Em>přímo k tobě</Em>
          </>
        }
        text="Host si vybere termín, hned vidí konečnou cenu a zaplatí QR kódem ze své banky, rovnou na tvůj účet a bez poplatků. Brzy přidáme i platbu kartou přes Stripe."
        points={[
          "QR platba z bankovní aplikace rovnou na tvůj účet, bez poplatků",
          <>
            Karta, Apple Pay i Google Pay přes Stripe <Soon />
          </>,
          "Půldny, ceny na víkend a sezónu, děti, pejsci i poplatek z pobytu",
        ]}
        visual={<PaymentVisual />}
      />
      <DarkRow
        eyebrow="Kalendář"
        title={
          <>
            Jeden kalendář <Em>pro všechno</Em>
          </>
        }
        text="Rezervace z webu, Airbnb, Booking.com i dalších portálů na jednom místě. Kalendáře se navzájem sladí, takže se ti termíny nikdy nepřekryjí."
        points={["Synchronizace přes iCal s libovolným portálem", "Blokace termínů jedním kliknutím", "Přesun rezervace na jiný termín bez přepisování"]}
        visual={<SyncVisual />}
      />
      <DarkRow
        alt
        eyebrow="Automatizace"
        title={
          <>
            Hosté se postarají <Em>sami o sebe</Em>
          </>
        }
        text="Potvrzení, platba, informace před příjezdem i poděkování odcházejí samy. Kód k zámku a Wi-Fi dostane host přesně ve chvíli, kdy je potřebuje."
        points={["5 automatických e-mailů v tvém stylu", "Kód k zámku a pokyny k příjezdu předem", "Texty si upravíš v jednoduchém editoru"]}
        visual={<EmailVisual />}
      />
      <DarkRow
        eyebrow="Úklid a provoz"
        title={
          <>
            Úklid <Em>bez telefonování</Em>
          </>
        }
        text="Uklízečka dostane vlastní odkaz bez přihlašování. Vidí, kdy a kde uklízet, odškrtá úkoly a ví, kolik dostane zaplaceno. Ty vidíš, co je hotové."
        points={["Rozpis úklidů podle rezervací", "Checklist a společné úkoly (nákupy, opravy)", "Odměna za úklid nebo hodinová sazba"]}
        visual={<CleaningVisual />}
      />
      <DarkRow
        alt
        eyebrow="Přehled"
        title={
          <>
            Víš přesně, <Em>kolik vyděláváš</Em>
          </>
        }
        text="Tržby, obsazenost a odkud rezervace přicházejí. K tomu náklady na provoz, abys viděl skutečný zisk, ne jen příjmy."
        points={["Tržby a obsazenost po měsících", "Podíl přímých rezervací a portálů", "Evidence nákladů — jednorázových i pravidelných"]}
        visual={<EarningsVisual />}
      />

      {/* A k tomu */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-[44px]">
          A k tomu <Em>všechno ostatní</Em>
        </h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-[var(--lp-line)] bg-[var(--lp-line)] sm:grid-cols-2 lg:grid-cols-3">
          {EXTRAS.map((e) => (
            <div key={e.title} className="bg-[var(--lp-bg)] p-6">
              <Icon name={e.icon} size={22} className="text-[var(--lp-accent)]" />
              <h3 className="mt-3 font-semibold">{e.title}</h3>
              <p className="mt-1 text-[15px] text-[var(--lp-muted)]">{e.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Srovnání */}
      <section className="bg-[var(--lp-alt)]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-[44px]">
            Místo pěti nástrojů <Em>jeden</Em>
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-[var(--lp-line)] p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--lp-faint)]">Dřív</p>
              <ul className="mt-5 space-y-3.5">
                {BEFORE.map((b) => (
                  <li key={b} className="flex gap-3 text-[var(--lp-muted)]">
                    <span aria-hidden>✕</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl p-7 text-[#14261b]" style={{ background: CREAM }}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2c5e3f]">S tainy</p>
              <ul className="mt-5 space-y-3.5">
                {AFTER.map((a) => (
                  <li key={a} className="flex gap-3 font-medium">
                    <span className="text-[#2c5e3f]" aria-hidden>
                      ✓
                    </span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Jak to funguje */}
      <section id="jak-to-funguje" className="scroll-mt-16 mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-[44px]">
          Od nuly k první rezervaci <Em>ve třech krocích</Em>
        </h2>
        <div className="mt-12 grid gap-10 sm:grid-cols-3">
          {[
            ["Vyplň pár údajů", "Název, fotky, kapacitu a cenu. Nebo zadej adresu svého webu a přeneseme ho za tebe."],
            ["Uprav si web", "Barvy, sekce i texty měníš v živém náhledu. Co vidíš, to uvidí hosté."],
            ["Přijímej rezervace", "Pošli odkaz hostům nebo propoj vlastní doménu. O termíny, platby a e-maily se postará tainy."],
          ].map(([t, d], i) => (
            <div key={t}>
              <span className="font-display text-6xl font-semibold" style={{ color: "var(--lp-accent-faint)" }}>
                {i + 1}
              </span>
              <h3 className="mt-2 font-display text-xl font-semibold">{t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--lp-muted)]">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cena */}
      <section id="cenik" className="scroll-mt-20 px-5 pb-20 sm:pb-28">
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] text-[#14261b] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" style={{ background: CREAM }}>
          <div className="p-8 sm:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2c5e3f]">Cena</p>
            <h2 className="mt-4 text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Měsíc <em className="font-normal text-[#2c5e3f]">zdarma</em> pro první
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-[#14261b]/70">
              Kdo se zapíše o early access, má první měsíc zdarma. Pak férová měsíční cena. Z rezervací si nebereme žádnou provizi — co host zaplatí, je tvoje.
            </p>
            <a href={TRY} className="mt-8 inline-flex items-center justify-center rounded-full bg-[#14261b] px-7 py-4 font-semibold text-white">
              {TRY_LABEL} →
            </a>
            <p className="mt-3 text-sm text-[#14261b]/60">Přístupy posíláme postupně</p>
          </div>
          <ul className="grid content-center gap-3 bg-white/50 p-8 text-[15px] sm:grid-cols-2 sm:p-12">
            {["Vlastní web a připojení domény", "Rezervace s půldny", "QR platby (karty brzy)", "Sladění s Airbnb a Booking", "Automatické e-maily", "Kódy k zámku", "Úklid a úkoly", "Přehled tržeb a nákladů", "Vouchery a slevy", "Podmínky a GDPR"].map((f) => (
              <li key={f} className="flex gap-2.5">
                <span className="text-[#2c5e3f]">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-[var(--lp-line)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:py-28 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
          <h2 className="text-balance font-display text-3xl font-semibold tracking-tight sm:text-[44px]">
            Časté <Em>otázky</Em>
          </h2>
          <div className="divide-y divide-[var(--lp-line)] border-y border-[var(--lp-line)]">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
                  {q}
                  <span className="shrink-0 text-2xl font-light transition group-open:rotate-45" style={{ color: GOLD }}>
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-xl text-[var(--lp-muted)]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Závěrečná výzva — světlá karta jako cena */}
      <section id="early-access" className="scroll-mt-20 px-5 pb-20 sm:pb-28">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-16 text-center text-[#14261b] sm:px-12 sm:py-24" style={{ background: CREAM }}>
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, #e9c98f, transparent 70%)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, #9cc3a6, transparent 70%)" }}
          />
          <h2 className="relative text-balance font-display text-4xl font-semibold tracking-tight sm:text-6xl">
            Buď mezi <em className="font-normal text-[#2c5e3f]">prvními</em>
          </h2>
          <p className="relative mx-auto mt-5 max-w-lg text-lg text-[#14261b]/70">
            tainy spouštíme postupně. Zapiš se a pošleme ti přístup, jakmile na tebe přijde řada. První měsíc zdarma.
          </p>
          <div className="relative mt-9">
            <EarlyAccessForm />
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--lp-line)]">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center">
          <Logo className="text-xl" />
          <p className="text-sm text-[var(--lp-faint)]">© {new Date().getFullYear()} tainy · vlastní web s rezervacemi bez provizí</p>
        </div>
      </footer>
    </div>
  );
}
