import { db } from "@/lib/db";
import { env } from "@/env";
import { audit, type AuditActor } from "@/lib/audit";
import { alertAdmins, sendEmail } from "@/lib/notify";
import { ApiError, badRequest, forbidden, notFound } from "@/lib/http";
import type { RequestContext } from "@/lib/request";
import { blindIndex, randomCode, sha256Hex, safeEqual } from "@/lib/security/crypto";
import { inScope, scopeFilter } from "@/lib/security/rbac";
import type { AuthSession } from "@/lib/security/session";
import { getSetting } from "@/lib/settings";
import { signedUrl } from "@/lib/storage";
import { storeUpload } from "@/lib/storage/upload";
import type {
  ASPIRATION_CATEGORIES,
  SUBMITTER_TYPES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "@/lib/validation/content";
import type { Locale, Prisma } from "@/generated/prisma/client";

const actorOf = (a: AuthSession): AuditActor => ({ id: a.user.id, email: a.user.email, role: a.user.role });

type Category = (typeof ASPIRATION_CATEGORIES)[number];
type Submitter = (typeof SUBMITTER_TYPES)[number];
type TicketStatus = (typeof TICKET_STATUSES)[number];
type Priority = (typeof TICKET_PRIORITIES)[number];

export interface AspirationSubmission {
  category: Category;
  submitterType: Submitter;
  isAnonymous: boolean;
  name?: string;
  phone?: string;
  email?: string;
  municipalityId?: number;
  sucoId?: number;
  subject: string;
  message: string;
  locale: Locale;
}

const MAX_ATTACHMENTS = 3;

/**
 * Ticket numbers are random (ASP-2026-7K3M9Q), not sequential: they appear
 * in public URLs and must not reveal volumes or allow enumeration.
 * The tracking code (12 chars) is shown once and stored only as a hash.
 */
export async function submitAspiration(input: AspirationSubmission, files: File[], ctx: RequestContext) {
  if (files.length > MAX_ATTACHMENTS) throw badRequest(`At most ${MAX_ATTACHMENTS} attachments`);
  if (input.sucoId) {
    const s = await db.suco.findUnique({ where: { id: input.sucoId }, include: { adminPost: { select: { municipalityId: true } } } });
    if (!s || s.adminPost.municipalityId !== input.municipalityId) throw badRequest("Suco does not belong to the município");
  }
  if (!input.isAnonymous && !input.name) throw badRequest("Name is required unless submitting anonymously", { field: "name" });

  const year = new Date().getUTCFullYear();
  const trackingCode = `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`;

  const media = [];
  for (const f of files) {
    const up = await storeUpload(f, { accept: ["IMAGE", "DOCUMENT"], visibility: "PRIVATE", folder: "aspirations", maxImageEdge: 1600, imageFormat: "jpeg", maxMb: 8 });
    media.push(await db.mediaAsset.create({ data: { ...up, kind: up.kind === "IMAGE" ? "IMAGE" : "DOCUMENT", visibility: "PRIVATE" }, select: { id: true } }));
  }

  let ticket;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      ticket = await db.aspiration.create({
        data: {
          ticketNumber: `ASP-${year}-${randomCode(6)}`,
          trackingCodeHash: sha256Hex(trackingCode),
          category: input.category,
          submitterType: input.submitterType,
          isAnonymous: input.isAnonymous,
          // Anonymous tickets keep no identity at all.
          name: input.isAnonymous ? null : input.name,
          phone: input.isAnonymous ? null : input.phone,
          email: input.isAnonymous ? null : input.email,
          municipalityId: input.municipalityId,
          sucoId: input.sucoId,
          subject: input.subject,
          message: input.message,
          locale: input.locale,
          ipHash: ctx.ip ? blindIndex("ip", ctx.ip) : null,
          status: (await getSetting<boolean>("aspiration.autoAcknowledge", true)) ? "ACKNOWLEDGED" : "NEW",
          acknowledgedAt: (await getSetting<boolean>("aspiration.autoAcknowledge", true)) ? new Date() : null,
          attachments: { create: media.map((m) => ({ mediaId: m.id })) },
        },
        include: { municipality: { select: { name: true } } },
      });
      break;
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002" || attempt === 4) throw err;
    }
  }
  if (!ticket) throw new Error("Could not allocate ticket number");

  await audit({ action: "aspiration.submitted", entityType: "Aspiration", entityId: ticket.id, metadata: { ticketNumber: ticket.ticketNumber, category: ticket.category }, ctx });
  await alertAdmins(
    "aspirations",
    "aspiration.submitted",
    {
      ticketNumber: ticket.ticketNumber,
      category: ticket.category,
      municipality: ticket.municipality?.name,
      subject: ticket.subject,
      isAnonymous: ticket.isAnonymous,
      name: ticket.name,
      priority: ticket.priority,
      adminUrl: `${env().APP_URL}/tet/admin/aspirations/${ticket.id}`,
    },
    { alsoEmailInbox: true },
  );
  if (ticket.email) await sendEmail(ticket.email, "aspiration.submitted", { ticketNumber: ticket.ticketNumber });

  return { ticketNumber: ticket.ticketNumber, trackingCode, status: ticket.status };
}

