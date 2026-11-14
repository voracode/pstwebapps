import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Emblem } from "@/components/brand/emblem";
import { buttonVariants } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("common.errors");
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <Emblem size={96} />
      <p className="font-display text-7xl font-extrabold text-pst-red">404</p>
      <h1 className="text-2xl font-bold uppercase">{t("notFoundTitle")}</h1>
      <p className="max-w-md text-muted-foreground">{t("notFoundBody")}</p>
      <Link href="/" className={buttonVariants()}>
        {t("goHome")}
      </Link>
    </main>
  );
}
