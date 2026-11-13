import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["tet", "pt", "id", "en"],
  defaultLocale: "tet",
  // Always prefix (/tet/..., /pt/...) — simpler CDN caching and hreflang.
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
