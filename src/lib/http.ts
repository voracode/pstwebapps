import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType, z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { env } from "@/env";
import { requestContext, type RequestContext } from "@/lib/request";
import { getSession, type AuthSession, type SessionStage } from "@/lib/security/session";
import { can, type Permission } from "@/lib/security/rbac";

/**
 * Route-handler toolkit: consistent JSON envelopes, error mapping, auth
 * guards and CSRF protection.
 *
 *   success → { data: ... }
 *   failure → { error: { code, message, details? } }
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") => new ApiError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have permission for this action") =>
  new ApiError(403, "FORBIDDEN", message);
export const notFound = (what = "Resource") => new ApiError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (message: string, details?: unknown) => new ApiError(409, "CONFLICT", message, details);
export const tooMany = (retryAfterSec: number) =>
  new ApiError(429, "RATE_LIMITED", "Too many requests, please try again later", { retryAfterSec }, {
    "Retry-After": String(retryAfterSec),
  });

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

function errorResponse(err: unknown, requestId: string): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status, headers: err.headers },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message, code: i.code })),
        },
      },
      { status: 422 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return NextResponse.json(
        { error: { code: "CONFLICT", message: "A record with these values already exists", details: err.meta } },
        { status: 409 },
      );
    }
    if (err.code === "P2025") {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Record not found" } }, { status: 404 });
    }
    if (err.code === "P2003") {
      return NextResponse.json(
        { error: { code: "BAD_REFERENCE", message: "Referenced record does not exist or is in use" } },
        { status: 409 },
      );
    }
  }
  console.error(`[api] unhandled error requestId=${requestId}`, err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error", details: { requestId } } },
    { status: 500 },
  );
}

/**
 * CSRF defence for cookie-authenticated mutations: the Origin (or Referer)
 * must match APP_URL. Combined with SameSite=Strict cookies this blocks
 * cross-site form posts and fetches.
 */
function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const allowed = new URL(env().APP_URL).origin;
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const source = origin ?? (referer ? new URL(referer).origin : null);
  if (source !== allowed) throw new ApiError(403, "CSRF_REJECTED", "Cross-origin request rejected");
}

type RouteParams = Record<string, string | string[]>;

export interface PublicContext<P extends RouteParams> {
  req: NextRequest;
  params: P;
  ctx: RequestContext;
}

export interface AdminContext<P extends RouteParams> extends PublicContext<P> {
  auth: AuthSession;
}

type NextHandler = (req: NextRequest, route: { params: Promise<RouteParams> }) => Promise<Response>;

/** Public endpoint wrapper: error handling + request context. */
export function publicRoute<P extends RouteParams = RouteParams>(
  fn: (c: PublicContext<P>) => Promise<Response>,
): NextHandler {
  return async (req, route) => {
    const ctx = requestContext(req.headers);
    try {
      const params = ((await route?.params) ?? {}) as P;
      const res = await fn({ req, params, ctx });
      res.headers.set("x-request-id", ctx.requestId);
      return res;
    } catch (err) {
      return errorResponse(err, ctx.requestId);
    }
  };
}

export interface AdminRouteOptions {
  permission?: Permission;
  /**
   * Session stages allowed to call this route. Defaults to fully
   * authenticated (`ACTIVE`). Login-flow routes widen this.
   */
  stages?: SessionStage[];
}

/** Backoffice endpoint wrapper: session, stage, permission and CSRF checks. */
export function adminRoute<P extends RouteParams = RouteParams>(
  opts: AdminRouteOptions,
  fn: (c: AdminContext<P>) => Promise<Response>,
): NextHandler {
  return async (req, route) => {
    const ctx = requestContext(req.headers);
    try {
      assertSameOrigin(req);
      const auth = await getSession(ctx);
      if (!auth) throw unauthorized();
      const stages = opts.stages ?? ["ACTIVE"];
      if (!stages.includes(auth.stage)) {
        throw new ApiError(403, "STAGE_" + auth.stage, "Complete the login step first", { stage: auth.stage });
      }
      if (opts.permission && !can(auth.user.role, opts.permission)) throw forbidden();
      const params = ((await route?.params) ?? {}) as P;
      const res = await fn({ req, params, ctx, auth });
      res.headers.set("x-request-id", ctx.requestId);
      res.headers.set("cache-control", "no-store");
      return res;
    } catch (err) {
      return errorResponse(err, ctx.requestId);
    }
  };
}

// -----------------------------------------------------------------------------
// Input helpers
// -----------------------------------------------------------------------------

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

export async function parseForm(req: NextRequest): Promise<FormData> {
  try {
    return await req.formData();
  } catch {
    throw badRequest("Request body must be multipart/form-data");
  }
}

/** FormData → plain object of string fields (files excluded). */
export function formFields(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function formFile(form: FormData, name: string): File | null {
  const v = form.get(name);
  return v instanceof File && v.size > 0 ? v : null;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function pageMeta(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export function paramInt(value: string | string[] | undefined, name = "id"): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${name}`);
  return n;
}

export function paramStr(value: string | string[] | undefined, name = "id"): string {
  const s = Array.isArray(value) ? value[0] : value;
  if (!s || s.length > 100) throw badRequest(`Invalid ${name}`);
  return s;
}
