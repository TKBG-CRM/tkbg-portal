import type { Metadata } from "next";
import localFont from "next/font/local";
import QueryProvider from "@/providers/query-provider";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// Brand fonts — Solina (body) + Helvetica Neue LT Pro (headings),
// matching the CRM portal + branded email template.
const solina = localFont({
  src: [
    { path: "./fonts/Solina-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/Solina-Medium.otf", weight: "500", style: "normal" },
  ],
  variable: "--font-solina",
  display: "swap",
});
const helvetica = localFont({
  src: [
    { path: "./fonts/HelveticaNeueLTPro-Roman.otf", weight: "400", style: "normal" },
    { path: "./fonts/HelveticaLTPro-BoldCond.otf", weight: "700", style: "normal" },
  ],
  variable: "--font-helvetica",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Turnkey Client Portal",
  description: "Turnkey Building Group",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${solina.variable} ${helvetica.variable} font-body antialiased`}
      >
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
