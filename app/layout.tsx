import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-fraunces",
});

const instrument = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: "tainy — vlastní web s rezervacemi bez provizí",
  description:
    "Web s rezervacemi pro chaty, chalupy, apartmány, tiny housy a glampingy. Platby QR kódem nebo kartou přímo tobě, kalendář sladěný s Airbnb a Bookingem, automatické e-maily a úklid. Měsíc zdarma.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f3ec",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body className={`${fraunces.variable} ${instrument.variable} min-h-dvh`}>
        {children}
      </body>
    </html>
  );
}
