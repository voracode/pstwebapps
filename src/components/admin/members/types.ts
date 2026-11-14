import type { toMemberDto } from "@/server/services/member.service";

/** Member as serialised to client components (dates become strings over the RSC boundary). */
export type MemberDto = ReturnType<typeof toMemberDto>;

export type MemberStatus = "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";

/** Allowed workflow transitions (mirror of the service rules). */
export const TRANSITIONS: Record<MemberStatus, MemberStatus[]> = {
  PENDING: ["VERIFIED", "REJECTED"],
  VERIFIED: ["SUSPENDED"],
  SUSPENDED: ["VERIFIED"],
  REJECTED: ["PENDING"],
};
