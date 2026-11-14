"use client";

import dynamic from "next/dynamic";
import type { MapPoint } from "./municipality-map";

/** Leaflet only runs in the browser and is loaded on demand. */
const MunicipalityMap = dynamic(() => import("./municipality-map"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-muted" />,
});

export function MapLoader({ points, label }: { points: MapPoint[]; label: string }) {
  return <MunicipalityMap points={points} label={label} />;
}
