import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * Messages are split per namespace (messages/<locale>/<ns>.json) so each area
 * of the app owns its own file. Keep this list in sync with the folder.
 */
export const NAMESPACES = [
  "common",
  "auth",
  "admin",
  "public",
  "dashboard",
  "members",
  "events",
  "aspirations",
  "cms",
  "users",
  "audit",
] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => [ns, (await import(`../../messages/${locale}/${ns}.json`)).default] as const),
  );

  return {
    locale,
    timeZone: "Asia/Dili",
    messages: Object.fromEntries(entries),
  };
});