export async function trackAspiration(ticketNumber: string, trackingCode: string) {
  const t = await db.aspiration.findUnique({
    where: { ticketNumber },
    include: { notes: { where: { isPublic: true }, orderBy: { createdAt: "asc" }, select: { body: true, createdAt: true } } },
  });
  // Constant response for unknown ticket / wrong code.
  if (!t || !safeEqual(t.trackingCodeHash, sha256Hex(trackingCode.toUpperCase().trim()))) {
    throw new ApiError(404, "NOT_FOUND", "No ticket matches this number and tracking code");
  }
  return {
    ticketNumber: t.ticketNumber,
    status: t.status === "SPAM" ? "CLOSED" : t.status,
    category: t.category,
    subject: t.subject,
    submittedAt: t.createdAt,
    acknowledgedAt: t.acknowledgedAt,
    resolvedAt: t.resolvedAt,
    replies: t.notes,
  };
}

// -----------------------------------------------------------------------------
// Backoffice
// -----------------------------------------------------------------------------
const adminInclude = {
  municipality: { select: { id: true, name: true } },
  suco: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  attachments: { include: { media: { select: { id: true, storageKey: true, mimeType: true, originalName: true, sizeBytes: true } } } },
  _count: { select: { notes: true } },
} satisfies Prisma.AspirationInclude;

type Row = Prisma.AspirationGetPayload<{ include: typeof adminInclude }>;
const dto = ({ trackingCodeHash: _h, ipHash: _ip, attachments, ...t }: Row) => ({
  ...t,
  attachments: attachments.map((a) => ({ ...a.media, url: a.media.storageKey ? signedUrl(a.media.storageKey) : null })),
});

