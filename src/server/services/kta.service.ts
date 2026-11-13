import { db } from "@/lib/db";
import { env } from "@/env";
import { audit, type AuditActor } from "@/lib/audit";
import { ApiError, conflict, notFound } from "@/lib/http";
import type { RequestContext } from "@/lib/request";
import { randomToken, sha256Hex } from "@/lib/security/crypto";
import { scopeFilter } from "@/lib/security/rbac";
import type { AuthSession } from "@/lib/security/session";
import { getSetting } from "@/lib/settings";
import { getObject, newKey, putObject, signedUrl } from "@/lib/storage";
import { combinedPng, renderCard } from "@/lib/kta/card";
import { currentKid, signPayload, verifyPayload, type KtaPayload } from "@/lib/kta/signer";
import type { Prisma } from "@/generated/prisma/client";

const actorOf = (a: AuthSession): AuditActor => ({ id: a.user.id, email: a.user.email, role: a.user.role });
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function verifyUrlFor(qrToken: string): string {
  return `${env().KTA_VERIFY_URL.replace(/\/$/, "")}/${qrToken}`;
}

async function loadScopedMember(auth: AuthSession, memberId: string) {
  const member = await db.member.findFirst({
    where: { id: memberId, deletedAt: null, ...scopeFilter(auth.user) },
    include: {
      municipality: { select: { name: true, code: true } },
      adminPost: { select: { name: true } },
      photo: { select: { storageKey: true } },
    },
  });
  if (!member) throw notFound("Member");
  return member;
}

/**
 * Issues (or re-issues) a membership card: signs the payload, renders
 * PDF + PNG, stores them privately and revokes the previous card.
 */
