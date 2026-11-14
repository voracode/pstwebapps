import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/security/session";
import { safeNext } from "@/lib/auth/safe-next";
import { LoginFlow } from "./login-flow";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const auth = await getSession();
  if (auth?.stage === "ACTIVE") redirect({ href: safeNext(next), locale: await getLocale() });

  // Resume an unfinished login (e.g. browser closed between password and 2FA).
  return <LoginFlow initialStage={auth?.stage ?? "CREDENTIALS"} next={safeNext(next)} email={auth?.user.email} />;
}
