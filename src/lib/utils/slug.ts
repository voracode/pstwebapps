/** URL-safe ASCII slug: "Oé-Cusse Ambeno" → "oe-cusse-ambeno". */
export function slugify(input: string, maxLength = 200): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}
