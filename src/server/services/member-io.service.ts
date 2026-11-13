import Papa from "papaparse";
import ExcelJS from "exceljs";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, type AuditActor } from "@/lib/audit";
import { alertAdmins } from "@/lib/notify";
import { ApiError, badRequest, forbidden } from "@/lib/http";
import type { RequestContext } from "@/lib/request";
import { encrypt, normalizeIdNumber, randomCode, randomToken } from "@/lib/security/crypto";
import { inScope, isMunicipalScoped, type ScopedUser } from "@/lib/security/rbac";
import type { AuthSession } from "@/lib/security/session";
import { getSetting } from "@/lib/settings";
import { newKey, putObject } from "@/lib/storage";
import { normalizePhone } from "@/lib/validation/common";
import { EDUCATION_LEVELS, ID_DOC_TYPES, MEMBER_RANKS, type MemberListFilter } from "@/lib/validation/member";
import { slugify } from "@/lib/utils/slug";
import type { Prisma } from "@/generated/prisma/client";
import { ageOn, buildMemberWhere, idNumberHash } from "./member.service";

const actorOf = (a: AuthSession): AuditActor => ({ id: a.user.id, email: a.user.email, role: a.user.role });

// =============================================================================
//  EXPORT
// =============================================================================
const EXPORT_LIMIT = 50_000;

const EXPORT_COLUMNS = [
  ["member_number", "Nº KTA"],
  ["registration_ref", "Referência"],
  ["status", "Estado"],
  ["rank", "Categoria"],
  ["full_name", "Nome completo"],
  ["gender", "Sexo"],
  ["birth_date", "Data de nascimento"],
  ["age", "Idade"],
  ["municipality", "Município"],
  ["admin_post", "Posto Administrativo"],
  ["suco", "Suco"],
  ["aldeia", "Aldeia"],
  ["phone", "Telefone"],
  ["email", "E-mail"],
  ["occupation", "Profissão"],
  ["education_level", "Educação"],
  ["joined_at", "Data de adesão"],
  ["created_at", "Registado em"],
] as const;

export async function exportMembers(
  auth: AuthSession,
  filter: Partial<MemberListFilter>,
  format: "csv" | "xlsx",
  ctx: RequestContext,
): Promise<{ body: Buffer; contentType: string; filename: string; count: number }> {
  const where = buildMemberWhere(auth, filter);
  const count = await db.member.count({ where });
  if (count > EXPORT_LIMIT) {
    throw new ApiError(413, "EXPORT_TOO_LARGE", `Export limited to ${EXPORT_LIMIT} rows — narrow the filters`, { count });
  }

  const rows = await db.member.findMany({
    where,
    orderBy: [{ municipalityId: "asc" }, { fullName: "asc" }],
    include: {
      municipality: { select: { name: true } },
      adminPost: { select: { name: true } },
      suco: { select: { name: true } },
      aldeia: { select: { name: true } },
    },
  });

  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "");
  const records = rows.map((m) => ({
    member_number: m.memberNumber ?? "",
    registration_ref: m.registrationRef,
    status: m.status,
    rank: m.rank,
    full_name: m.fullName,
    gender: m.gender,
    birth_date: d(m.birthDate),
    age: ageOn(m.birthDate),
    municipality: m.municipality.name,
    admin_post: m.adminPost?.name ?? "",
    suco: m.suco?.name ?? "",
    aldeia: m.aldeia?.name ?? "",
    phone: m.phone ?? "",
    email: m.email ?? "",
    occupation: m.occupation ?? "",
    education_level: m.educationLevel ?? "",
    joined_at: d(m.joinedAt),
    created_at: d(m.createdAt),
  }));

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  let body: Buffer;
  let contentType: string;
  if (format === "csv") {
    // Leading quote neutralises spreadsheet formula injection (=, +, -, @).
    const safe = records.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v])),
    );
    const csv = Papa.unparse(safe, { columns: EXPORT_COLUMNS.map(([k]) => k) });
    body = Buffer.from(`﻿${csv}`, "utf8"); // BOM so Excel opens UTF-8 correctly
    contentType = "text/csv; charset=utf-8";
  } else {
    const wb = new ExcelJS.Workbook();
    wb.creator = "SIM-PST";
    wb.created = new Date();
    const ws = wb.addWorksheet("Militantes", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = EXPORT_COLUMNS.map(([key, header]) => ({ key, header, width: Math.max(12, header.length + 4) }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD91C1F" } };
    ws.addRows(records);
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };
    body = Buffer.from(await wb.xlsx.writeBuffer());
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  const filters = JSON.stringify(Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined)));
  await audit({
    action: "member.export",
    severity: "WARNING",
    actor: actorOf(auth),
    entityType: "Member",
    metadata: { count, format, filters },
    ctx,
  });
  await alertAdmins("security", "security.export", {
    actorEmail: auth.user.email,
    actorRole: auth.user.role,
    count,
    format,
    filters,
    ip: ctx.ip,
  });

  return { body, contentType, filename: `pst-militantes-${stamp}.${format}`, count };
}

