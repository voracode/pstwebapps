import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Emblem, Stars } from "@/components/brand/emblem";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("auth");
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-pst-ink px-4 py-10">
      {/* Red diagonal band + star motif */}
      <div aria-hidden className="pointer-events-none absolute -left-1/4 top-0 h-[55%] w-[150%] -skew-y-6 bg-gradient-to-r from-pst-red-800 via-pst-red to-pst-red-700" />
      <div aria-hidden className="pointer-events-none absolute right-6 top-6 text-6xl text-pst-gold/20">★</div>
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center text-white">
          <Emblem size={84} priority className="shadow-xl ring-4 ring-white/20" />
          <div>
            <p className="font-display text-2xl font-extrabold uppercase tracking-wide">Partido Socialista de Timor</p>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-pst-gold">
              <Stars className="mr-1" /> SIM-PST
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-background p-6 shadow-2xl sm:p-8">{children}</div>
        <div className="mt-5 flex items-center justify-between text-xs text-white/60">
          <span>{t("securityNotice")}</span>
          <LocaleSwitcher variant="pills" tone="light" />
        </div>
      </div>
    </div>
  );
}
