import type { Role } from "@/generated/prisma/client";

/**
 * Role-Based Access Control.
 *
 * Permissions are coarse "<resource>:<action>" strings. Route handlers
 * declare the permission they need; data scoping (municipal coordinators
 * only see their own município) is applied separately via `scopeFilter`.
 */
export const PERMISSIONS = [
  "dashboard:read",
  "member:read",
  "member:create",
  "member:update",
  "member:delete",
  "member:verify",
  "member:reveal_id",
  "member:export",
  "member:import",
  "kta:issue",
  "post:read",
  "post:write",
  "post:publish",
  "post:delete",
  "document:write",
  "media:write",
  "event:read",
  "event:write",
  "attendance:write",
  "leadership:write",
  "aspiration:read",
  "aspiration:manage",
  "contact:read",
  "user:manage",
  "audit:read",
  "settings:write",
  "system:health",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: ALL,

  NATIONAL_SECRETARY: new Set<Permission>(
    PERMISSIONS.filter((p) => p !== "user:manage" && p !== "settings:write"),
  ),

  MUNICIPAL_COORDINATOR: new Set<Permission>([
    "dashboard:read",
    "member:read",
    "member:create",
    "member:update",
    "member:verify",
    "member:export",
    "member:import",
    "kta:issue",
    "post:read",
    "event:read",
    "event:write",
    "attendance:write",
    "aspiration:read",
    "aspiration:manage",
  ]),

  MEDIA_EDITOR: new Set<Permission>([
    "dashboard:read",
    "post:read",
    "post:write",
    "post:publish",
    "post:delete",
    "document:write",
    "media:write",
    "event:read",
    "event:write",
    "leadership:write",
    "contact:read",
  ]),

  // Read-only oversight: can inspect everything, change nothing.
  AUDITOR: new Set<Permission>([
    "dashboard:read",
    "member:read",
    "post:read",
    "event:read",
    "aspiration:read",
    "contact:read",
    "audit:read",
    "system:health",
  ]),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...MATRIX[role]];
}

export interface ScopedUser {
  role: Role;
  municipalityId: number | null;
}

/** True for roles whose data access is limited to one município. */
export function isMunicipalScoped(user: ScopedUser): boolean {
  return user.role === "MUNICIPAL_COORDINATOR";
}

/**
 * Prisma `where` fragment restricting rows to the user's município.
 * A coordinator without a município assigned sees nothing (fail closed).
 */
export function scopeFilter(user: ScopedUser): { municipalityId?: number } {
  if (!isMunicipalScoped(user)) return {};
  return { municipalityId: user.municipalityId ?? -1 };
}

export function inScope(user: ScopedUser, municipalityId: number | null | undefined): boolean {
  if (!isMunicipalScoped(user)) return true;
  return municipalityId != null && municipalityId === user.municipalityId;
}
