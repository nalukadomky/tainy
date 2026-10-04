import type { Metadata } from "next";

// Vnitřek živého náhledu v administraci — do vyhledávačů nepatří.
export const metadata: Metadata = {
  title: "Náhled webu — tainy",
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
