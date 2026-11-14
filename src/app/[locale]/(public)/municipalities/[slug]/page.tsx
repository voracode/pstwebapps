import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Building, Clock, Mail, MapPin, Phone, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { PersonCard } from "@/components/public/person-card";
import { EventCard, PostCard } from "@/components/public/cards";
import { alternatesFor, asLocale } from "@/components/public/locale";
import type { AppLocale } from "@/lib/validation/common";
import { municipalDirectory } from "@/server/services/content.service";
import { listEventsPublic } from "@/server/services/event.service";
import { listPostsPublic } from "@/server/services/post.service";
import { getMunicipalityAdminPosts } from "@/server/services/public-site.service";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string; slug: string }> };

const load = cache(async (locale: AppLocale, slug: string) => (await municipalDirectory(locale)).find((m) => m.slug === slug) ?? null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const m = await load(asLocale(locale), slug);
  if (!m) return {};
  const t = await getTranslations({ locale, namespace: "public.municipalities" });
  return {
    title: `${m.name} — ${t("title")}`,
    description: m.officialName ?? undefined,
    alternates: alternatesFor(locale, `/municipalities/${m.slug}`),
  };
}

export default async function MunicipalityPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const m = await load(locale, slug);
  if (!m) notFound();

  const t = await getTranslations("public");
  const [adminPosts, events, posts] = await Promise.all([
    getMunicipalityAdminPosts(m.slug),
    listEventsPublic(locale, { municipality: m.slug }, 0, 4),
    listPostsPublic(locale, { municipality: m.slug }, 0, 3),
  ]);
  const coordinators = m.committee.filter((c) => c.isCoordinator);
  const members = m.committee.filter((c) => !c.isCoordinator);
  const osm = (lat: number, lon: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;

  return (
    <>
      <PageHeader
        eyebrow={m.officialName ?? undefined}
        title={m.name}
        crumbs={[{ label: t("nav.municipalities"), href: "/municipalities" }, { label: m.name }]}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-white px-2 py-0.5 font-display font-bold text-pst-red">{m.code}</span>
          {m.isSpecialRegion && <Badge variant="gold">{t("municipalities.specialRegion")}</Badge>}
          {m.capital && (
            <span className="inline-flex items-center gap-1 text-white/85">
              <MapPin className="size-4" aria-hidden />
              {t("municipalities.capital", { capital: m.capital })}
            </span>
          )}
          {m.latitude !== null && m.longitude !== null && (
            <a href={osm(m.latitude, m.longitude)} target="_blank" rel="noopener noreferrer" className="text-white/85 underline underline-offset-4 hover:text-white">
              {t("municipalities.viewOnMap")}
            </a>
          )}
        </div>
      </PageHeader>
      <PageBody className="space-y-14">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <section aria-labelledby="offices-h">
            <h2 id="offices-h" className="mb-5 flex items-center gap-2 text-3xl font-extrabold uppercase">
              <Building className="size-7 text-pst-red" aria-hidden />
              {t("municipalities.officesTitle")}
            </h2>
            {m.offices.length > 0 ? (
              <ul className="space-y-4">
                {m.offices.map((o) => (
                  <li key={o.id} className="rounded-lg border bg-card p-5 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-xl font-bold">{o.name}</h3>
                      {o.isHeadquarters && <Badge>{t("municipalities.headquarters")}</Badge>}
                      {o.adminPost && <Badge variant="muted">{o.adminPost}</Badge>}
                    </div>
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      {o.address && (
                        <div className="flex gap-2">
                          <dt>
                            <MapPin className="size-4 text-pst-red" aria-label={t("contact.address")} />
                          </dt>
                          <dd>
                            {o.address}
                            {o.latitude !== null && o.longitude !== null && (
                              <>
                                {" · "}
                                <a href={osm(o.latitude, o.longitude)} target="_blank" rel="noopener noreferrer" className="text-pst-red hover:underline">
                                  {t("municipalities.viewOnMap")}
                                </a>
                              </>
                            )}
                          </dd>
                        </div>
                      )}
                      {o.phone && (
                        <div className="flex gap-2">
                          <dt>
                            <Phone className="size-4 text-pst-red" aria-label={t("contact.phone")} />
                          </dt>
                          <dd>
                            <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="hover:text-pst-red">
                              {o.phone}
                            </a>
                          </dd>
                        </div>
                      )}
                      {o.email && (
                        <div className="flex gap-2">
                          <dt>
                            <Mail className="size-4 text-pst-red" aria-label={t("contact.email")} />
                          </dt>
                          <dd className="break-all">
                            <a href={`mailto:${o.email}`} className="hover:text-pst-red">
                              {o.email}
                            </a>
                          </dd>
                        </div>
                      )}
                      {o.openingHours && (
                        <div className="flex gap-2">
                          <dt>
                            <Clock className="size-4 text-pst-red" aria-label={t("municipalities.hours")} />
                          </dt>
                          <dd>{o.openingHours}</dd>
                        </div>
                      )}
                    </dl>
                    {o.coordinator && (
                      <p className="mt-3 border-t pt-3 text-sm">
                        <span className="text-muted-foreground">{o.coordinator.positionTitle || t("leadership.coordinator")}: </span>
                        <span className="font-semibold">{o.coordinator.fullName}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{t("municipalities.noOffices")}</p>
            )}
          </section>

          <aside aria-labelledby="posts-h" className="space-y-3">
            <h2 id="posts-h" className="mb-5 text-2xl font-extrabold uppercase">
              {t("municipalities.postsTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("municipalities.adminPosts", { count: adminPosts?.length ?? m.adminPostCount })}</p>
            {adminPosts && adminPosts.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {adminPosts.map((p) => (
                  <li key={p} className="rounded-full border bg-surface px-3 py-1 text-sm font-medium">
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        <section aria-labelledby="committee-h">
          <h2 id="committee-h" className="mb-5 flex items-center gap-2 text-3xl font-extrabold uppercase">
            <Users className="size-7 text-pst-red" aria-hidden />
            {t("municipalities.committee")}
          </h2>
          {m.committee.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {[...coordinators, ...members].map((p) => (
                <PersonCard key={p.id} person={p} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{t("municipalities.noCommittee")}</p>
          )}
        </section>

        {events.items.length > 0 && (
          <section aria-labelledby="ev-h">
            <h2 id="ev-h" className="mb-5 text-3xl font-extrabold uppercase">
              {t("municipalities.events")}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {events.items.map((e) => (
                <EventCard key={e.slug} event={e} locale={locale} compact />
              ))}
            </div>
          </section>
        )}

        {posts.items.length > 0 && (
          <section aria-labelledby="news-h">
            <h2 id="news-h" className="mb-5 text-3xl font-extrabold uppercase">
              {t("municipalities.news")}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.items.map((p) => (
                <PostCard key={p.id} post={p} locale={locale} />
              ))}
            </div>
          </section>
        )}

        <Link href="/municipalities" className="inline-flex items-center gap-1 text-sm font-semibold text-pst-red hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          {t("municipalities.back")}
        </Link>
      </PageBody>
    </>
  );
}
