import { czk } from "@/lib/pricing";

// Štítek uplatněného voucheru u rezervace v administraci.
export function VoucherBadge({ code, discount }: { code: string; discount: number }) {
  if (!code) return null;
  return (
    <span
      title={`Uplatněný voucher ${code}`}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-pine/10 px-2 py-0.5 font-sans text-[11px] font-semibold text-pine"
    >
      🎟 {code} −{czk(discount)}
    </span>
  );
}
