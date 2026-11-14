import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GalleryHorizontal, Images, LayoutList, Settings } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { can } from "@/lib/security/rbac";
import { listAlbums, listEditableSettings, listHeroSlides, listSections } from "@/server/services/site.service";
import { PageHeader } from "@/components/admin/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { sp } from "@/components/admin/cms/filter-form";
import { SectionsManager, type SectionRow } from "@/components/admin/site/sections-manager";
import { HeroManager, type HeroRow } from "@/components/admin/site/hero-manager";
import { AlbumsManager, type AlbumRow } from "@/components/admin/site/albums-manager";
import { SettingsForm, type SettingRow } from "@/components/admin/site/settings-form";

const TABS = ["pages", "hero", "albums", "settings"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cms.site");
  return { title: t("title") };
}

export default async function SitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireAdmin("post:write");
  const params = await searchParams;
  const t = await getTranslations("cms");
  const canSettings = can(auth.user.role, "settings:write");
  const canPublish = can(auth.user.role, "post:publish");

  const [sections, slides, albums, settings] = await Promise.all([
    listSections(),
    listHeroSlides(),
    listAlbums(0, 100),
    canSettings ? listEditableSettings() : Promise.resolve([]),
  ]);

  const sectionRows: SectionRow[] = sections.map((s) => ({
    id: s.id,
    page: s.page,
    icon: s.icon,
    sortOrder: s.sortOrder,
    isVisible: s.isVisible,
    translations: s.translations.map((x) => ({ locale: x.locale, title: x.title, contentHtml: x.contentHtml, contentJson: x.contentJson })),
  }));
  const heroRows: HeroRow[] = slides.map((h) => ({
    id: h.id,
    imageId: h.imageId,
    imageUrl: h.image?.url ?? null,
    ctaHref: h.ctaHref,
    sortOrder: h.sortOrder,
    isActive: h.isActive,
    startsAt: h.startsAt?.toISOString() ?? null,
    endsAt: h.endsAt?.toISOString() ?? null,
    translations: h.translations.map((x) => ({ locale: x.locale, headline: x.headline, subline: x.subline, ctaLabel: x.ctaLabel })),
  }));
  const albumRows: AlbumRow[] = albums.items.map((a) => ({
    id: a.id,
    slug: a.slug,
    status: a.status,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    coverId: a.coverId,
    coverUrl: a.cover?.url ?? null,
    itemCount: a._count.items,
    translations: a.translations.map((x) => ({ locale: x.locale, title: x.title, description: x.description })),
  }));
  const settingRows: SettingRow[] = settings.map((s) => ({
    key: s.key,
    value: s.value,
    updatedAt: s.updatedAt?.toISOString() ?? null,
    updatedBy: s.updatedBy,
  }));

  const requested = sp(params, "tab");
  const tab = TABS.find((x) => x === requested && (x !== "settings" || canSettings)) ?? "pages";

  return (
    <>
      <PageHeader title={t("site.title")} description={t("site.description")} />
      <Tabs defaultValue={tab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="pages">
            <LayoutList className="size-4" aria-hidden />
            {t("site.tabs.pages")}
          </TabsTrigger>
          <TabsTrigger value="hero">
            <GalleryHorizontal className="size-4" aria-hidden />
            {t("site.tabs.hero")}
          </TabsTrigger>
          <TabsTrigger value="albums">
            <Images className="size-4" aria-hidden />
            {t("site.tabs.albums")}
          </TabsTrigger>
          {canSettings && (
            <TabsTrigger value="settings">
              <Settings className="size-4" aria-hidden />
              {t("site.tabs.settings")}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="pages">
          <SectionsManager sections={sectionRows} canWrite />
        </TabsContent>
        <TabsContent value="hero">
          <HeroManager slides={heroRows} canWrite now={Date.now()} />
        </TabsContent>
        <TabsContent value="albums">
          <AlbumsManager albums={albumRows} canWrite canPublish={canPublish} />
        </TabsContent>
        {canSettings && (
          <TabsContent value="settings">
            <SettingsForm settings={settingRows} />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
