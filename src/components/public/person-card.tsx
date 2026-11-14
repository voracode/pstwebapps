import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/primitives";
import { MediaImage } from "@/components/public/media-image";
import { cn } from "@/lib/utils/cn";

export interface PersonData {
  id: string;
  fullName: string;
  positionTitle: string;
  bio: string | null;
  photoUrl: string | null;
  blurDataUrl: string | null;
  isCoordinator?: boolean;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export async function PersonCard({ person, featured }: { person: PersonData; featured?: boolean }) {
  const t = await getTranslations("public.leadership");
  return (
    <article className={cn("flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-sm", featured && "sm:flex-row")}>
      <div className={cn("relative aspect-[4/5] w-full shrink-0 overflow-hidden bg-muted", featured && "sm:w-56")}>
        {person.photoUrl ? (
          <MediaImage src={person.photoUrl} alt={person.fullName} blurDataUrl={person.blurDataUrl} className="size-full object-top" />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-pst-red-800 to-pst-ink" aria-hidden>
            <span className="font-display text-5xl font-extrabold text-white/90">{initials(person.fullName)}</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {person.positionTitle && <p className="text-xs font-bold uppercase tracking-wider text-pst-red">{person.positionTitle}</p>}
        <h3 className={cn("font-display font-bold leading-tight", featured ? "text-2xl" : "text-xl")}>{person.fullName}</h3>
        {person.isCoordinator && (
          <Badge variant="gold" className="w-fit">
            {t("coordinator")}
          </Badge>
        )}
        {person.bio &&
          (featured ? (
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{person.bio}</p>
          ) : (
            <details className="group mt-1 text-sm">
              <summary className="cursor-pointer font-semibold text-pst-red marker:text-pst-red">{t("bio")}</summary>
              <p className="mt-2 whitespace-pre-line text-muted-foreground">{person.bio}</p>
            </details>
          ))}
      </div>
    </article>
  );
}