export async function issueCard(auth: AuthSession, memberId: string, ctx: RequestContext) {
  const member = await loadScopedMember(auth, memberId);
  if (member.status !== "VERIFIED" || !member.memberNumber) {
    throw new ApiError(409, "MEMBER_NOT_VERIFIED", "Only verified members can receive a KTA card");
  }

  const last = await db.membershipCard.findFirst({ where: { memberId }, orderBy: { version: "desc" }, select: { version: true } });
  const version = (last?.version ?? 0) + 1;
  const years = await getSetting<number>("kta.validityYears", env().KTA_VALIDITY_YEARS);
  const issuedAt = new Date();
  const expiresAt = new Date(Date.UTC(issuedAt.getUTCFullYear() + years, issuedAt.getUTCMonth(), issuedAt.getUTCDate()));

  const payload: KtaPayload = {
    v: 1,
    kid: currentKid(),
    num: member.memberNumber,
    name: member.fullName,
    mun: member.municipality.code,
    rank: member.rank,
    ver: version,
    iss: isoDate(issuedAt),
    exp: isoDate(expiresAt),
    qr: sha256Hex(member.qrToken).slice(0, 32),
  };
  const signature = signPayload(payload);

  const photo = member.photo?.storageKey ? await getObject(member.photo.storageKey).catch(() => null) : null;
  const card = await renderCard({
    memberNumber: member.memberNumber,
    fullName: member.fullName,
    municipality: member.municipality.name,
    adminPost: member.adminPost?.name,
    rank: member.rank,
    issuedAt: payload.iss,
    expiresAt: payload.exp,
    version,
    verifyUrl: verifyUrlFor(member.qrToken),
    photo,
    signature,
    kid: payload.kid,
  });

  const pdfKey = newKey("PRIVATE", `kta/${member.municipality.code.toLowerCase()}`, "pdf");
  const pngKey = newKey("PRIVATE", `kta/${member.municipality.code.toLowerCase()}`, "png");
  await Promise.all([putObject(pdfKey, card.pdf), putObject(pngKey, await combinedPng(card))]);

  let created;
  try {
    created = await db.$transaction(async (tx) => {
      await tx.membershipCard.updateMany({ where: { memberId, revokedAt: null }, data: { revokedAt: issuedAt } });
      return tx.membershipCard.create({
        data: {
          memberId,
          version,
          issuedAt,
          expiresAt,
          payload: payload as unknown as Prisma.InputJsonValue,
          signature,
          signingKid: payload.kid,
          pdfKey,
          pngKey,
          issuedById: auth.user.id,
        },
      });
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw conflict("Another card was issued at the same moment — reload");
    throw err;
  }

  await audit({
    action: "kta.issued",
    actor: actorOf(auth),
    entityType: "Member",
    entityId: memberId,
    metadata: { memberNumber: member.memberNumber, version, cardId: created.id },
    ctx,
  });

  return {
    id: created.id,
    version,
    issuedAt,
    expiresAt,
    pdfUrl: signedUrl(pdfKey),
    pngUrl: signedUrl(pngKey),
  };
}

export async function cardFile(auth: AuthSession, memberId: string, format: "pdf" | "png", ctx: RequestContext) {
  const member = await loadScopedMember(auth, memberId);
  const card = await db.membershipCard.findFirst({
    where: { memberId, revokedAt: null },
    orderBy: { version: "desc" },
  });
  if (!card) throw notFound("Active card");
  const key = format === "pdf" ? card.pdfKey : card.pngKey;
  if (!key) throw notFound("Card file");

  await audit({
    action: "kta.downloaded",
    actor: actorOf(auth),
    entityType: "Member",
    entityId: memberId,
    metadata: { version: card.version, format },
    ctx,
  });
  return {
    body: await getObject(key),
    filename: `KTA-${member.memberNumber ?? member.registrationRef}-v${card.version}.${format}`,
    contentType: format === "pdf" ? "application/pdf" : "image/png",
  };
}

export async function listCards(auth: AuthSession, memberId: string) {
  await loadScopedMember(auth, memberId);
  return db.membershipCard.findMany({
    where: { memberId },
    orderBy: { version: "desc" },
    select: { id: true, version: true, issuedAt: true, expiresAt: true, revokedAt: true, signingKid: true, issuedBy: { select: { name: true } } },
  });
}

/** New QR token (e.g. card lost/stolen): old QR codes stop verifying; a new card must be issued. */
export async function rotateQrToken(auth: AuthSession, memberId: string, ctx: RequestContext) {
  await loadScopedMember(auth, memberId);
  await db.$transaction([
    db.member.update({ where: { id: memberId }, data: { qrToken: randomToken(32) } }),
    db.membershipCard.updateMany({ where: { memberId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ action: "kta.qr_rotated", severity: "WARNING", actor: actorOf(auth), entityType: "Member", entityId: memberId, ctx });
}

export async function revokeCard(auth: AuthSession, memberId: string, ctx: RequestContext) {
  await loadScopedMember(auth, memberId);
  const { count } = await db.membershipCard.updateMany({ where: { memberId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!count) throw notFound("Active card");
  await audit({ action: "kta.revoked", severity: "WARNING", actor: actorOf(auth), entityType: "Member", entityId: memberId, ctx });
}

// -----------------------------------------------------------------------------
// Public verification (QR scan)
// -----------------------------------------------------------------------------
export type VerificationResult =
  | { valid: false; reason: "NOT_FOUND" | "NO_ACTIVE_CARD" }
  | {
      valid: boolean;
      reason: "OK" | "EXPIRED" | "MEMBER_NOT_ACTIVE" | "SIGNATURE_INVALID";
      member: {
        memberNumber: string | null;
        fullName: string;
        municipality: string;
        rank: string;
        status: string;
        photoUrl: string | null;
      };
      card: { version: number; issuedAt: Date; expiresAt: Date | null };
    };

export async function verifyByQrToken(qrToken: string): Promise<VerificationResult> {
  const member = await db.member.findFirst({
    where: { qrToken, deletedAt: null },
    include: { municipality: { select: { name: true } }, photo: { select: { storageKey: true } } },
  });
  if (!member) return { valid: false, reason: "NOT_FOUND" };

  const card = await db.membershipCard.findFirst({ where: { memberId: member.id, revokedAt: null }, orderBy: { version: "desc" } });
  if (!card) return { valid: false, reason: "NO_ACTIVE_CARD" };

  const payload = card.payload as unknown as KtaPayload;
  const signatureOk =
    verifyPayload(payload, card.signature, card.signingKid) &&
    payload.num === member.memberNumber &&
    payload.qr === sha256Hex(member.qrToken).slice(0, 32);
  const expired = !!card.expiresAt && card.expiresAt < new Date();

  const reason = !signatureOk
    ? "SIGNATURE_INVALID"
    : member.status !== "VERIFIED"
      ? "MEMBER_NOT_ACTIVE"
      : expired
        ? "EXPIRED"
        : "OK";

  return {
    valid: reason === "OK",
    reason,
    member: {
      memberNumber: member.memberNumber,
      fullName: member.fullName,
      municipality: member.municipality.name,
      rank: member.rank,
      status: member.status,
      // Photo lets the verifier match the card holder; 2-minute link only.
      photoUrl: member.photo?.storageKey && signatureOk ? signedUrl(member.photo.storageKey, 120) : null,
    },
    card: { version: card.version, issuedAt: card.issuedAt, expiresAt: card.expiresAt },
  };
}
