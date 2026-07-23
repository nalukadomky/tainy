import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Administrace — tainy",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Middleware už nepřihlášené odchytí; tady navíc řešíme „uživatel bez webu".
  const user = await getUser();
  if (!user) redirect("/login?next=/admin");
  const count = await prisma.site.count({ where: { ownerId: user.id } });
  if (count === 0) redirect("/onboarding");

  return (
    <div className="min-h-dvh bg-bg pb-24 sm:pb-10">
      <AdminNav />
      <main className="mx-auto max-w-4xl px-5 pt-6">{children}</main>
    </div>
  );
}
