/** Only same-site relative paths are allowed as post-login destinations (no open redirect). */
export function safeNext(next: string | undefined | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/admin";
  // Strip a leading locale — the locale-aware router re-adds the current one.
  return next.replace(/^\/(tet|pt|id|en)(?=\/|$)/, "") || "/admin";
}
