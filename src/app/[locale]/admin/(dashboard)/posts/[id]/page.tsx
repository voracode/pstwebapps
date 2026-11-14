import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { can } from "@/lib/security/rbac";
import { ApiError } from "@/lib/http";
import { getPostAdmin } from "@/server/services/post.service";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { PostEditor, type PostEditorData } from "@/components/admin/cms/post-editor";
import { pickRow } from "@/components/admin/cms/form-helpers";
import { postEditorOptions } from "../editor-options";

async function load(id: string) {
  try {
    return await getPostAdmin(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; locale: string }> }): Promise<Metadata> {
  const { id, locale } = await params;
  const t = await getTranslations("cms.posts");
  try {
    const p = await getPostAdmin(id);
    return { title: pickRow(p.translations, locale)?.title ?? t("edit") };
  } catch {
    return { title: t("edit") };
  }
}

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin("post:read");
  const { id } = await params;
  if (!/^[a-z0-9]{20,40}$/i.test(id)) notFound();
  const locale = await getLocale();
  const t = await getTranslations("cms.posts");
  const [p, options] = await Promise.all([load(id), postEditorOptions(locale)]);

  const data: PostEditorData = {
    id: p.id,
    type: p.type,
    status: p.status,
    categoryId: p.categoryId,
    municipalityId: p.municipalityId,
    cover: p.cover ? { id: p.cover.id, url: p.cover.url, kind: "IMAGE" } : null,
    attachmentId: p.attachmentId,
    byline: p.byline,
    isFeatured: p.isFeatured,
    pinnedToHero: p.pinnedToHero,
    tags: p.tags.map((x) => x.label),
    publishedAt: p.publishedAt?.toISOString() ?? null,
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
    authorName: p.author?.name ?? null,
    reviewerName: p.reviewedBy?.name ?? null,
    translations: p.translations.map((x) => ({
      locale: x.locale,
      title: x.title,
      slug: x.slug,
      excerpt: x.excerpt,
      contentJson: x.contentJson,
      contentHtml: x.contentHtml,
      seoTitle: x.seoTitle,
      seoDescription: x.seoDescription,
    })),
  };
  // Keep the attachment selectable even if it is no longer public.
  if (p.attachment && !options.documents.some((d) => d.id === p.attachment!.id)) {
    options.documents.unshift({ id: p.attachment.id, type: p.attachment.type, title: p.attachment.slug });
  }

  return (
    <>
      <PageHeader
        title={pickRow(p.translations, locale)?.title ?? t("edit")}
        breadcrumb={
          <Link href="/admin/posts" className="hover:underline">
            {t("title")}
          </Link>
        }
      />
      <PostEditor
        key={p.id}
        post={data}
        {...options}
        permissions={{
          write: can(auth.user.role, "post:write"),
          publish: can(auth.user.role, "post:publish"),
          delete: can(auth.user.role, "post:delete"),
        }}
      />
    </>
  );
}