// =============================================================================
//  IMPORT (offline field registration sheets)
// =============================================================================
const IMPORT_LIMIT = 5000;

export const IMPORT_HEADERS = [
  "full_name",
  "gender",
  "birth_date",
  "birth_place",
  "id_document_type",
  "id_number",
  "phone",
  "email",
  "occupation",
  "education_level",
  "municipality",
  "admin_post",
  "suco",
  "aldeia",
  "address",
  "rank",
  "joined_at",
] as const;

export function importTemplateCsv(): string {
  return (
    "﻿" +
    Papa.unparse({
      fields: [...IMPORT_HEADERS],
      data: [["Maria da Costa", "F", "1990-05-21", "Baucau", "BILHETE_IDENTIDADE", "123456789", "77123456", "", "Agrikultora", "SECONDARY", "Baucau", "Baucau", "", "", "", "MILITANT", "2026-10-01"]],
    })
  );
}

function parseGender(v: string): "MALE" | "FEMALE" | null {
  const s = v.trim().toLowerCase();
  if (["m", "male", "mane", "masculino", "laki-laki", "l"].includes(s)) return "MALE";
  if (["f", "female", "feto", "feminino", "perempuan", "p"].includes(s)) return "FEMALE";
  return null;
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY or a spreadsheet Date. */
function parseDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  const s = String(v ?? "").trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

const optEnum = <T extends readonly string[]>(values: T, v: string): T[number] | undefined | null => {
  if (!v.trim()) return undefined;
  const up = v.trim().toUpperCase();
  return (values as readonly string[]).includes(up) ? (up as T[number]) : null;
};

async function readRows(file: File): Promise<Record<string, unknown>[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const isXlsx = buf.subarray(0, 2).toString("latin1") === "PK";

  if (isXlsx) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw badRequest("Workbook has no sheets");
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col] = String(cell.value ?? "").trim().toLowerCase();
    });
    const rows: Record<string, unknown>[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const rec: Record<string, unknown> = {};
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const key = headers[col];
        if (!key) return;
        const v = cell.value;
        rec[key] = v && typeof v === "object" && !(v instanceof Date) && "text" in v ? (v as { text: string }).text : v;
      });
      if (Object.values(rec).some((v) => v !== null && v !== undefined && String(v).trim() !== "")) rows.push(rec);
    });
    return rows;
  }

  const text = buf.toString("utf8").replace(/^﻿/, "");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (parsed.errors.length && !parsed.data.length) throw badRequest("Could not parse CSV", parsed.errors.slice(0, 5));
  return parsed.data;
}

interface GeoIndex {
  municipality: Map<string, { id: number; code: string }>;
  adminPost: Map<string, number>;
  suco: Map<string, number>;
  aldeia: Map<string, number>;
}

async function loadGeoIndex(): Promise<GeoIndex> {
  const [ms, ps, ss, as] = await Promise.all([
    db.municipality.findMany({ select: { id: true, code: true, name: true, slug: true } }),
    db.adminPost.findMany({ select: { id: true, municipalityId: true, slug: true } }),
    db.suco.findMany({ select: { id: true, adminPostId: true, slug: true } }),
    db.aldeia.findMany({ select: { id: true, sucoId: true, slug: true } }),
  ]);
  const municipality = new Map<string, { id: number; code: string }>();
  for (const m of ms) {
    municipality.set(m.slug, m);
    municipality.set(m.code.toLowerCase(), m);
  }
  // Common alternate spellings found on field sheets.
  const alias: Record<string, string> = { "cova-lima": "CO", oecusse: "OE", oecussi: "OE", raeoa: "OE", "oe-cusse": "OE", atauro: "AT", lautem: "LA", liquica: "LI", dili: "DI" };
  for (const [k, code] of Object.entries(alias)) {
    const m = ms.find((x) => x.code === code);
    if (m) municipality.set(k, m);
  }
  return {
    municipality,
    adminPost: new Map(ps.map((p) => [`${p.municipalityId}|${p.slug}`, p.id])),
    suco: new Map(ss.map((s) => [`${s.adminPostId}|${s.slug}`, s.id])),
    aldeia: new Map(as.map((a) => [`${a.sucoId}|${a.slug}`, a.id])),
  };
}

