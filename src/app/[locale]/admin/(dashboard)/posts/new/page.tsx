import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { can } from "@/lib/security/rbac";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { PostEditor } from "@/components/admin/cms/post-editor";
import { postEditorOptions } from "../editor-options";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cms.posts");
  return { title: t("new") };
}

export default async function NewPostPage() {
  const auth = await requireAdmin("post:write");
  const t = await getTranslations("cms.posts");
  const options = await postEditorOptions(await getLocale());
  return (
    <>
      <PageHeader
        title={t("new")}
        breadcrumb={
          <Link href="/admin/posts" className="hover:underline">
            {t("title")}
          </Link>
        }
      />
      <PostEditor
        post={null}
        {...options}
        permissions={{ write: true, publish: can(auth.user.role, "post:publish"), delete: can(auth.user.role, "post:delete") }}
      />
    </>
  );
}
