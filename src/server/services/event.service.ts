import type { z } from "zod";
import { db } from "@/lib/db";
import { audit, type AuditActor } from "@/lib/audit";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http";
import type { RequestContext } from "@/lib/request";
import { randomToken } from "@/lib/security/crypto";
import { inScope, isMunicipalScoped, scopeFilter } from "@/lib/security/rbac";
import type { AuthSession } from "@/lib/security/session";
import { pickTranslation } from "@/lib/i18n/pick";
import { sanitizeRichText } from "@/lib/sanitize";
import { urlFor } from "@/lib/storage";
import { slugify } from "@/lib/utils/slug";
import { normalizePhone, type AppLocale } from "@/lib/validation/common";
import type { attendanceSchema, eventCreateSchema, eventUpdateSchema } from "@/lib/validation/content";
import { Prisma, type EventStatus, type EventType } from "@/generated/prisma/client";

const actorOf = (a: AuthSession): AuditActor => ({ id: a.user.id, email: a.user.email, role: a.user.role });

type EventCreate = z.infer<typeof eventCreateSchema>;
type EventUpdate = z.infer<typeof eventUpdateSchema>;
type AttendanceInput = z.infer<typeof attendanceSchema>;

const eventInclude = {
  translations: true,
  municipality: { select: { id: true, name: true, slug: true } },
  suco: { select: { id: true, name: true } },
  cover: { select: { storageKey: true, blurDataUrl: true } },
  _count: { select: { attendances: true } },
} satisfies Prisma.EventInclude;
type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

const eventDto = (e: EventRow) => ({
  ...e,
  latitude: e.latitude ? Number(e.latitude) : null,
  longitude: e.longitude ? Number(e.longitude) : null,
  coverUrl: e.cover?.storageKey ? urlFor(e.cover.storageKey) : null,
  attendanceCount: e._count.attendances,
});

function sanitizeTranslations<T extends { contentHtml?: string }>(ts: T[]): T[] {
  return ts.map((t) => ({ ...t, contentHtml: t.contentHtml ? sanitizeRichText(t.contentHtml) : undefined }));
}

async function uniqueEventSlug(base: string, excludeId?: string) {
  const root = slugify(base, 140) || "event";
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    if (!(await db.event.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } }))) return slug;
  }
  throw conflict("Could not generate a unique slug");
}

async function assertSuco(municipalityId: number | null | undefined, sucoId: number | null | undefined) {
  if (!sucoId) return;
  const s = await db.suco.findUnique({ where: { id: sucoId }, include: { adminPost: { select: { municipalityId: true } } } });
  if (!s || s.adminPost.municipalityId !== municipalityId) throw badRequest("Suco does not belong to the município");
}

async function findScopedEvent(auth: AuthSession, id: string) {
  const e = await db.event.findFirst({ where: { id, deletedAt: null, ...scopeFilter(auth.user) }, include: eventInclude });
  if (!e) throw notFound("Event");
  return e;
}

