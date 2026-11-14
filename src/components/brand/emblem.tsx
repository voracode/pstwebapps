import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/** Official PST emblem (circular). */
export function Emblem({ size = 48, className, priority }: { size?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src={size <= 192 ? "/brand/emblem-192.png" : "/brand/emblem.png"}
      alt="Emblema PST"
      width={size}
      height={size}
      priority={priority}
      className={cn("rounded-full", className)}
    />
  );
}

/** Small row of three gold stars — a recurring motif from the emblem. */
export function Stars({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex gap-1 text-pst-gold", className)}>
      ★<span className="text-[0.8em]">★</span>★
    </span>
  );
}
