import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Inter, Barlow_Condensed } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Toaster } from "sonner";
import { routing } from "@/i18n/routing";
import "../globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const barlow = Barlow_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow",
  display: "swap",
});

// No generateStaticParams on purpose: pages render on first request and are
// then cached per their `revalidate`, so `next build` (Docker) needs no database.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public" });
  const name = t.has("meta.name") ? t("meta.name") : "Partido Socialista de Timor";
  const description = t.has("meta.description") ? t("meta.description") : "Pelo Progresso, Igualdade";
  return {
    metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
    title: { default: `${name} · PST`, template: `%s · PST` },
    description,
    applicationName: "PST",
    icons: { icon: "/brand/emblem-192.png", apple: "/brand/emblem-192.png" },
    openGraph: { siteName: "Partido Socialista de Timor", type: "website", locale, images: ["/brand/emblem.png"] },
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l === "tet" ? "tet-TL" : l, `/${l}`])),
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#d91c1f",
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    // Tetum has no BCP-47 two-letter code; "tet" is the ISO 639-2 tag.
    <html lang={locale} className={`${inter.variable} ${barlow.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
