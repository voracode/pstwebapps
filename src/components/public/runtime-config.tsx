"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Public settings read on the server at request time and handed to client
 * components. `process.env.NEXT_PUBLIC_*` in client code is frozen at
 * `next build`, and the Docker image is built without an env file, so these
 * values must travel through React context instead.
 */
export interface PublicRuntimeConfig {
  turnstileSiteKey: string;
  mapTileUrl: string;
  mapAttribution: string;
}

export const DEFAULT_PUBLIC_CONFIG: PublicRuntimeConfig = {
  turnstileSiteKey: "",
  mapTileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  mapAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

const Ctx = createContext<PublicRuntimeConfig>(DEFAULT_PUBLIC_CONFIG);

export function PublicConfigProvider({ value, children }: { value: PublicRuntimeConfig; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePublicConfig(): PublicRuntimeConfig {
  return useContext(Ctx);
}
