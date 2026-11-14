/**
 * Browser-side client for the REST API (Phase 2). Same-origin, cookie
 * session; the browser adds the Origin header our CSRF check needs.
 *
 *   const member = await api.post<MemberDto>(`/api/admin/members/${id}/status`, { status: "VERIFIED" });
 */

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  /** Field → message map from a 422 VALIDATION_ERROR response. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== "VALIDATION_ERROR" || !Array.isArray(this.details)) {
      const field = (this.details as { field?: string } | undefined)?.field;
      return field ? { [field]: this.message } : {};
    }
    const out: Record<string, string> = {};
    for (const d of this.details as { path: string; message: string }[]) if (d.path && !out[d.path]) out[d.path] = d.message;
    return out;
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

async function request<T>(method: string, url: string, body?: Body): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    (init.headers as Record<string, string>)["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiClientError(0, "NETWORK_ERROR", "Network error");
  }

  const text = await res.text();
  let json: { data?: T; error?: { code: string; message: string; details?: unknown } } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON (e.g. proxy error page) */
  }
  if (!res.ok) {
    throw new ApiClientError(res.status, json.error?.code ?? `HTTP_${res.status}`, json.error?.message ?? res.statusText, json.error?.details);
  }
  return json.data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: Body) => request<T>("POST", url, body),
  put: <T>(url: string, body?: Body) => request<T>("PUT", url, body),
  patch: <T>(url: string, body?: Body) => request<T>("PATCH", url, body),
  delete: <T>(url: string, body?: Body) => request<T>("DELETE", url, body),
};

/**
 * Maps an error to a translated message. Pass `useTranslations("common")`.
 * Specific API messages are shown as-is (they are short and actionable).
 */
export function errorMessage(err: unknown, t: (key: string) => string): string {
  if (!(err instanceof ApiClientError)) return t("errors.generic");
  switch (err.code) {
    case "NETWORK_ERROR":
      return t("errors.network");
    case "RATE_LIMITED":
      return t("errors.rateLimited");
    case "FORBIDDEN":
      return t("errors.forbidden");
    case "VALIDATION_ERROR":
      return t("errors.validation");
    case "INTERNAL_ERROR":
      return t("errors.generic");
    default:
      return err.message || t("errors.generic");
  }
}
