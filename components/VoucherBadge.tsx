import { czk } from "@/lib/pricing";
import { Icon } from "@/components/Icon";

// Štítek uplatněného voucheru u rezervace v administraci.
export function VoucherBadge({ code, discount }: { code: string; discount: number }) {
  if (!code) return null;
  return (
    <span
      title={`Uplatněný voucher ${code}`}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-pine/10 px-2 py-0.5 font-sans text-[11px] font-semibold text-pine"
    >
      <Icon name="ticket" size={13} className="mr-1" />{code} −{czk(discount)}
    </span>
  );
}
