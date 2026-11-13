import { getTranslations, setRequestLocale } from "next-intl/server";

// Placeholder home page — replaced by the full public portal in Phase 3.
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("meta");
  return (
    <main style={{ fontFamily: "system-ui", padding: 32, textAlign: "center" }}>
      <h1 style={{ color: "#D91C1F" }}>{t("name")}</h1>
      <p style={{ letterSpacing: 2, fontWeight: 700 }}>{t("motto")}</p>
    </main>
  );
}
