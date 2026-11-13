import { db } from "@/lib/db";
import { badRequest } from "@/lib/http";

export interface ResolvedLocation {
  municipality: { id: number; name: string; code: string };
  adminPost: { id: number; name: string } | null;
  suco: { id: number; name: string } | null;
  aldeia: { id: number; name: string } | null;
}

/**
 * Validates that the chosen Município → Posto → Suco → Aldeia form a
 * consistent chain (a suco must belong to the chosen posto, etc.).
 * Lower levels are optional, but a lower level implies its parent.
 */
export async function resolveLocation(ids: {
  municipalityId: number;
  adminPostId?: number | null;
  sucoId?: number | null;
  aldeiaId?: number | null;
}): Promise<ResolvedLocation> {
  const municipality = await db.municipality.findUnique({
    where: { id: ids.municipalityId },
    select: { id: true, name: true, code: true },
  });
  if (!municipality) throw badRequest("Unknown município", { field: "municipalityId" });

  if ((ids.sucoId || ids.aldeiaId) && !ids.adminPostId) {
    throw badRequest("Select the posto administrativo first", { field: "adminPostId" });
  }
  if (ids.aldeiaId && !ids.sucoId) throw badRequest("Select the suco first", { field: "sucoId" });

  let adminPost: ResolvedLocation["adminPost"] = null;
  if (ids.adminPostId) {
    const p = await db.adminPost.findUnique({ where: { id: ids.adminPostId } });
    if (!p || p.municipalityId !== municipality.id) {
      throw badRequest("Posto administrativo does not belong to the município", { field: "adminPostId" });
    }
    adminPost = { id: p.id, name: p.name };
  }

  let suco: ResolvedLocation["suco"] = null;
  if (ids.sucoId) {
    const s = await db.suco.findUnique({ where: { id: ids.sucoId } });
    if (!s || s.adminPostId !== adminPost?.id) {
      throw badRequest("Suco does not belong to the posto administrativo", { field: "sucoId" });
    }
    suco = { id: s.id, name: s.name };
  }

  let aldeia: ResolvedLocation["aldeia"] = null;
  if (ids.aldeiaId) {
    const a = await db.aldeia.findUnique({ where: { id: ids.aldeiaId } });
    if (!a || a.sucoId !== suco?.id) throw badRequest("Aldeia does not belong to the suco", { field: "aldeiaId" });
    aldeia = { id: a.id, name: a.name };
  }

  return { municipality, adminPost, suco, aldeia };
}

export type GeoLevel = "municipality" | "adminPost" | "suco" | "aldeia";

/** Lists one level of the hierarchy for cascading dropdowns. */
export async function listGeo(level: GeoLevel, parentId?: number) {
  switch (level) {
    case "municipality":
      return db.municipality.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, code: true, name: true, slug: true, capital: true, isSpecialRegion: true, latitude: true, longitude: true },
      });
    case "adminPost":
      if (!parentId) throw badRequest("parentId (municipalityId) is required");
      return db.adminPost.findMany({ where: { municipalityId: parentId }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } });
    case "suco":
      if (!parentId) throw badRequest("parentId (adminPostId) is required");
      return db.suco.findMany({ where: { adminPostId: parentId }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } });
    case "aldeia":
      if (!parentId) throw badRequest("parentId (sucoId) is required");
      return db.aldeia.findMany({ where: { sucoId: parentId }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } });
  }
}
