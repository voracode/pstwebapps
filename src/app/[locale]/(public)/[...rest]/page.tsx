import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { robots: { index: false } };

/** Unknown public URLs render the localized 404 inside the site layout. */
export default function CatchAll() {
  notFound();
}
