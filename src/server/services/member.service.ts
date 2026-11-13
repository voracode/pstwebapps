import { db } from "@/lib/db";
import { env } from "@/env";
import { audit, type AuditActor } from "@/lib/audit";
import { alertAdmins, sendEmail } from "@/lib/notify";
import { ApiError, badRequest, conflict, forbidden, notFound } from "@/lib/http";
import type { RequestContext } from "@/lib/request";
import { blindIndex, decrypt, encrypt, normalizeIdNumber, randomCode, randomToken } from "@/lib/security/crypto";
import { inScope, scopeFilter, can } from "@/lib/security/rbac";
import type { AuthSession } from "@/lib/security/session";
import { getSetting } from "@/lib/settings";
import { signedUrl } from "@/lib/storage";
import { storeUpload } from "@/lib/storage/upload";
import { nextMemberNumber } from "@/lib/kta/number";
import { normalizePhone } from "@/lib/validation/common";
import type {
  AdminCreateMemberInput,
  MemberListFilter,
  PublicRegistrationInput,
  UpdateMemberInput,
} from "@/lib/validation/member";
import { Prisma, type MemberStatus, type RegistrationChannel } from "@/generated/prisma/client";
import { resolveLocation } from "./geo.service";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const actorOf = (a: AuthSession): AuditActor => ({ id: a.user.id, email: a.user.email, role: a.user.role });

const ID_AAD = (hash: string) => `member-id:${hash}`;

export function idNumberHash(type: string, idNumber: string): string {
  return blindIndex("member-id", `${type}:${normalizeIdNumber(idNumber)}`);
}

function encryptIdNumber(type: string, idNumber: string) {
  const normalized = normalizeIdNumber(idNumber);
  const hash = idNumberHash(type, idNumber);
  return { idNumberEnc: encrypt(normalized, ID_AAD(hash)), idNumberHash: hash, idNumberLast4: normalized.slice(-4) };
}

export function ageOn(birthDate: Date, at = new Date()): number {
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = at.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

async function assertEligibleAge(birthDate: Date) {
  const minAge = await getSetting<number>("membership.minimumAge", 17);
  const age = ageOn(birthDate);
  if (age < minAge) throw badRequest(`Minimum age for membership is ${minAge}`, { field: "birthDate", minAge });
  if (age > 120) throw badRequest("Invalid birth date", { field: "birthDate" });
}

async function newRegistrationRef(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const ref = `REG-${randomCode(8)}`;
    if (!(await db.member.findUnique({ where: { registrationRef: ref }, select: { id: true } }))) return ref;
  }
  throw new Error("Could not allocate a registration reference");
}

const DUPLICATE = () =>
  conflict("A member with this identity document is already registered. Use the status check or contact your municipal secretariat.");

const memberInclude = {
  municipality: { select: { id: true, name: true, code: true } },
  adminPost: { select: { id: true, name: true } },
  suco: { select: { id: true, name: true } },
  aldeia: { select: { id: true, name: true } },
  photo: { select: { storageKey: true } },
  idDocumentScan: { select: { storageKey: true } },
  verifiedBy: { select: { id: true, name: true } },
  cards: { orderBy: { version: "desc" as const }, take: 1, select: { id: true, version: true, issuedAt: true, expiresAt: true, revokedAt: true } },
} satisfies Prisma.MemberInclude;

type MemberWithRelations = Prisma.MemberGetPayload<{ include: typeof memberInclude }>;

