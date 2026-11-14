import { ApiClientError } from "@/lib/api-client";

export type MediaKindValue = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "VIDEO_EMBED";
export const MEDIA_KINDS: MediaKindValue[] = ["IMAGE", "DOCUMENT", "VIDEO_EMBED", "VIDEO", "AUDIO"];

/** Shape returned by /api/admin/media (see content.service mediaDto). */
export interface MediaItem {
  id: string;
  kind: MediaKindValue;
  url: string | null;
  storageKey?: string | null;
  externalUrl?: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  blurDataUrl: string | null;
  altText: unknown;
  credit: string | null;
  createdAt: string | Date;
  uploadedBy?: { id: string; name: string } | null;
}

/** Minimal reference to a picked item (what forms keep in state). */
export interface MediaRef {
  id: string;
  url: string | null;
  kind?: MediaKindValue;
  name?: string | null;
}

export const toRef = (m: MediaItem): MediaRef => ({ id: m.id, url: m.url, kind: m.kind, name: m.originalName });

/** File-input `accept` per kind (the server sniffs magic bytes anyway). */
export const ACCEPT: Partial<Record<MediaKindValue, string>> = {
  IMAGE: "image/jpeg,image/png,image/webp",
  DOCUMENT: "application/pdf",
  VIDEO: "video/mp4,video/webm",
  AUDIO: "audio/mpeg,audio/mp4,audio/ogg",
};
export const ACCEPT_ALL = Object.values(ACCEPT).join(",");

export function altFor(m: { altText: unknown }, locale: string): string {
  const a = m.altText as Record<string, string> | null;
  return a?.[locale] || a?.tet || a?.pt || "";
}

/** YouTube id from any common URL form, for thumbnails. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.endsWith("youtube.com") || u.hostname.endsWith("youtube-nocookie.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = /\/(?:embed|shorts|live)\/([\w-]{6,})/.exec(u.pathname);
      return m?.[1] ?? null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function thumbFor(m: { kind?: MediaKindValue; url: string | null }): string | null {
  if (m.kind === "IMAGE" || !m.kind) return m.url;
  if (m.kind === "VIDEO_EMBED") {
    const id = youtubeId(m.url);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  }
  return null;
}

/**
 * Multipart upload to /api/admin/media with progress (fetch has no upload
 * progress). Errors are thrown as ApiClientError like the api client does.
 */
export function uploadMedia(
  file: File,
  opts: { altText?: Record<string, string>; credit?: string; onProgress?: (pct: number) => void; signal?: AbortSignal } = {},
): Promise<MediaItem> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    if (opts.altText && Object.values(opts.altText).some(Boolean)) form.append("altText", JSON.stringify(opts.altText));
    if (opts.credit) form.append("credit", opts.credit);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/media");
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new ApiClientError(0, "NETWORK_ERROR", "Network error"));
    xhr.onabort = () => reject(new ApiClientError(0, "ABORTED", "Upload cancelled"));
    xhr.onload = () => {
      let json: { data?: MediaItem; error?: { code: string; message: string; details?: unknown } } = {};
      try {
        json = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        /* non-JSON proxy error (e.g. 413 from Nginx) */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.data) resolve(json.data);
      else
        reject(
          new ApiClientError(
            xhr.status,
            json.error?.code ?? (xhr.status === 413 ? "FILE_TOO_LARGE" : `HTTP_${xhr.status}`),
            json.error?.message ?? xhr.statusText,
            json.error?.details,
          ),
        );
    };
    opts.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}
