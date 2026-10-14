import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ImportFlow } from "@/components/ImportFlow";
import { getUser } from "@/lib/auth";
import { importEnabled } from "@/lib/import/flag";
import { earlyAccess, mayCreateSite } from "@/lib/early-access";

// Import existujícího webu do tainy.
export default async function ImportPage() {
  if (!importEnabled()) notFound();
  // Nový majitel přichází z registrace — účet si založí a vrátí se sem
  const user = await getUser();
  if (!user) redirect(earlyAccess() ? "/early-access?z=import" : "/register?next=/import");
  if (!(await mayCreateSite(user))) redirect("/early-access?z=import");

  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-5 pb-10">
      <header className="flex items-center justify-between py-5">
        <Logo className="text-xl" />
        <Link href="/admin" className="text-sm text-soft hover:text-ink">
          Zavřít ✕
        </Link>
      </header>
      <ImportFlow />
    </div>
  );
}
