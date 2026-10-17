import Link from "next/link";
import { Icon } from "@/components/Icon";

/** Přepínač v sekci Vouchery: dárkové poukazy | slevové kódy (prodej na webu). */
export function VoucherTabs({ active, giftsBadge = 0 }: { active: "codes" | "gifts"; giftsBadge?: number }) {
  const tab = (on: boolean) => `flex items-center gap-1.5 rounded-full px-4 py-1.5 transition ${on ? "bg-pine text-white" : "text-soft hover:text-ink"}`;
  return (
    <nav aria-label="Vouchery" className="inline-flex rounded-full border border-line bg-surface p-1 text-sm font-semibold">
      <Link href="/admin/vouchery/poukazy" className={tab(active === "gifts")} aria-current={active === "gifts" ? "page" : undefined}>
        <Icon name="ticket" size={14} />
        Dárkové poukazy
        {giftsBadge > 0 && (
          <span className="ml-0.5 min-w-5 rounded-full bg-amber px-1.5 text-center text-[11px] leading-5 text-ink tabular-nums" title="Čeká na zaplacení">
            {giftsBadge}
          </span>
        )}
      </Link>
      <Link href="/admin/vouchery" className={tab(active === "codes")} aria-current={active === "codes" ? "page" : undefined}>
        Slevové kódy
      </Link>
    </nav>
  );
}
