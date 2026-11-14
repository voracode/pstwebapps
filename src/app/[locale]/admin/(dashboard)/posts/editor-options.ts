import "server-only";
import { db } from "@/lib/db";
import { pickRow } from "@/components/admin/cms/form-helpers";

/** Select options for the post editor sidebar. */
export async function postEditorOptions(locale: string) {
  const [categories, municipalities, documents] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: "asc" }, include: { translations: true } }),
    db.municipality.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.document.findMany({
      where: { deletedAt: null, isPublic: true, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: 300,
      select: { id: true, type: true, slug: true, translations: { select: { locale: true, title: true } } },
    }),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: pickRow(c.translations, locale)?.name ?? c.key })),
    municipalities,
    documents: documents.map((d) => ({ id: d.id, type: d.type, title: pickRow(d.translations, locale)?.title ?? d.slug })),
  };
}
