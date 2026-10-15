import Link from "next/link";
import { Icon } from "@/components/Icon";

/** Přepínač v sekci Vouchery: slevové kódy | dárkové poukazy (prodej na webu). */
export function VoucherTabs({ active }: { active: "codes" | "gifts" }) {
  const tab = (on: boolean) => `flex items-center gap-1.5 rounded-full px-4 py-1.5 transition ${on ? "bg-pine text-white" : "text-soft hover:text-ink"}`;
  return (
    <nav aria-label="Vouchery" className="inline-flex rounded-full border border-line bg-surface p-1 text-sm font-semibold">
      <Link href="/admin/vouchery" className={tab(active === "codes")} aria-current={active === "codes" ? "page" : undefined}>
        Slevové kódy
      </Link>
      <Link href="/admin/vouchery/poukazy" className={tab(active === "gifts")} aria-current={active === "gifts" ? "page" : undefined}>
        <Icon name="ticket" size={14} />
        Dárkové poukazy
      </Link>
    </nav>
  );
}
