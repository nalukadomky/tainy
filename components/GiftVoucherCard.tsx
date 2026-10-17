"use client";

import QRCode from "qrcode";
import { giftHeadline, type GiftDesign } from "@/lib/gift";

// Dárkový poukaz: náhled v průvodci, nabídka na webu i poukaz, který kupující
// dostane (stránka /darek/… k vytištění). Barvu a vzhled volí majitel.

/** QR kód v barvě poukazu; podklad průhledný (světlé šablony) — okraj 2 moduly kvůli čtení. */
function Qr({ value, color }: { value: string; color: string }) {
  const { size: n, data } = QRCode.create(value, { errorCorrectionLevel: "M" }).modules;
  const q = 2;
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (data[y * n + x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  return (
    <svg viewBox={`0 0 ${n + q * 2} ${n + q * 2}`} shapeRendering="crispEdges" aria-hidden className="block h-full w-full">
      <path d={d} fill={color} />
    </svg>
  );
}

/** Platnost: skutečné datum (prodaný poukaz), jinak od dneška + měsíce (náhled). */
const validLabel = (months: number, until?: string | null) => {
  const d = until ? new Date(`${until}T12:00:00`) : new Date();
  if (!until) d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
};

/** Poukaz v poměru 16 : 10 — škáluje se podle šířky rodiče (container queries). */
export function GiftVoucherCard({
  d,
  site,
  code = "•••• – ••••",
  qrUrl,
  validTo,
}: {
  d: GiftDesign;
  site: string;
  code?: string;
  /** Kam vede QR kód (stránka poukazu); bez něj ukázkový kód na web. */
  qrUrl?: string;
  validTo?: string | null;
}) {
  const head = giftHeadline(d);
  const t = d.template;
  const dark = t === "tma" || t === "fotka";
  const ink = dark ? "#ffffff" : "#1e2a20";
  const soft = dark ? "rgba(255,255,255,.78)" : "#5a6557";
  const bg = t === "klasik" ? "#f6efe0" : t === "minimal" ? "#ffffff" : t === "tma" ? d.color : "#1e2a20";
  const until = validLabel(d.validMonths, validTo);
  const terms = d.kind === "weekend" ? "víkend pá–ne · termín si vybereš na webu" : "termín si vybereš na webu";

  return (
    <div className="@container w-full text-left">
      <div
        className="relative aspect-[16/10] w-full overflow-hidden rounded-[3cqw] shadow-[0_24px_60px_-24px_rgba(30,42,32,0.45)]"
        style={{ background: bg, color: ink }}
      >
        {t === "fotka" && d.photo && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/10" />
          </>
        )}
        {t === "klasik" && <div className="pointer-events-none absolute inset-[2.4cqw] rounded-[2cqw] border-[0.35cqw]" style={{ borderColor: d.color }} />}
        {t === "minimal" && <div className="absolute inset-y-0 left-0 w-[2.2cqw]" style={{ background: d.color }} />}
        {t === "tma" && (
          <div className="absolute -right-[12cqw] -top-[18cqw] h-[60cqw] w-[60cqw] rounded-full opacity-20" style={{ background: "radial-gradient(circle, #e9c98f, transparent 65%)" }} />
        )}

        <div className="relative flex h-full flex-col justify-between p-[6.5cqw]">
          <div className="flex items-start justify-between gap-[3cqw]">
            <div className="min-w-0">
              <p className="font-display text-[3.4cqw] font-semibold tracking-tight" style={{ color: dark ? ink : d.color }}>
                {site}
              </p>
              <p className="mt-[0.6cqw] text-[2.1cqw] font-semibold uppercase tracking-[0.22em]" style={{ color: soft }}>
                Dárkový poukaz
              </p>
            </div>
            {!dark && (
              <span className="rounded-full px-[2cqw] py-[0.8cqw] text-[1.8cqw] font-semibold" style={{ background: `${d.color}18`, color: d.color }}>
                Platí do {until}
              </span>
            )}
          </div>

          <div className="max-w-[78%]">
            <p className="font-display text-[9cqw] font-semibold leading-[0.95] tracking-tight">{head}</p>
            {/* Věnování max. 4 řádky do zhruba půlky karty, dlouhá slova se zalomí */}
            {d.recipient && <p className="mt-[2.4cqw] max-w-[62cqw] truncate text-[3.1cqw] font-semibold leading-snug">{d.recipient}</p>}
            {d.message && (
              <p className={`${d.recipient ? "mt-[0.8cqw]" : "mt-[2cqw]"} line-clamp-4 max-w-[58cqw] whitespace-pre-line text-[2.5cqw] leading-snug [overflow-wrap:anywhere]`} style={{ color: soft }}>
                {d.message}
              </p>
            )}
          </div>

          <div className="flex items-end justify-between gap-[3cqw]">
            <div className="text-[2cqw] leading-tight" style={{ color: soft }}>
              <p>
                Kód{" "}
                <span className="font-mono text-[2.6cqw] font-bold tracking-wider" style={{ color: ink }}>
                  {code}
                </span>
              </p>
              <p className="mt-[0.5cqw]">
                {dark ? `Platí do ${until} · ` : ""}
                {terms}
              </p>
            </div>
            {/* Na tmavém podkladu světlý polštářek — telefon potřebuje tmavé moduly na světlém */}
            <div className={`aspect-square w-[12cqw] shrink-0 ${dark ? "rounded-[1.2cqw] p-[0.3cqw]" : "-m-[0.6cqw]"}`} style={dark ? { background: "#f6efe0" } : undefined}>
              <Qr value={qrUrl ?? "https://tainy.cz"} color={d.color} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