// -----------------------------------------------------------------------------
// Backoffice
// -----------------------------------------------------------------------------
export async function listEventsAdmin(
  auth: AuthSession,
  f: { from?: Date; to?: Date; type?: EventType; status?: EventStatus; municipalityId?: number },
  skip: number,
  take: number,
) {
  const where: Prisma.EventWhereInput = {
    deletedAt: null,
    type: f.type,
    status: f.status,
    municipalityId: f.municipalityId,
    ...scopeFilter(auth.user),
    ...(f.from || f.to ? { startsAt: { gte: f.from, lte: f.to } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.event.findMany({ where, include: eventInclude, orderBy: { startsAt: "desc" }, skip, take }),
    db.event.count({ where }),
  ]);
  return { items: rows.map(eventDto), total };
}

export async function getEventAdmin(auth: AuthSession, id: string) {
  return eventDto(await findScopedEvent(auth, id));
}

export async function createEvent(auth: AuthSession, input: EventCreate, ctx: RequestContext) {
  if (isMunicipalScoped(auth.user) && input.municipalityId !== auth.user.municipalityId) {
    throw forbidden("Coordinators can only create events in their own município");
  }
  await assertSuco(input.municipalityId, input.sucoId);
  const { translations, slug, ...data } = input;
  const e = await db.event.create({
    data: {
      ...data,
      slug: await uniqueEventSlug(slug ?? translations[0]!.title),
      checkinToken: randomToken(24),
      createdById: auth.user.id,
      translations: { create: sanitizeTranslations(translations) },
    },
    include: eventInclude,
  });
  await audit({ action: "event.created", actor: actorOf(auth), entityType: "Event", entityId: e.id, metadata: { type: e.type, startsAt: e.startsAt }, ctx });
  return eventDto(e);
}

export async function updateEvent(auth: AuthSession, id: string, input: EventUpdate, ctx: RequestContext) {
  const existing = await findScopedEvent(auth, id);
  const { translations, removeLocales, ...data } = input;
  const munId = data.municipalityId !== undefined ? data.municipalityId : existing.municipalityId;
  if (!inScope(auth.user, munId)) throw forbidden("Município outside your scope");
  await assertSuco(munId, data.sucoId !== undefined ? data.sucoId : existing.sucoId);
  const startsAt = data.startsAt ?? existing.startsAt;
  const endsAt = data.endsAt !== undefined ? data.endsAt : existing.endsAt;
  if (endsAt && endsAt < startsAt) throw badRequest("endsAt must be after startsAt");

  await db.$transaction(async (tx) => {
    if (removeLocales?.length) await tx.eventTranslation.deleteMany({ where: { eventId: id, locale: { in: removeLocales } } });
    for (const t of sanitizeTranslations(translations ?? [])) {
      await tx.eventTranslation.upsert({ where: { eventId_locale: { eventId: id, locale: t.locale } }, create: { ...t, eventId: id }, update: t });
    }
    await tx.event.update({ where: { id }, data });
  });
  await audit({
    action: data.status && data.status !== existing.status ? `event.${data.status.toLowerCase()}` : "event.updated",
    actor: actorOf(auth),
    entityType: "Event",
    entityId: id,
    metadata: { fields: Object.keys(input) },
    ctx,
  });
  return getEventAdmin(auth, id);
}

export async function deleteEvent(auth: AuthSession, id: string, ctx: RequestContext) {
  await findScopedEvent(auth, id);
  await db.event.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "event.deleted", severity: "WARNING", actor: actorOf(auth), entityType: "Event", entityId: id, ctx });
}

// -----------------------------------------------------------------------------
// Attendance / mobilisation tracking
// -----------------------------------------------------------------------------
export async function recordAttendance(auth: AuthSession, eventId: string, input: AttendanceInput, ctx: RequestContext) {
  const event = await findScopedEvent(auth, eventId);
  if (event.status === "CANCELLED" || event.status === "DRAFT") throw badRequest("Event is not open for check-in");

  let member: { id: string; fullName: string; memberNumber: string | null; status: string } | null = null;
  if (input.qrToken || input.memberNumber) {
    member = await db.member.findFirst({
      where: { deletedAt: null, ...(input.qrToken ? { qrToken: input.qrToken } : { memberNumber: input.memberNumber }) },
      select: { id: true, fullName: true, memberNumber: true, status: true },
    });
    if (!member) throw notFound("Member");
  }

  try {
    const row = await db.eventAttendance.create({
      data: {
        eventId,
        memberId: member?.id,
        guestName: member ? undefined : input.guestName,
        guestPhone: member || !input.guestPhone ? undefined : (normalizePhone(input.guestPhone) ?? input.guestPhone),
        guestGender: member ? undefined : input.guestGender,
        method: input.qrToken ? "QR_SCAN" : "MANUAL",
        recordedById: auth.user.id,
      },
    });
    await audit({ action: "event.attendance", actor: actorOf(auth), entityType: "Event", entityId: eventId, metadata: { memberId: member?.id, method: row.method }, ctx });
    return {
      id: row.id,
      checkedInAt: row.checkedInAt,
      member,
      // Warn the steward at the door, but still record presence.
      warning: member && member.status !== "VERIFIED" ? `Member status is ${member.status}` : undefined,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("Already checked in", { member });
    }
    throw err;
  }
}