const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export function toMemberDto(m: MemberWithRelations, opts: { revealId?: boolean } = {}) {
  let idNumber: string | undefined;
  if (opts.revealId && m.idNumberEnc && m.idNumberHash) {
    try {
      idNumber = decrypt(m.idNumberEnc, ID_AAD(m.idNumberHash));
    } catch {
      idNumber = undefined;
    }
  }
  return {
    id: m.id,
    memberNumber: m.memberNumber,
    registrationRef: m.registrationRef,
    status: m.status,
    rank: m.rank,
    channel: m.channel,
    fullName: m.fullName,
    gender: m.gender,
    birthDate: isoDate(m.birthDate),
    age: ageOn(m.birthDate),
    birthPlace: m.birthPlace,
    idDocumentType: m.idDocumentType,
    idNumberMasked: m.idNumberLast4 ? `••••${m.idNumberLast4}` : null,
    ...(idNumber !== undefined ? { idNumber } : {}),
    occupation: m.occupation,
    educationLevel: m.educationLevel,
    phone: m.phone,
    email: m.email,
    location: { municipality: m.municipality, adminPost: m.adminPost, suco: m.suco, aldeia: m.aldeia },
    addressLine: m.addressLine,
    motivation: m.motivation,
    photoUrl: m.photo?.storageKey ? signedUrl(m.photo.storageKey) : null,
    ...(opts.revealId && m.idDocumentScan?.storageKey ? { idScanUrl: signedUrl(m.idDocumentScan.storageKey) } : {}),
    hasIdScan: !!m.idDocumentScan,
    joinedAt: isoDate(m.joinedAt),
    verifiedAt: m.verifiedAt,
    verifiedBy: m.verifiedBy,
    rejectionReason: m.rejectionReason,
    suspensionReason: m.suspensionReason,
    latestCard: m.cards[0] ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

async function storeMemberFiles(photo: File | null, idScan: File | null, uploadedById: string | null) {
  const out: { photoId?: string; idDocumentScanId?: string } = {};
  if (photo) {
    const up = await storeUpload(photo, { accept: ["IMAGE"], visibility: "PRIVATE", folder: "members/photos", maxImageEdge: 800, imageFormat: "jpeg" });
    const media = await db.mediaAsset.create({ data: { ...up, visibility: "PRIVATE", uploadedById } });
    out.photoId = media.id;
  }
  if (idScan) {
    const up = await storeUpload(idScan, { accept: ["IMAGE", "DOCUMENT"], visibility: "PRIVATE", folder: "members/id-scans", maxImageEdge: 1600, imageFormat: "jpeg", maxMb: 8 });
    const media = await db.mediaAsset.create({ data: { ...up, kind: up.kind === "IMAGE" ? "IMAGE" : "DOCUMENT", visibility: "PRIVATE", uploadedById } });
    out.idDocumentScanId = media.id;
  }
  return out;
}

// -----------------------------------------------------------------------------
// Registration (public E-KTA form and backoffice creation share this path)
// -----------------------------------------------------------------------------
export async function registerMember(
  input: PublicRegistrationInput | AdminCreateMemberInput,
  files: { photo: File | null; idScan: File | null },
  opts: { channel: RegistrationChannel; auth?: AuthSession; ctx: RequestContext },
) {
  const { auth, ctx } = opts;
  if (auth && !inScope(auth.user, input.municipalityId)) throw forbidden("Município outside your scope");

  await assertEligibleAge(input.birthDate);
  const location = await resolveLocation(input);

  const idFields = input.idNumber ? encryptIdNumber(input.idDocumentType, input.idNumber) : null;
  if (idFields && (await db.member.findUnique({ where: { idNumberHash: idFields.idNumberHash }, select: { id: true } }))) {
    throw DUPLICATE();
  }

  if (opts.channel === "ONLINE") {
    if (!files.photo) throw badRequest("A photo is required", { field: "photo" });
    const requireScan = await getSetting<boolean>("membership.requireIdScan", true);
    if (requireScan && !files.idScan) throw badRequest("A scan of your identity document is required", { field: "idScan" });
  }

  const media = await storeMemberFiles(files.photo, files.idScan, auth?.user.id ?? null);
  const consentVersion = await getSetting<string>("membership.consentVersion", "2026-11");
  const registrationRef = await newRegistrationRef();
  const rank = "rank" in input && input.rank ? input.rank : "MILITANT";
  const joinedAt = "joinedAt" in input ? input.joinedAt : undefined;

  let member;
  try {
    member = await db.member.create({
      data: {
        registrationRef,
        qrToken: randomToken(32),
        status: "PENDING",
        rank,
        channel: opts.channel,
        fullName: input.fullName,
        gender: input.gender,
        birthDate: input.birthDate,
        birthPlace: input.birthPlace,
        idDocumentType: input.idDocumentType,
        ...(idFields ?? {}),
        occupation: input.occupation,
        educationLevel: input.educationLevel,
        phone: input.phone,
        email: input.email,
        municipalityId: location.municipality.id,
        adminPostId: location.adminPost?.id,
        sucoId: location.suco?.id,
        aldeiaId: location.aldeia?.id,
        addressLine: input.addressLine,
        motivation: input.motivation,
        consentVersion,
        consentAt: new Date(),
        submittedIp: opts.channel === "ONLINE" ? ctx.ip : null,
        joinedAt,
        createdById: auth?.user.id,
        ...media,
        statusChanges: { create: { toStatus: "PENDING", changedById: auth?.user.id, reason: `Registered via ${opts.channel}` } },
      },
      include: memberInclude,
    });
  } catch (err) {
    // Lost the race against a concurrent submission with the same ID number.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw DUPLICATE();
    throw err;
  }

  await audit({
    action: "member.registered",
    actor: auth ? actorOf(auth) : null,
    entityType: "Member",
    entityId: member.id,
    metadata: { channel: opts.channel, municipality: location.municipality.code, registrationRef },
    ctx,
  });

  const alert = {
    fullName: member.fullName,
    municipality: location.municipality.name,
    adminPost: location.adminPost?.name,
    suco: location.suco?.name,
    registrationRef,
    channel: opts.channel,
    adminUrl: `${env().APP_URL}/tet/admin/members/${member.id}`,
  };
  await alertAdmins("registrations", "member.registered", alert);
  if (member.email) {
    await sendEmail(member.email, "member.registered", {
      fullName: member.fullName,
      registrationRef,
      statusUrl: `${env().APP_URL}/tet/membership-status?ref=${registrationRef}`,
    });
  }
  return member;
}

// -----------------------------------------------------------------------------
// Public status check
// -----------------------------------------------------------------------------
export async function checkMembershipStatus(registrationRef: string, birthDate: Date) {
  const m = await db.member.findFirst({
    where: { registrationRef, deletedAt: null },
    select: {
      status: true,
      memberNumber: true,
      fullName: true,
      birthDate: true,
      createdAt: true,
      verifiedAt: true,
      municipality: { select: { name: true } },
    },
  });
  // Same response for "no such ref" and "wrong birth date" to prevent probing.
  if (!m || m.birthDate.getTime() !== birthDate.getTime()) {
    throw new ApiError(404, "NOT_FOUND", "No registration matches this reference and birth date");
  }
  return {
    status: m.status,
    memberNumber: m.status === "VERIFIED" ? m.memberNumber : null,
    fullName: m.fullName,
    municipality: m.municipality.name,
    submittedAt: m.createdAt,
    verifiedAt: m.verifiedAt,
  };
}

// -----------------------------------------------------------------------------
// Backoffice queries
// -----------------------------------------------------------------------------
function birthDateBoundsForAge(ageMin?: number, ageMax?: number) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const range: { lte?: Date; gt?: Date } = {};
  // age >= ageMin  ⇔ born on/before today minus ageMin years
  if (ageMin !== undefined) range.lte = new Date(Date.UTC(y - ageMin, m, d));
  // age <= ageMax  ⇔ born after today minus (ageMax + 1) years
  if (ageMax !== undefined) range.gt = new Date(Date.UTC(y - ageMax - 1, m, d));
  return range;
}

export function buildMemberWhere(auth: AuthSession, f: Partial<MemberListFilter>): Prisma.MemberWhereInput {
  const scope = scopeFilter(auth.user);
  const where: Prisma.MemberWhereInput = {
    deletedAt: null,
    status: f.status,
    rank: f.rank,
    gender: f.gender,
    channel: f.channel,
    municipalityId: f.municipalityId,
    adminPostId: f.adminPostId,
    sucoId: f.sucoId,
    aldeiaId: f.aldeiaId,
  };
  // Coordinator scope always wins over a requested municipalityId filter.
  if (scope.municipalityId !== undefined) where.municipalityId = scope.municipalityId;

  if (f.ageMin !== undefined || f.ageMax !== undefined) where.birthDate = birthDateBoundsForAge(f.ageMin, f.ageMax);
  if (f.createdFrom || f.createdTo) {
    where.createdAt = {
      gte: f.createdFrom,
      lt: f.createdTo ? new Date(f.createdTo.getTime() + 86_400_000) : undefined,
    };
  }
  if (f.q) {
    const q = f.q.trim();
    const phone = normalizePhone(q);
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { memberNumber: { equals: q.toUpperCase() } },
      { registrationRef: { equals: q.toUpperCase() } },
      ...(phone ? [{ phone }] : []),
      { email: { equals: q.toLowerCase() } },
    ];
  }
  return where;
}