export interface ImportIssue {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  jobId: string | null;
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  importedRows: number;
  errorRows: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

const s = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

export async function importMembers(
  auth: AuthSession,
  file: File,
  opts: { dryRun: boolean },
  ctx: RequestContext,
): Promise<ImportResult> {
  if (file.size > 10 * 1024 * 1024) throw new ApiError(413, "FILE_TOO_LARGE", "Import file exceeds 10 MB");
  const rows = await readRows(file);
  if (!rows.length) throw badRequest("The file has no data rows");
  if (rows.length > IMPORT_LIMIT) throw badRequest(`At most ${IMPORT_LIMIT} rows per import — split the file`);

  const missing = ["full_name", "gender", "birth_date", "municipality"].filter((h) => !(h in rows[0]!));
  if (missing.length) throw badRequest("Missing required columns", { missing, expected: IMPORT_HEADERS });

  const geo = await loadGeoIndex();
  const minAge = await getSetting<number>("membership.minimumAge", 17);
  const consentVersion = await getSetting<string>("membership.consentVersion", "2026-11");
  const scoped: ScopedUser = auth.user;

  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const seenHashes = new Set<string>();
  const valid: Omit<Prisma.MemberCreateManyInput, "registrationRef" | "qrToken" | "importJobId">[] = [];

  rows.forEach((r, i) => {
    const rowNo = i + 2; // header is row 1
    const rowErrors: ImportIssue[] = [];
    const err = (field: string, message: string) => rowErrors.push({ row: rowNo, field, message });

    const fullName = s(r.full_name);
    if (fullName.length < 3 || fullName.length > 180) err("full_name", "Required, 3–180 characters");

    const gender = parseGender(s(r.gender));
    if (!gender) err("gender", "Use M/F (Mane/Feto)");

    const birthDate = parseDate(r.birth_date);
    if (!birthDate) err("birth_date", "Use YYYY-MM-DD or DD/MM/YYYY");
    else if (ageOn(birthDate) < minAge || ageOn(birthDate) > 120) err("birth_date", `Age must be between ${minAge} and 120`);

    const docType = optEnum(ID_DOC_TYPES, s(r.id_document_type)) ?? "BILHETE_IDENTIDADE";
    if (docType === null) err("id_document_type", `One of ${ID_DOC_TYPES.join(", ")}`);
    const idRaw = s(r.id_number);
    let idFields: Pick<Prisma.MemberCreateManyInput, "idNumberEnc" | "idNumberHash" | "idNumberLast4"> = {};
    if (idRaw) {
      if (!/^[A-Za-z0-9 .\-/]{4,40}$/.test(idRaw)) err("id_number", "Invalid ID number");
      else if (docType) {
        const hash = idNumberHash(docType, idRaw);
        if (seenHashes.has(hash)) err("id_number", "Duplicate ID number within this file");
        seenHashes.add(hash);
        const normalized = normalizeIdNumber(idRaw);
        idFields = { idNumberEnc: encrypt(normalized, `member-id:${hash}`), idNumberHash: hash, idNumberLast4: normalized.slice(-4) };
      }
    }

    const phoneRaw = s(r.phone);
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
    if (phoneRaw && !phone) err("phone", "Invalid phone number");

    const emailRaw = s(r.email).toLowerCase();
    if (emailRaw && !z.email().safeParse(emailRaw).success) err("email", "Invalid e-mail");

    const education = optEnum(EDUCATION_LEVELS, s(r.education_level));
    if (education === null) warnings.push({ row: rowNo, field: "education_level", message: "Unknown value ignored" });
    const rank = optEnum(MEMBER_RANKS, s(r.rank));
    if (rank === null) err("rank", `One of ${MEMBER_RANKS.join(", ")}`);
    const joinedRaw = s(r.joined_at);
    const joinedAt = joinedRaw ? parseDate(r.joined_at) : null;
    if (joinedRaw && !joinedAt) err("joined_at", "Invalid date");

    // ---- location ----
    const mun = geo.municipality.get(slugify(s(r.municipality))) ?? geo.municipality.get(s(r.municipality).toLowerCase());
    if (!mun) err("municipality", `Unknown município "${s(r.municipality)}"`);
    else if (!inScope(scoped, mun.id)) err("municipality", "Outside your município");

    let adminPostId: number | undefined;
    let sucoId: number | undefined;
    let aldeiaId: number | undefined;
    const extraAddress: string[] = [];
    if (mun && s(r.admin_post)) {
      adminPostId = geo.adminPost.get(`${mun.id}|${slugify(s(r.admin_post))}`);
      if (!adminPostId) err("admin_post", `Unknown posto "${s(r.admin_post)}" in ${s(r.municipality)}`);
    }
    // Suco/aldeia lists may be incomplete: unknown names are kept as address text, not rejected.
    if (adminPostId && s(r.suco)) {
      sucoId = geo.suco.get(`${adminPostId}|${slugify(s(r.suco))}`);
      if (!sucoId) {
        extraAddress.push(`Suco ${s(r.suco)}`);
        warnings.push({ row: rowNo, field: "suco", message: "Not in reference list — saved in address" });
      }
    }
    if (sucoId && s(r.aldeia)) {
      aldeiaId = geo.aldeia.get(`${sucoId}|${slugify(s(r.aldeia))}`);
      if (!aldeiaId) extraAddress.push(`Aldeia ${s(r.aldeia)}`);
    } else if (s(r.aldeia)) {
      extraAddress.push(`Aldeia ${s(r.aldeia)}`);
    }

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }

    valid.push({
      status: "PENDING",
      rank: rank ?? "MILITANT",
      channel: "FIELD_IMPORT",
      fullName,
      gender: gender!,
      birthDate: birthDate!,
      birthPlace: s(r.birth_place) || null,
      idDocumentType: docType ?? "BILHETE_IDENTIDADE",
      ...idFields,
      occupation: s(r.occupation) || null,
      educationLevel: education ?? null,
      phone,
      email: emailRaw || null,
      municipalityId: mun!.id,
      adminPostId,
      sucoId,
      aldeiaId,
      addressLine: [s(r.address), ...extraAddress].filter(Boolean).join(", ").slice(0, 255) || null,
      joinedAt,
      consentVersion,
      // Paper forms carry the signed consent; the import date records when it was digitised.
      consentAt: new Date(),
      createdById: auth.user.id,
    });
  });

