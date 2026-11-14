import sharp, { type OutputInfo } from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { env } from "@/env";
import { sha256Hex } from "@/lib/security/crypto";
import { ApiError } from "@/lib/http";
import { newKey, putObject, type Visibility } from "./index";

/**
 * Upload pipeline: size limit → magic-byte sniffing (never trust the
 * client's Content-Type or extension) → images re-encoded with sharp, which
 * strips EXIF/GPS metadata and neutralises polyglot payloads.
 */

export type UploadKind = "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO";

const ALLOWED: Record<UploadKind, Record<string, string>> = {
  IMAGE: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  DOCUMENT: { "application/pdf": "pdf" },
  AUDIO: { "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/ogg": "ogg" },
  VIDEO: { "video/mp4": "mp4", "video/webm": "webm" },
};

export interface StoredUpload {
  kind: UploadKind;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  sha256: string;
  blurDataUrl?: string;
  originalName: string;
}

export interface UploadOptions {
  accept: UploadKind[];
  visibility: Visibility;
  folder: string;
  /** Longest edge for images (default 2000 px). */
  maxImageEdge?: number;
  /** Re-encode images to this format (default webp for public, jpeg for private). */
  imageFormat?: "webp" | "jpeg" | "png";
  maxMb?: number;
}

function invalid(message: string) {
  return new ApiError(415, "UNSUPPORTED_FILE", message);
}

export async function storeUpload(file: File, opts: UploadOptions): Promise<StoredUpload> {
  const e = env();
  const maxMb =
    opts.maxMb ?? (opts.accept.length === 1 && opts.accept[0] === "IMAGE" ? e.UPLOAD_MAX_IMAGE_MB : e.UPLOAD_MAX_DOCUMENT_MB);
  if (file.size > maxMb * 1024 * 1024) {
    throw new ApiError(413, "FILE_TOO_LARGE", `File exceeds ${maxMb} MB`, { maxMb });
  }

  const input = Buffer.from(await file.arrayBuffer());
  const sniffed = await fileTypeFromBuffer(input);
  if (!sniffed) throw invalid("Unrecognised file type");

  const kind = opts.accept.find((k) => sniffed.mime in ALLOWED[k]);
  if (!kind) throw invalid(`File type ${sniffed.mime} is not allowed here`);

  const originalName = (file.name || "upload").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 200);

  if (kind === "IMAGE") {
    const format = opts.imageFormat ?? (opts.visibility === "PUBLIC" ? "webp" : "jpeg");
    const edge = opts.maxImageEdge ?? 2000;
    let pipeline = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate() // apply EXIF orientation before metadata is dropped
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true });
    pipeline =
      format === "webp"
        ? pipeline.webp({ quality: 80 })
        : format === "png"
          ? pipeline.png({ compressionLevel: 9 })
          : pipeline.jpeg({ quality: 85, mozjpeg: true });

    let output: { data: Buffer; info: OutputInfo };
    try {
      output = await pipeline.toBuffer({ resolveWithObject: true });
    } catch {
      throw invalid("Image could not be decoded");
    }

    const blur = await sharp(output.data).resize(16, 16, { fit: "inside" }).webp({ quality: 40 }).toBuffer();
    const ext = format === "jpeg" ? "jpg" : format;
    const storageKey = newKey(opts.visibility, opts.folder, ext);
    await putObject(storageKey, output.data);

    return {
      kind,
      storageKey,
      mimeType: `image/${format}`,
      sizeBytes: output.data.length,
      width: output.info.width,
      height: output.info.height,
      sha256: sha256Hex(output.data),
      blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
      originalName,
    };
  }

  if (kind === "DOCUMENT" && input.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw invalid("Not a valid PDF");
  }

  const ext = ALLOWED[kind][sniffed.mime]!;
  const storageKey = newKey(opts.visibility, opts.folder, ext);
  await putObject(storageKey, input);
  return {
    kind,
    storageKey,
    mimeType: sniffed.mime,
    sizeBytes: input.length,
    sha256: sha256Hex(input),
    originalName,
  };
}
