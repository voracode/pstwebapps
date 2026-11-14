import { getTranslations } from "next-intl/server";
import { Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Emblem } from "@/components/brand/emblem";
import { buttonVariants } from "@/components/ui/button";

export default async function PublicNotFound() {
  const t = await getTranslations("public");
  const tc = await getTranslations("common.errors");
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <Emblem size={96} />
      <p className="font-display text-7xl font-extrabold text-pst-red">404</p>
      <h1 className="text-2xl font-bold uppercase">{t("notFound.title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("notFound.body")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={buttonVariants()}>
          {tc("goHome")}
        </Link>
        <Link href="/news" className={buttonVariants({ variant: "outline" })}>
          <Search aria-hidden />
          {t("nav.news")}
        </Link>
      </div>
    </div>
  );
}