  // Duplicates already in the database.
  const hashes = valid.map((v) => v.idNumberHash).filter((h): h is string => !!h);
  if (hashes.length) {
    const existing = new Set(
      (await db.member.findMany({ where: { idNumberHash: { in: hashes } }, select: { idNumberHash: true } })).map((m) => m.idNumberHash),
    );
    for (let i = valid.length - 1; i >= 0; i--) {
      const h = valid[i]!.idNumberHash;
      if (h && existing.has(h)) {
        errors.push({ row: -1, field: "id_number", message: `Already registered (${valid[i]!.fullName})` });
        valid.splice(i, 1);
      }
    }
  }

  const errorRows = new Set(errors.map((e) => e.row)).size;
  const base: ImportResult = {
    jobId: null,
    dryRun: opts.dryRun,
    totalRows: rows.length,
    validRows: valid.length,
    importedRows: 0,
    errorRows,
    errors: errors.slice(0, 500),
    warnings: warnings.slice(0, 500),
  };
  if (opts.dryRun) return base;
  if (!valid.length) throw new ApiError(422, "NOTHING_TO_IMPORT", "No valid rows to import", base);

  // Keep the original file for traceability.
  const ext = (file.name.split(".").pop() ?? "csv").toLowerCase() === "xlsx" ? "xlsx" : "csv";
  const fileKey = newKey("PRIVATE", "imports", ext);
  await putObject(fileKey, Buffer.from(await file.arrayBuffer()));

  const job = await db.importJob.create({
    data: {
      fileName: file.name.slice(0, 255),
      fileKey,
      status: "PROCESSING",
      totalRows: rows.length,
      createdById: auth.user.id,
      startedAt: new Date(),
    },
  });

  let imported = 0;
  try {
    for (let i = 0; i < valid.length; i += 500) {
      const chunk = valid.slice(i, i + 500).map((v) => ({
        ...v,
        registrationRef: `REG-${randomCode(8)}`,
        qrToken: randomToken(32),
        importJobId: job.id,
      }));
      await db.$transaction(async (tx) => {
        const created = await tx.member.createManyAndReturn({ data: chunk, select: { id: true } });
        await tx.memberStatusChange.createMany({
          data: created.map((c) => ({ memberId: c.id, toStatus: "PENDING" as const, changedById: auth.user.id, reason: `Imported from ${file.name}` })),
        });
        imported += created.length;
      });
    }
    await db.importJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        successRows: imported,
        errorRows,
        errors: errors.slice(0, 1000) as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  } catch (e) {
    await db.importJob.update({
      where: { id: job.id },
      data: { status: "FAILED", successRows: imported, errors: [{ row: 0, field: "*", message: (e as Error).message }], finishedAt: new Date() },
    });
    throw e;
  }

  await audit({
    action: "member.import",
    actor: actorOf(auth),
    entityType: "ImportJob",
    entityId: job.id,
    metadata: { file: file.name, total: rows.length, imported, errorRows },
    ctx,
  });
  await alertAdmins("registrations", "system.notice", {
    message: `📥 Import ${file.name}: ${imported} militantes importados por ${auth.user.email} (${errorRows} linhas com erros).`,
  });

  return { ...base, jobId: job.id, importedRows: imported };
}

export function assertImportScope(auth: AuthSession) {
  if (isMunicipalScoped(auth.user) && !auth.user.municipalityId) throw forbidden("No município assigned to your account");
}
