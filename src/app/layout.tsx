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

// Brand fonts per Turnkey Brand Manual:
//   Subheader: GTF Solina Medium
//   Body copy: GTF Solina Regular
//   Headline: Helvetica Bold Condensed
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
      {/* font-body sets GTF Solina as the base across the whole client portal;
          globals.css switches headings to Helvetica Bold Condensed — the
          Turnkey Brand Manual typography, matching the CRM. */}
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${solina.variable} ${helvetica.variable} font-body antialiased`}
      >
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
