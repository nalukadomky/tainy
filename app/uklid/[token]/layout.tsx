import type { Metadata, Viewport } from "next";

// Kalendář úklidů pro uklízečku — soukromý odkaz, do vyhledávačů nepatří.
export const metadata: Metadata = {
  title: "Moje úklidy — tainy",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f6f3ec" };

export default function CleanerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
