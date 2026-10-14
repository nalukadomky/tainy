import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ImportFlow } from "@/components/ImportFlow";
import { getUser } from "@/lib/auth";
import { importAllowed } from "@/lib/import/flag";

// Import existujícího webu do tainy (zatím ve zkušebním provozu).
export default async function ImportPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/import");
  if (!importAllowed(user.email)) notFound();

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