function orderBy(sort: MemberListFilter["sort"]): Prisma.MemberOrderByWithRelationInput {
  const desc = sort.startsWith("-");
  const field = sort.replace(/^-/, "") as "createdAt" | "fullName" | "memberNumber";
  return { [field]: desc ? "desc" : "asc" };
}

export async function listMembers(auth: AuthSession, f: MemberListFilter, skip: number, take: number) {
  const where = buildMemberWhere(auth, f);
  const [rows, total] = await Promise.all([
    db.member.findMany({ where, include: memberInclude, orderBy: orderBy(f.sort), skip, take }),
    db.member.count({ where }),
  ]);
  return { items: rows.map((r) => toMemberDto(r)), total };
}

async function findScoped(auth: AuthSession, id: string) {
  const m = await db.member.findFirst({ where: { id, deletedAt: null, ...scopeFilter(auth.user) }, include: memberInclude });
  if (!m) throw notFound("Member");
  return m;
}

export async function getMember(auth: AuthSession, id: string, opts: { revealId: boolean }, ctx: RequestContext) {
  if (opts.revealId && !can(auth.user.role, "member:reveal_id")) throw forbidden("Not allowed to view identity documents");
  const m = await findScoped(auth, id);
  if (opts.revealId) {
    await audit({ action: "member.id_revealed", severity: "WARNING", actor: actorOf(auth), entityType: "Member", entityId: id, ctx });
  }
  return toMemberDto(m, { revealId: opts.revealId });
}