export async function listAspirations(
  auth: AuthSession,
  f: { status?: TicketStatus; category?: Category; priority?: Priority; municipalityId?: number; assignedToMe?: boolean; q?: string },
  skip: number,
  take: number,
) {
  const where: Prisma.AspirationWhereInput = {
    status: f.status,
    category: f.category,
    priority: f.priority,
    municipalityId: f.municipalityId,
    ...scopeFilter(auth.user),
    ...(f.assignedToMe ? { assignedToId: auth.user.id } : {}),
    ...(f.q
      ? { OR: [{ ticketNumber: { equals: f.q.toUpperCase() } }, { subject: { contains: f.q, mode: "insensitive" } }, { message: { contains: f.q, mode: "insensitive" } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.aspiration.findMany({ where, include: adminInclude, orderBy: [{ priority: "desc" }, { createdAt: "desc" }], skip, take }),
    db.aspiration.count({ where }),
  ]);
  return { items: rows.map(dto), total };
}

async function findScoped(auth: AuthSession, id: string) {
  const t = await db.aspiration.findFirst({ where: { id, ...scopeFilter(auth.user) }, include: adminInclude });
  if (!t) throw notFound("Aspiration");
  return t;
}

export async function getAspiration(auth: AuthSession, id: string) {
  const t = await findScoped(auth, id);
  const notes = await db.aspirationNote.findMany({
    where: { aspirationId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true } } },
  });
  return { ...dto(t), notes };
}

export async function updateAspiration(
  auth: AuthSession,
  id: string,
  input: { status?: TicketStatus; priority?: Priority; assignedToId?: string | null; municipalityId?: number | null },
  ctx: RequestContext,
) {
  const t = await findScoped(auth, id);
  if (input.municipalityId !== undefined && !inScope(auth.user, input.municipalityId)) throw forbidden("Município outside your scope");
  if (input.assignedToId) {
    const u = await db.user.findFirst({ where: { id: input.assignedToId, status: "ACTIVE", deletedAt: null } });
    if (!u) throw badRequest("Assignee not found");
  }
  const now = new Date();
  const updated = await db.aspiration.update({
    where: { id },
    data: {
      status: input.status,
      priority: input.priority,
      assignedToId: input.assignedToId,
      municipalityId: input.municipalityId,
      ...(input.status && input.status !== "NEW" && !t.acknowledgedAt ? { acknowledgedAt: now } : {}),
      ...(input.status === "RESOLVED" || input.status === "CLOSED" ? { resolvedAt: t.resolvedAt ?? now } : {}),
    },
    include: adminInclude,
  });
  await audit({ action: "aspiration.updated", actor: actorOf(auth), entityType: "Aspiration", entityId: id, metadata: input, ctx });
  if (input.status && input.status !== t.status && updated.email && input.status !== "SPAM") {
    await sendEmail(updated.email, "aspiration.updated", { ticketNumber: updated.ticketNumber, status: input.status });
  }
  return dto(updated);
}

export async function addAspirationNote(auth: AuthSession, id: string, body: string, isPublic: boolean, ctx: RequestContext) {
  const t = await findScoped(auth, id);
  const note = await db.aspirationNote.create({
    data: { aspirationId: id, authorId: auth.user.id, body, isPublic },
    include: { author: { select: { id: true, name: true } } },
  });
  if (isPublic && t.status === "NEW") {
    await db.aspiration.update({ where: { id }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() } });
  }
  await audit({ action: isPublic ? "aspiration.replied" : "aspiration.note_added", actor: actorOf(auth), entityType: "Aspiration", entityId: id, ctx });
  if (isPublic && t.email) {
    await sendEmail(t.email, "aspiration.updated", { ticketNumber: t.ticketNumber, status: t.status, message: body });
  }
  return note;
}

// -----------------------------------------------------------------------------
// Contact inquiries
// -----------------------------------------------------------------------------
export async function submitContact(
  input: { name: string; email?: string; phone?: string; subject?: string; message: string; locale: Locale },
  ctx: RequestContext,
) {
  const msg = await db.contactMessage.create({
    data: { ...input, ipHash: ctx.ip ? blindIndex("ip", ctx.ip) : null },
    select: { id: true },
  });
  await alertAdmins("contact", "contact.received", input, { alsoEmailInbox: true });
  return msg;
}

export async function listContactMessages(f: { unread?: boolean; spam?: boolean }, skip: number, take: number) {
  const where: Prisma.ContactMessageWhereInput = {
    isSpam: f.spam ?? false,
    ...(f.unread ? { readAt: null } : {}),
  };
  const [items, total] = await Promise.all([
    db.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, omit: { ipHash: true }, include: { readBy: { select: { name: true } } } }),
    db.contactMessage.count({ where }),
  ]);
  return { items, total };
}

export async function markContactMessage(auth: AuthSession, id: string, input: { read?: boolean; spam?: boolean }, ctx: RequestContext) {
  const msg = await db.contactMessage.update({
    where: { id },
    data: {
      ...(input.read === true ? { readAt: new Date(), readById: auth.user.id } : input.read === false ? { readAt: null, readById: null } : {}),
      isSpam: input.spam,
    },
    omit: { ipHash: true },
  });
  await audit({ action: "contact.updated", actor: actorOf(auth), entityType: "ContactMessage", entityId: id, metadata: input, ctx });
  return msg;
}
