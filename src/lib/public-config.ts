import { DEFAULT_PUBLIC_CONFIG, type PublicRuntimeConfig } from "@/components/public/runtime-config";

/**
 * Reads public settings from the environment at request time (server only).
 * Bracket access with a variable key on purpose: Next.js inlines static
 * `process.env.NEXT_PUBLIC_X` reads at build time, even in server code.
 */
function runtimeEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function getPublicRuntimeConfig(): PublicRuntimeConfig {
  return {
    turnstileSiteKey: runtimeEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY") ?? DEFAULT_PUBLIC_CONFIG.turnstileSiteKey,
    mapTileUrl: runtimeEnv("NEXT_PUBLIC_MAP_TILE_URL") ?? DEFAULT_PUBLIC_CONFIG.mapTileUrl,
    mapAttribution: runtimeEnv("NEXT_PUBLIC_MAP_ATTRIBUTION") ?? DEFAULT_PUBLIC_CONFIG.mapAttribution,
  };
}