export async function createMemberByAdmin(
  auth: AuthSession,
  input: AdminCreateMemberInput,
  files: { photo: File | null; idScan: File | null },
  ctx: RequestContext,
) {
  const m = await registerMember(input, files, { channel: "BACKOFFICE", auth, ctx });
  return toMemberDto(m);
}

export async function updateMember(auth: AuthSession, id: string, input: UpdateMemberInput, ctx: RequestContext) {
  const existing = await findScoped(auth, id);

  const locationChanged =
    input.municipalityId !== undefined || input.adminPostId !== undefined || input.sucoId !== undefined || input.aldeiaId !== undefined;
  let location;
  if (locationChanged) {
    const ids = {
      municipalityId: input.municipalityId ?? existing.municipalityId,
      adminPostId: input.adminPostId !== undefined ? input.adminPostId : existing.adminPostId,
      sucoId: input.sucoId !== undefined ? input.sucoId : existing.sucoId,
      aldeiaId: input.aldeiaId !== undefined ? input.aldeiaId : existing.aldeiaId,
    };
    if (!inScope(auth.user, ids.municipalityId)) throw forbidden("Cannot move a member outside your município");
    location = await resolveLocation(ids);
  }

  if (input.birthDate) await assertEligibleAge(input.birthDate);

  let phone: string | null | undefined = input.phone;
  if (typeof phone === "string") {
    phone = normalizePhone(phone);
    if (!phone) throw badRequest("Invalid phone number", { field: "phone" });
  }

  const data: Prisma.MemberUncheckedUpdateInput = {
    fullName: input.fullName,
    gender: input.gender,
    birthDate: input.birthDate,
    birthPlace: input.birthPlace,
    occupation: input.occupation,
    educationLevel: input.educationLevel,
    phone,
    email: input.email,
    addressLine: input.addressLine,
    motivation: input.motivation,
    rank: input.rank,
    joinedAt: input.joinedAt,
    ...(location
      ? {
          municipalityId: location.municipality.id,
          adminPostId: location.adminPost?.id ?? null,
          sucoId: location.suco?.id ?? null,
          aldeiaId: location.aldeia?.id ?? null,
        }
      : {}),
  };

  const docType = input.idDocumentType ?? existing.idDocumentType;
  if (input.idNumber === null) {
    Object.assign(data, { idNumberEnc: null, idNumberHash: null, idNumberLast4: null, idDocumentType: docType });
  } else if (input.idNumber !== undefined || input.idDocumentType !== undefined) {
    const plain = input.idNumber ?? (existing.idNumberEnc && existing.idNumberHash ? decrypt(existing.idNumberEnc, ID_AAD(existing.idNumberHash)) : null);
    if (plain) {
      const enc = encryptIdNumber(docType, plain);
      const clash = await db.member.findFirst({ where: { idNumberHash: enc.idNumberHash, id: { not: id } }, select: { id: true } });
      if (clash) throw DUPLICATE();
      Object.assign(data, enc, { idDocumentType: docType });
    } else {
      data.idDocumentType = docType;
    }
  }

  const updated = await db.member.update({ where: { id }, data, include: memberInclude });
  await audit({
    action: "member.updated",
    actor: actorOf(auth),
    entityType: "Member",
    entityId: id,
    // Field names only — never personal values.
    metadata: { fields: Object.keys(input) },
    ctx,
  });
  return toMemberDto(updated);
}

