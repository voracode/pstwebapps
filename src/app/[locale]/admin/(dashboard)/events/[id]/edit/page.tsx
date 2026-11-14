import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { ApiError } from "@/lib/http";
import { isMunicipalScoped } from "@/lib/security/rbac";
import { pickTranslation } from "@/lib/i18n/pick";
import type { AppLocale } from "@/lib/validation/common";
import { getEventAdmin } from "@/server/services/event.service";
import { adminPostOfSuco } from "@/server/services/admin-lookup.service";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { EventForm } from "@/components/admin/events/event-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("edit") };
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("event:write", `/admin/events/${id}/edit`);
  const t = await getTranslations("events");
  const locale = (await getLocale()) as AppLocale;
  const e = await getEventAdmin(auth, id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const adminPostId = await adminPostOfSuco(e.sucoId);
  const title = pickTranslation(e.translations, locale)?.title ?? e.slug;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("edit")}
        description={title}
        breadcrumb={
          <>
            <Link href="/admin/events" className="hover:underline">{t("title")}</Link>
            {" / "}
            <Link href={`/admin/events/${id}`} className="hover:underline">{title}</Link>
          </>
        }
      />
      <EventForm
        lockMunicipalityId={isMunicipalScoped(auth.user) ? auth.user.municipalityId : null}
        initial={{
          id: e.id,
          type: e.type,
          status: e.status,
          isPublic: e.isPublic,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          municipalityId: e.municipalityId,
          adminPostId,
          sucoId: e.sucoId,
          venue: e.venue,
          capacity: e.capacity,
          expectedTurnout: e.expectedTurnout,
          translations: e.translations.map((x) => ({ locale: x.locale, title: x.title, summary: x.summary, contentHtml: x.contentHtml })),
        }}
      />
    </div>
  );
}
