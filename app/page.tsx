import Link from "next/link";
import { Logo, Wordmark } from "@/components/Logo";

const FEATURES = [
  {
    icon: "🗓️",
    title: "Rezervace včetně půldnů",
    text: "Hosté si vyberou termín, počet nocí i dřívější příjezd nebo pozdější odjezd. Kolize termínů hlídáme za tebe.",
  },
  {
    icon: "💳",
    title: "Platby přes Stripe",
    text: "Z výběru termínu vede host rovnou na platbu. Žádné dohadování přes e-maily a zálohy na účet.",
  },
  {
    icon: "📊",
    title: "Přehled na jednom místě",
    text: "Dashboard výdělků, správa rezervací, ubytovaní hosté a evidence nákladů v jednoduché administraci.",
  },
  {
    icon: "🎙️",
    title: "Hlasový AI asistent",
    text: "Řekni „zvyš cenu na 3 200 a přepiš uvítací text víc podzimně“ — a web se upraví sám.",
    pro: true,
  },
];

const STEPS = [
  {
    n: "1",
    title: "Proklikej si demo",
    text: "Podívej se, jak vypadá hotový web i administrace — bez registrace, rovnou teď.",
  },
  {
    n: "2",
    title: "Vyplň pár údajů",
    text: "Název, popis, kapacita, cena. Průvodce tě provede a šablona webu vznikne okamžitě.",
  },
  {
    n: "3",
    title: "Přijímej rezervace",
    text: "Pošli hostům odkaz. O termíny, platby i přehledy se už stará tainy.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <Logo className="text-[26px]" />
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="/w/demo" className="hidden text-sm font-medium text-soft hover:text-ink sm:block">
              Demo web
            </Link>
            <Link href="/login" className="text-sm font-medium text-soft hover:text-ink">
              Přihlásit se
            </Link>
            <Link href="/onboarding" className="btn-primary !px-5 !py-2.5 text-sm">
              Vytvořit web
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="paper relative overflow-hidden">
        <div className="mx-auto max-w-5xl px-5 pb-16 pt-14 sm:pb-24 sm:pt-20">
          <div className="max-w-2xl">
            <p className="rise inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-soft">
              Pro majitele chat, apartmánů a tiny housů
            </p>
            <h1 className="rise rise-1 mt-6 font-display text-[42px] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Web pro tvoje ubytování.
              <br />
              <em className="font-normal">Hotový, než dopiješ kafe.</em>
            </h1>
            <p className="rise rise-2 mt-6 max-w-xl text-[17px] leading-relaxed text-soft">
              <Wordmark /> ti postaví prezentační web s rezervacemi, platbami a přehledem
              výdělků. A když budeš chtít něco změnit, stačí to <strong className="text-ink">říct nahlas</strong> —
              o zbytek se postará AI.
            </p>
            <div className="rise rise-3 mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/w/demo" className="btn-primary">
                Vyzkoušet demo →
              </Link>
              <Link href="/onboarding" className="btn-ghost">
                Vytvořit vlastní web
              </Link>
            </div>
            <p className="rise rise-4 mt-4 text-sm text-soft">
              Web si sestavíš a prohlédneš zdarma — účet stačí založit, až se ti bude líbit.
            </p>
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, #f5d9a8, transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 right-20 h-72 w-72 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #bcd8c3, transparent 70%)" }}
        />
      </section>

      {/* Funkce */}
      <section className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Všechno, co ubytování potřebuje.
          <br />
          <em className="font-normal text-soft">Nic, co by tě zdržovalo.</em>
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`rounded-2xl border p-6 transition hover:-translate-y-0.5 hover:shadow-sm ${
                f.pro ? "ai-chip" : "border-line bg-surface"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="text-2xl">{f.icon}</span>
                {f.pro && (
                  <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                    t<span className="ai-mark not-italic">ai</span>ny Pro
                  </span>
                )}
              </div>
              <h3 className="mt-3 font-display text-xl font-semibold">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-soft">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Jak to funguje */}
      <section className="border-y border-line bg-cream">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Od nuly k první rezervaci <em className="font-normal">ve třech krocích</em>
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <span className="font-display text-5xl font-semibold text-line">{s.n}</span>
                <h3 className="mt-2 font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-soft">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ceník */}
      <section id="cenik" className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Ceník</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-7">
            <h3 className="font-display text-2xl font-semibold">Start</h3>
            <p className="mt-1 text-sm text-soft">Na rozjezd i pro jedno ubytování</p>
            <p className="mt-5 font-display text-4xl font-semibold">
              0 Kč <span className="text-base font-normal text-soft">/ měsíc</span>
            </p>
            <ul className="mt-5 space-y-2.5 text-[15px] text-soft">
              <li>✓ Vlastní prezentační web</li>
              <li>✓ Rezervace s půldny</li>
              <li>✓ Platby přes Stripe</li>
              <li>✓ Administrace a přehled výdělků</li>
            </ul>
            <Link href="/onboarding" className="btn-ghost mt-7 w-full">
              Začít zdarma
            </Link>
          </div>
          <div className="ai-chip relative rounded-2xl p-7">
            <span className="absolute -top-3 right-6 rounded-full bg-ink px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
              Doporučujeme
            </span>
            <h3 className="font-display text-2xl font-semibold">
              t<span className="ai-mark">ai</span>ny Pro
            </h3>
            <p className="mt-1 text-sm text-soft">Když chceš, aby web pracoval za tebe</p>
            <p className="mt-5 font-display text-4xl font-semibold">
              490 Kč <span className="text-base font-normal text-soft">/ měsíc</span>
            </p>
            <ul className="mt-5 space-y-2.5 text-[15px] text-soft">
              <li>✓ Všechno ze Startu</li>
              <li>
                ✓ <strong className="text-ink">Hlasový AI asistent</strong> — úpravy webu mluvením
              </li>
              <li>✓ AI přepisy textů v tónu tvé značky</li>
              <li>✓ Přednostní podpora</li>
            </ul>
            <Link href="/onboarding?tier=pro" className="btn-primary mt-7 w-full">
              Vyzkoušet Pro
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center">
          <Logo className="text-xl" />
          <p className="text-sm text-soft">
            © {new Date().getFullYear()} tainy · web s rezervacemi, který si upravíš hlasem
          </p>
        </div>
      </footer>
    </div>
  );
}
