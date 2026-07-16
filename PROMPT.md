# tainy — finální prompt / specifikace MVP

> Jeden prompt, ze kterého vzniká celá aplikace. Slouží jako zdroj pravdy pro vývoj i další iterace.

## Prompt

Vytvoř **mobile-first webovou aplikaci „tainy"** (Next.js App Router, TypeScript, Tailwind, Prisma + SQLite) pro **vlastníky nemovitostí**, kteří si chtějí během pár minut vytvořit **vlastní prezentační web s rezervacemi ubytování**. Název tainy vždy zobrazuj s vyzdviženým „ai" (t**ai**ny) — AI je jádrem produktu. Design je **světlý, teplý a charakterní** (žádný generický AI vzhled), celé UI je **česky**.

### 1. Prezentační web tainy (`/`)
- Marketingová landing page: hero s hodnotovou propozicí („Vlastní web s rezervacemi za 3 minuty"), ukázka demo webu, ceník tierů, CTA.
- Z landing page vede **okamžitě proklikatelné demo** (předvyplněný ukázkový web nemovitosti) a **onboarding wizard** — cílem je uživatele rychle „natáhnout" do systému.

### 2. Onboarding wizard (`/onboarding`)
- Krokový průvodce (mobile-first, jeden krok = jedna obrazovka): název a typ nemovitosti → popis a fotky (placeholder) → kapacita a cena za noc / půlden → barva/šablona → hotovo.
- Výsledkem je uložený web s vlastním slugem a přesměrování do administrace.

### 3. Veřejný web nemovitosti (`/w/[slug]`)
- Prezentační šablona: hero, popis, vybavení, galerie (placeholdery), kontakt.
- **Rezervační flow**: kalendářový výběr termínu, kde se **den příjezdu a den odjezdu zobrazují jako půldny** (diagonálně rozdělené buňky — dopoledne odjíždí předchozí host, odpoledne přijíždí nový; rezervace na sebe mohou navazovat). Počet hostů, živý souhrn ceny → **checkout ve stylu Stripe** (mock, bez reálné platby) → potvrzení rezervace. Účtují se klasicky noci, půldny jsou jen vizualizace obsazenosti.

### 4. Administrace (`/admin`)
- **Dashboard**: výdělky (graf), obsazenost, nadcházející rezervace.
- **Rezervace**: přehled + správa stavů (čeká / zaplaceno / zrušeno).
- **Hosté**: přehled ubytovaných.
- **Náklady**: evidence nákladů (položka, částka, kategorie, datum), bilance příjmy − náklady.
- **Můj web**: úprava obsahu webu, odkaz na veřejnou verzi.
- **AI asistent (vyšší tier „tainy Pro")**: hlasový asistent — Web Speech API pro rozpoznání řeči, Claude API pro provedení úprav webu („přepiš uvítací text", „změň cenu na 2500"). Změny se aplikují na data webu a rovnou propíší.

### Tiery
- **Start** (zdarma/nízká cena): web + rezervace + administrace.
- **Pro**: navíc hlasový AI asistent pro úpravy webu.

### Technická rozhodnutí
- Full-stack: Next.js App Router + Prisma + SQLite (soubor `dev.db`), seed s demo webem, rezervacemi a náklady.
- Platby: mock Stripe checkout (reálná integrace později).
- AI: `@anthropic-ai/sdk`, klíč v `.env` (`ANTHROPIC_API_KEY`); bez klíče asistent běží v ukázkovém režimu.
- Bez autentizace v MVP (admin je otevřený, demo režim).
- Vše primárně **mobile-first**, desktop je rozšíření.

## Datový model
- **Site**: slug, název, tagline, popis, typ nemovitosti, ceník (základní cena za noc, režim „za nemovitost" / „za osobu", víkendová přirážka v % pro noci pá–ne), max. hostů, vybavení, barva motivu, tier, kontakt.
- **PriceRule**: sezónní období webu — název, od–do (včetně), úprava ceny v ± %. Procenta sezón a víkendu se sčítají a cena se počítá noc po noci; host vidí v souhrnu rozpis nocí podle cen.
- **Reservation**: web, host (jméno, e-mail, telefon), počet hostů, od–do (odjezd = exklusivní konec, díky tomu na sebe rezervace navazují), celková cena, stav.
- **Cost**: web, položka, částka, kategorie, datum.
