import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { getSiteContact } from "@/server/services/public-site.service";
import { asLocale } from "@/components/public/locale";
import { PublicConfigProvider } from "@/components/public/runtime-config";
import { getPublicRuntimeConfig } from "@/lib/public-config";

export default async function PublicLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const contact = await getSiteContact(locale);
  return (
    <PublicConfigProvider value={getPublicRuntimeConfig()}>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter contact={contact} />
      </div>
    </PublicConfigProvider>
  );
}
