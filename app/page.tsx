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
    icon: "🏡",
    title: "Moderní web za pár minut",
    text: "Fotky, popis, ceník a kalendář. Web vypadá skvěle na mobilu i počítači a každou změnu hned vidíš v živém náhledu.",
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
              Moderní web. Rezervace bez starostí.
              <br />
              <em className="font-normal">Pronajímej ještě dnes.</em>
            </h1>
            <p className="rise rise-2 mt-6 max-w-xl text-[17px] leading-relaxed text-soft">
              <Wordmark /> ti postaví moderní prezentační web s rezervacemi a dá ti
              <strong className="text-ink"> jednoduchou správu pronájmu</strong> — termíny, hosty, platby
              i přehled výdělků na jednom místě.
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
              className="rounded-2xl border border-line bg-surface p-6 transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              <span className="text-2xl">{f.icon}</span>
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
        <div className="mt-8 rounded-2xl border border-line bg-surface p-7 sm:flex sm:items-center sm:justify-between sm:gap-10">
          <div>
            <h3 className="font-display text-2xl font-semibold">Všechno v ceně</h3>
            <p className="mt-1 text-sm text-soft">Pro jedno ubytování i víc nemovitostí</p>
            <p className="mt-5 font-display text-4xl font-semibold">
              0 Kč <span className="text-base font-normal text-soft">/ měsíc</span>
            </p>
            <Link href="/onboarding" className="btn-primary mt-6 w-full sm:w-auto">
              Začít zdarma
            </Link>
          </div>
          <ul className="mt-6 grid gap-2.5 text-[15px] text-soft sm:mt-0 sm:grid-cols-2 sm:gap-x-8">
            <li>✓ Vlastní prezentační web</li>
            <li>✓ Rezervace s půldny</li>
            <li>✓ Platby přes Stripe</li>
            <li>✓ Kalendář a blokace termínů</li>
            <li>✓ Hosté a vouchery</li>
            <li>✓ Přehled výdělků a nákladů</li>
          </ul>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center">
          <Logo className="text-xl" />
          <p className="text-sm text-soft">
            © {new Date().getFullYear()} tainy · moderní web a jednoduchá správa pronájmu
          </p>
        </div>
      </footer>
    </div>
  );
}
