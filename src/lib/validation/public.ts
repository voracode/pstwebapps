import { z } from "zod";
import { paginationSchema } from "@/lib/http";
import { localeSchema } from "./common";

/** Query params shared by all public list endpoints. */
export const publicListSchema = paginationSchema.extend({
  locale: localeSchema.default("tet"),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export const PUBLIC_CACHE = "public, max-age=60, s-maxage=120, stale-while-revalidate=600";
