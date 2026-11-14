import { getTranslations } from "next-intl/server";
import { CalendarDays, Clock, Download, FileText, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { MediaImage, ImageFallback } from "@/components/public/media-image";
import { formatBytes, formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import type { listPostsPublic } from "@/server/services/post.service";
import type { listEventsPublic } from "@/server/services/event.service";
import type { listDocumentsPublic } from "@/server/services/content.service";
import { pickJson } from "@/server/services/public-site.service";
import type { AppLocale } from "@/lib/validation/common";

export type PostCardData = Awaited<ReturnType<typeof listPostsPublic>>["items"][number];
export type EventCardData = Awaited<ReturnType<typeof listEventsPublic>>["items"][number];
export type DocumentCardData = Awaited<ReturnType<typeof listDocumentsPublic>>["items"][number];

const POST_BADGE: Record<string, "default" | "dark" | "gold" | "outline"> = {
  NEWS: "default",
  PRESS_RELEASE: "dark",
  ARTICLE: "outline",
  STATEMENT: "gold",
};

export async function PostCard({ post, locale, priority, variant = "card" }: { post: PostCardData; locale: string; priority?: boolean; variant?: "card" | "row" }) {
  const t = await getTranslations("common.enums.postType");
  const tc = await getTranslations("public.common");
  const alt = post.cover ? (pickJson(post.cover.alt, locale as AppLocale) ?? post.title) : post.title;
  const href = `/news/${post.slug}`;
  const row = variant === "row";
  return (
    <article className={cn("group relative flex overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md", row ? "flex-row" : "flex-col")}>
      <div className={cn("relative shrink-0 overflow-hidden", row ? "w-28 sm:w-40" : "aspect-[16/9] w-full")}>
        {post.cover ? (
          <MediaImage
            src={post.cover.url}
            alt={alt}
            blurDataUrl={post.cover.blurDataUrl}
            width={post.cover.width}
            height={post.cover.height}
            eager={priority}
            className="size-full transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transform-none"
          />
        ) : (
          <ImageFallback className="size-full" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={POST_BADGE[post.type] ?? "default"}>{t(post.type)}</Badge>
          {post.category && !row && <span className="text-xs font-medium text-muted-foreground">{post.category.name}</span>}
        </div>
        <h3 className={cn("font-display font-bold leading-tight", row ? "text-lg" : "text-xl")}>
          <Link href={href} className="after:absolute after:inset-0 hover:text-pst-red focus-visible:outline-none">
            {post.title}
          </Link>
        </h3>
        {!row && post.excerpt && <p className="line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
          {post.publishedAt && (
            <time dateTime={new Date(post.publishedAt).toISOString()} className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden />
              {formatDate(post.publishedAt, locale)}
            </time>
          )}
          {post.readingMinutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {tc("readingTime", { minutes: post.readingMinutes })}
            </span>
          ) : null}
          {post.municipality && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {post.municipality.name}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export async function EventCard({ event, locale, compact }: { event: EventCardData; locale: string; compact?: boolean }) {
  const t = await getTranslations("common.enums");
  const start = new Date(event.startsAt);
  const day = formatDate(start, locale, { day: "2-digit" });
  const month = formatDate(start, locale, { month: "short" }).replace(".", "");
  const inactive = event.status === "CANCELLED" || event.status === "POSTPONED";
  return (
    <article className="group relative flex gap-4 rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div
        className={cn(
          "flex w-16 shrink-0 flex-col items-center justify-center rounded-md py-2 text-center",
          inactive ? "bg-muted text-muted-foreground" : "bg-pst-red text-white",
        )}
      >
        <span className="font-display text-3xl font-extrabold leading-none">{day}</span>
        <span className="text-xs font-bold uppercase tracking-wide">{month}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(`eventType.${event.type}`)}</Badge>
          {event.status !== "SCHEDULED" && (
            <Badge variant={event.status === "CANCELLED" ? "danger" : event.status === "POSTPONED" ? "warning" : event.status === "ONGOING" ? "success" : "muted"}>
              {t(`eventStatus.${event.status}`)}
            </Badge>
          )}
        </div>
        <h3 className={cn("font-display font-bold leading-tight", compact ? "text-lg" : "text-xl", inactive && "line-through decoration-1")}>
          <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 hover:text-pst-red focus-visible:outline-none">
            {event.title}
          </Link>
        </h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            <time dateTime={start.toISOString()}>{formatTime(start, locale)}</time>
          </span>
          {(event.venue || event.municipality) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {[event.venue, event.suco, event.municipality?.name].filter(Boolean).join(", ")}
            </span>
          )}
        </p>
        {!compact && event.summary && <p className="line-clamp-2 text-sm text-muted-foreground">{event.summary}</p>}
      </div>
    </article>
  );
}

export async function DocumentCard({ doc, locale }: { doc: DocumentCardData; locale: string }) {
  const t = await getTranslations("public.documents");
  const te = await getTranslations("common.enums.documentType");
  const tl = await getTranslations("common.langName");
  const hasFile = doc.languages.length > 0;
  return (
    <article className="flex h-full flex-col gap-3 rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-pst-red-50 text-pst-red">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="muted">{te(doc.type)}</Badge>
            {doc.versionLabel && <span className="text-xs text-muted-foreground">{t("version", { version: doc.versionLabel })}</span>}
          </div>
          <h3 className="font-display text-xl font-bold leading-tight">{doc.title ?? doc.slug}</h3>
        </div>
      </div>
      {doc.description && <p className="line-clamp-3 text-sm text-muted-foreground">{doc.description}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          {doc.publishedAt && <time dateTime={new Date(doc.publishedAt).toISOString()}>{formatDate(doc.publishedAt, locale)}</time>}
          {doc.sizeBytes ? <> · {formatBytes(doc.sizeBytes)}</> : null}
          {doc.languages.length > 0 && (
            <>
              {" · "}
              <span className="sr-only">{t("languages")}: </span>
              {doc.languages.map((l) => tl(l)).join(", ")}
            </>
          )}
        </p>
        {hasFile && (
          <a href={doc.downloadUrl} className={buttonVariants({ size: "sm" })} rel="nofollow">
            <Download aria-hidden />
            {t("download")}
          </a>
        )}
      </div>
    </article>
  );
}