export async function replaceMemberPhoto(auth: AuthSession, id: string, photo: File, ctx: RequestContext) {
  const existing = await findScoped(auth, id);
  const { photoId } = await storeMemberFiles(photo, null, auth.user.id);
  const updated = await db.member.update({ where: { id }, data: { photoId }, include: memberInclude });
  if (existing.photoId) await db.mediaAsset.update({ where: { id: existing.photoId }, data: { deletedAt: new Date() } });
  await audit({ action: "member.photo_replaced", actor: actorOf(auth), entityType: "Member", entityId: id, ctx });
  return toMemberDto(updated);
}

export async function deleteMember(auth: AuthSession, id: string, ctx: RequestContext) {
  await findScoped(auth, id);
  // Soft delete; the ID-number hash is cleared so the person can re-register later.
  await db.member.update({ where: { id }, data: { deletedAt: new Date(), idNumberHash: null } });
  await db.membershipCard.updateMany({ where: { memberId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ action: "member.deleted", severity: "WARNING", actor: actorOf(auth), entityType: "Member", entityId: id, ctx });
}

// -----------------------------------------------------------------------------
// Approval workflow
// -----------------------------------------------------------------------------
const TRANSITIONS: Record<MemberStatus, MemberStatus[]> = {
  PENDING: ["VERIFIED", "REJECTED"],
  VERIFIED: ["SUSPENDED"],
  SUSPENDED: ["VERIFIED"],
  REJECTED: ["PENDING"],
};

export async function changeMemberStatus(
  auth: AuthSession,
  id: string,
  to: MemberStatus,
  reason: string | undefined,
  ctx: RequestContext,
) {
  const existing = await findScoped(auth, id);
  const from = existing.status;
  if (!TRANSITIONS[from].includes(to)) {
    throw new ApiError(409, "INVALID_TRANSITION", `Cannot change status from ${from} to ${to}`, { allowed: TRANSITIONS[from] });
  }
  if ((to === "REJECTED" || to === "SUSPENDED") && !reason) {
    throw badRequest("A reason is required", { field: "reason" });
  }

  const updated = await db.$transaction(async (tx) => {
    // Re-check inside the transaction to make concurrent approvals idempotent.
    const fresh = await tx.member.findUniqueOrThrow({ where: { id }, select: { status: true, memberNumber: true } });
    if (fresh.status !== from) throw conflict("Status was changed by someone else — reload and retry");

    const data: Prisma.MemberUncheckedUpdateInput = { status: to };
    if (to === "VERIFIED") {
      if (!fresh.memberNumber) {
        data.memberNumber = await nextMemberNumber(tx, existing.municipality);
        data.joinedAt = existing.joinedAt ?? new Date();
      }
      data.verifiedAt = new Date();
      data.verifiedById = auth.user.id;
      data.rejectionReason = null;
      data.suspensionReason = null;
    }
    if (to === "REJECTED") data.rejectionReason = reason;
    if (to === "SUSPENDED") data.suspensionReason = reason;
    if (to === "PENDING") data.rejectionReason = null;

    await tx.memberStatusChange.create({ data: { memberId: id, fromStatus: from, toStatus: to, reason, changedById: auth.user.id } });
    return tx.member.update({ where: { id }, data, include: memberInclude });
  });

  await audit({
    action: `member.${to.toLowerCase()}`,
    severity: to === "SUSPENDED" ? "WARNING" : "INFO",
    actor: actorOf(auth),
    entityType: "Member",
    entityId: id,
    metadata: { from, to, memberNumber: updated.memberNumber, reason },
    ctx,
  });

  if (updated.email) {
    if (to === "VERIFIED" && from === "PENDING") {
      await sendEmail(updated.email, "member.verified", { fullName: updated.fullName, memberNumber: updated.memberNumber });
    } else if (to === "REJECTED") {
      await sendEmail(updated.email, "member.rejected", { fullName: updated.fullName, registrationRef: updated.registrationRef, reason });
    }
  }
  return toMemberDto(updated);
}

export async function memberStatusHistory(auth: AuthSession, id: string) {
  await findScoped(auth, id);
  return db.memberStatusChange.findMany({
    where: { memberId: id },
    orderBy: { createdAt: "desc" },
    include: { changedBy: { select: { id: true, name: true } } },
  });
}
