import "server-only";
import { countryName, type GuestPerson } from "@/lib/guestbook";

// Export cizinců pro Ubyport (hlášení ubytování cizinců cizinecké policii):
// textový soubor UNL — věta „A“ s ubytovatelem a věty „U“ s ubytovanými,
// pole oddělená „|“, řádky CRLF, kódování Windows-1250.
// Formát podle veřejně dostupné knihovny pro tvorbu UNL (struktura „A|2“);
// před prvním ostrým použitím ho ověř validátorem UbyData na ubyport.policie.cz.

/** Horní polovina tabulky Windows-1250 (bajty 0x80–0xFF). */
const CP1250_HIGH = "€�‚�„…†‡�‰Š‹ŚŤŽŹ�‘’“”•–—�™š›śťžź\u00a0ˇ˘Ł¤Ą¦§¨©Ş«¬\u00ad®Ż°±˛ł´µ¶·¸ąş»Ľ˝ľżŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢßŕáâăäĺćçčéęëěíîďđńňóôőö÷řůúűüýţ˙";

/** Text → bajty Windows-1250; znaky mimo tabulku bez diakritiky, jinak „?“. */
export function toCp1250(text: string): Buffer {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    const i = CP1250_HIGH.indexOf(ch);
    if (i >= 0) {
      out.push(0x80 + i);
      continue;
    }
    const plain = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    out.push(plain && plain.charCodeAt(0) < 0x80 ? plain.charCodeAt(0) : 0x3f);
  }
  return Buffer.from(out);
}

const clean = (v: string, max = 255) => v.replace(/[|\r\n]+/g, " ").trim().slice(0, max);
const date = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};
const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) =>
  `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export type UbyportProvider = {
  idub: string;
  abbr: string;
  name: string;
  contact: string;
  /** Adresa ubytovacího zařízení (volný text — rozdělí se na ulici, PSČ a obec). */
  address: string;
};

/** „Lipová 12, 382 78 Lipno nad Vltavou“ → ulice, č. p., PSČ, obec. */
function splitAddress(address: string) {
  const parts = address.split(",").map((x) => x.trim()).filter(Boolean);
  const last = parts.pop() ?? "";
  const zip = /\d{3}\s?\d{2}/.exec(last)?.[0].replace(/\s/g, "") ?? "";
  const town = last.replace(/\d{3}\s?\d{2}/, "").trim();
  const streetPart = parts[0] ?? "";
  const m = /^(.*?)\s+(\d+[a-zA-Z]?)(?:\/(\d+[a-zA-Z]?))?$/.exec(streetPart);
  return { town, zip, street: m ? m[1] : streetPart, houseNo: m?.[2] ?? "", orientNo: m?.[3] ?? "" };
}

export function buildUnl(provider: UbyportProvider, guests: { person: GuestPerson; start: string; end: string }[], now = new Date()): Buffer {
  const a = splitAddress(provider.address);
  const header = [
    "A",
    "2",
    clean(provider.idub, 20),
    clean(provider.abbr, 10),
    clean(provider.name, 100),
    clean(provider.contact, 100),
    "", // okres
    clean(a.town, 48),
    "", // část obce
    clean(a.street, 48),
    clean(a.houseNo, 10),
    clean(a.orientNo, 10),
    clean(a.zip, 5),
    stamp(now),
    "",
    "",
  ].join("|");
  const rows = guests.map(({ person: p, start, end }) =>
    [
      "U",
      date(start),
      date(end),
      clean(p.lastName, 50),
      clean(p.firstName, 50),
      "",
      date(p.birthDate),
      "",
      "",
      p.nationality,
      clean([p.street, [p.zip, p.city].filter(Boolean).join(" "), countryName(p.country)].filter(Boolean).join(", "), 128),
      clean(p.docNumber, 30),
      clean(p.visa, 15),
      p.purpose || "10",
      "",
      clean(p.note, 255),
    ].join("|"),
  );
  return toCp1250([header, ...rows].join("\r\n"));
}
