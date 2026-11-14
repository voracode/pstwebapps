import { icons, Star, type LucideProps } from "lucide-react";

/** Server-only lookup of a Lucide icon by its kebab-case name ("graduation-cap"). */
export function LucideByName({ name, ...props }: { name?: string } & Omit<LucideProps, "name">) {
  const key = (name ?? "")
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("") as keyof typeof icons;
  const Icon = (key && icons[key]) || Star;
  return <Icon aria-hidden {...props} />;
}
