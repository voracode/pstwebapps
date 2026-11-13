import { db } from "@/lib/db";
import { adminRoute, ok } from "@/lib/http";

export const GET = adminRoute({ permission: "post:read" }, async () =>
  ok(await db.category.findMany({ orderBy: { sortOrder: "asc" }, include: { translations: true } })),
);
