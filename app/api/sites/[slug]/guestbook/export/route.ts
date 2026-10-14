import { NextRequest, NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { prisma } from "@/lib/prisma";
import { requireSiteOwnerBySlug, deny } from "@/lib/auth";
import { guestCryptoReady } from "@/lib/guest-crypto";
import { buildBook, logAccess, personsForExport } from "@/lib/guestbook-server";
import { countryName, docTypeLabel, exemptionOf, periodLabel, periodRange, PURPOSES } from "@/lib/guestbook";
import { buildUnl } from "@/lib/ubyport";
import { providerLine } from "@/lib/legal";

// Exporty knihy ubytovaných za období (každý se zapíše do historie přístupů):
//   obec     — Excel: evidenční kniha a souhrn poplatku z pobytu k odvodu
//   ubyport  — UNL soubor s cizinci k nahrání na ubyport.policie.cz

export const maxDuration = 60;

const head = (t: string) => ({ value: t, fontWeight: "bold" as const });
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const guard = await requireSiteOwnerBySlug((await params).slug);
  if (!guard.ok) return deny(guard.status);
  if (!guestCryptoReady()) return NextResponse.json({ error: "Chybí šifrovací klíč." }, { status: 503 });
  const site = await prisma.site.findUniqueOrThrow({ where: { id: guard.site.id } });
  const type = req.nextUrl.searchParams.get("type");
  const period = req.nextUrl.searchParams.get("period") ?? "";
  if (!periodRange(period)) return NextResponse.json({ error: "Neznámé období." }, { status: 400 });
  const noStore = { "Cache-Control": "no-store" };

  if (type === "ubyport") {
    if (!site.ubyportIdub) return NextResponse.json({ error: "Doplň v Nastavení → Automatizace identifikátor ubytovatele (IDUB)." }, { status: 400 });
    const guests = await personsForExport(site, period, true);
    const file = buildUnl(
      {
        idub: site.ubyportIdub,
        abbr: site.ubyportAbbr,
        name: site.businessName || site.name,
        contact: site.contactPhone || site.contactEmail,
        address: site.arrivalAddress,
      },
      guests,
    );
    await logAccess(site.id, guard.user.email, "export", `Ubyport ${period} (${guests.length} osob)`);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        ...noStore,
        "Content-Type": "text/plain; charset=windows-1250",
        "Content-Disposition": `attachment; filename="ubyport-${site.slug}-${period}.unl"`,
      },
    });
  }

  if (type === "obec") {
    const [book, persons] = await Promise.all([buildBook(site, period), personsForExport(site, period)]);
    if (!book) return NextResponse.json({ error: "Neznámé období." }, { status: 400 });
    const purpose = (k: string) => PURPOSES.find(([c]) => c === k)?.[1] ?? "";
    const rows = [
      [
        "Příjezd",
        "Odjezd",
        "Nocí v období",
        "Příjmení",
        "Jméno",
        "Datum narození",
        "Státní občanství",
        "Doklad",
        "Číslo dokladu",
        "Adresa bydliště",
        "Osvobození",
        "Poplatek (Kč)",
        "Vízum",
        "Účel pobytu",
        "Kód rezervace",
      ].map(head),
      ...persons.map(({ person: p, start, end, nights, stayNights, publicId }) => {
        const ex = exemptionOf(p, start, stayNights);
        return [
          day(start),
          day(end),
          nights,
          p.lastName,
          p.firstName,
          day(p.birthDate),
          countryName(p.nationality),
          docTypeLabel(p.docType),
          p.docNumber,
          [p.street, [p.zip, p.city].filter(Boolean).join(" "), countryName(p.country)].filter(Boolean).join(", "),
          ex ?? "",
          ex ? 0 : site.touristTax * nights,
          p.visa,
          p.nationality === "CZE" ? "" : purpose(p.purpose),
          publicId,
        ];
      }),
    ];
    const s = book.summary;
    const summary = [
      [head("Ubytovací zařízení"), site.name],
      [head("Provozovatel"), providerLine(site) || site.businessName],
      [head("Adresa"), site.arrivalAddress],
      [head("Období"), periodLabel(period)],
      [head("Sazba (Kč / osoba / noc)"), s.rate],
      [head("Ubytovaných osob"), s.people],
      [head("Osobonocí"), s.personNights],
      [head("Osvobozených osob"), s.exempt],
      [head("Poplatek k odvodu (Kč)"), s.taxDue],
      [head("Odvedeno (Kč)"), book.remittance?.amount ?? ""],
      [head("Datum odvodu"), book.remittance ? day(book.remittance.paidAt) : ""],
    ];
    const buffer = await writeXlsxFile(
      [
        { sheet: "Kniha ubytovaných", data: rows, columns: [12, 12, 8, 18, 14, 14, 16, 16, 14, 40, 14, 10, 12, 18, 14].map((width) => ({ width })), stickyRowsCount: 1, dateFormat: "d.m.yyyy" },
        { sheet: "Souhrn", data: summary, columns: [{ width: 28 }, { width: 50 }], dateFormat: "d.m.yyyy" },
      ],
      {},
    ).toBuffer();
    await logAccess(site.id, guard.user.email, "export", `kniha pro obec ${period} (${persons.length} osob)`);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        ...noStore,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="kniha-ubytovanych-${site.slug}-${period}.xlsx"`,
      },
    });
  }
  return NextResponse.json({ error: "Neznámý export." }, { status: 400 });
}