export async function listAttendance(auth: AuthSession, eventId: string, skip: number, take: number) {
  await findScopedEvent(auth, eventId);
  const where = { eventId };
  const [rows, total, byGender] = await Promise.all([
    db.eventAttendance.findMany({
      where,
      orderBy: { checkedInAt: "desc" },
      skip,
      take,
      include: { member: { select: { id: true, fullName: true, memberNumber: true, gender: true } }, recordedBy: { select: { name: true } } },
    }),
    db.eventAttendance.count({ where }),
    db.$queryRaw<{ gender: string | null; n: bigint }[]>`
      SELECT COALESCE(m.gender::text, a.guest_gender::text) AS gender, COUNT(*) AS n
      FROM event_attendances a LEFT JOIN members m ON m.id = a.member_id
      WHERE a.event_id = ${eventId}
      GROUP BY 1`,
  ]);
  return {
    items: rows,
    total,
    summary: {
      members: await db.eventAttendance.count({ where: { eventId, memberId: { not: null } } }),
      guests: await db.eventAttendance.count({ where: { eventId, memberId: null } }),
      byGender: Object.fromEntries(byGender.map((g) => [g.gender ?? "UNKNOWN", Number(g.n)])),
    },
  };
}

// -----------------------------------------------------------------------------
// Public agenda
// -----------------------------------------------------------------------------
const PUBLIC_STATUSES: EventStatus[] = ["SCHEDULED", "ONGOING", "COMPLETED", "POSTPONED", "CANCELLED"];

function publicEvent(e: EventRow, locale: AppLocale, withBody = false) {
  const t = pickTranslation(e.translations, locale);
  return {
    slug: e.slug,
    type: e.type,
    status: e.status,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    timezone: e.timezone,
    title: t?.title ?? "",
    summary: t?.summary ?? null,
    ...(withBody ? { contentHtml: t?.contentHtml ?? null } : {}),
    isFallback: t?.isFallback ?? false,
    municipality: e.municipality,
    suco: e.suco?.name ?? null,
    venue: e.venue,
    latitude: e.latitude ? Number(e.latitude) : null,
    longitude: e.longitude ? Number(e.longitude) : null,
    coverUrl: e.cover?.storageKey ? urlFor(e.cover.storageKey) : null,
    blurDataUrl: e.cover?.blurDataUrl ?? null,
  };
}

export async function listEventsPublic(locale: AppLocale, f: { from?: Date; to?: Date; type?: EventType; municipality?: string }, skip: number, take: number) {
  const where: Prisma.EventWhereInput = {
    deletedAt: null,
    isPublic: true,
    status: { in: PUBLIC_STATUSES },
    type: f.type,
    ...(f.municipality ? { municipality: { slug: f.municipality } } : {}),
    startsAt: { gte: f.from ?? new Date(Date.now() - 6 * 3_600_000), lte: f.to },
  };
  const [rows, total] = await Promise.all([
    db.event.findMany({ where, include: eventInclude, orderBy: { startsAt: "asc" }, skip, take }),
    db.event.count({ where }),
  ]);
  return { items: rows.map((e) => publicEvent(e, locale)), total };
}

export async function getEventPublic(locale: AppLocale, slug: string) {
  const e = await db.event.findFirst({ where: { slug, deletedAt: null, isPublic: true, status: { in: PUBLIC_STATUSES } }, include: eventInclude });
  if (!e) throw notFound("Event");
  return publicEvent(e, locale, true);
}
