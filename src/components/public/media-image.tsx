import { cn } from "@/lib/utils/cn";

/**
 * Storage media image: plain lazy <img> (no optimizer round trip) with the
 * stored blur placeholder painted as background while it loads.
 */
export function MediaImage({
  src,
  alt,
  blurDataUrl,
  width,
  height,
  className,
  eager,
  sizes,
}: {
  src: string;
  alt: string;
  blurDataUrl?: string | null;
  width?: number | null;
  height?: number | null;
  className?: string;
  eager?: boolean;
  sizes?: string;
}) {
  const blur = blurDataUrl && /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(blurDataUrl) ? blurDataUrl : null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={width ?? undefined}
      height={height ?? undefined}
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : undefined}
      className={cn("bg-muted object-cover", className)}
      style={blur ? { backgroundImage: `url("${blur}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    />
  );
}

/** Branded placeholder for items without an image. */
export function ImageFallback({ className, label }: { className?: string; label?: string }) {
  return (
    <div
      aria-hidden={!label}
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("flex items-center justify-center bg-gradient-to-br from-pst-red via-pst-red-800 to-pst-ink text-pst-gold", className)}
    >
      <span className="font-display text-2xl font-extrabold tracking-widest text-white/90">
        PST <span className="text-pst-gold">★</span>
      </span>
    </div>
  );
}
