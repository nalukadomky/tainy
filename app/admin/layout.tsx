import type { Metadata } from "next";
import { AdminNav } from "@/components/AdminNav";

export const metadata: Metadata = {
  title: "Administrace — tainy",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg pb-24 sm:pb-10">
      <AdminNav />
      <main className="mx-auto max-w-4xl px-5 pt-6">{children}</main>
    </div>
  );
}
