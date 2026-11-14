"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import { Link } from "@/i18n/navigation";

export interface MapPoint {
  slug: string;
  name: string;
  capital: string | null;
  latitude: number;
  longitude: number;
  detailLabel: string;
  subtitle?: string;
}

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Timor-Leste incl. Oe-Cusse and Ataúro. */
const BOUNDS: [[number, number], [number, number]] = [
  [-9.55, 124.0],
  [-8.1, 127.4],
];

export default function MunicipalityMap({ points, label }: { points: MapPoint[]; label: string }) {
  return (
    <MapContainer
      bounds={BOUNDS}
      maxBounds={[
        [-10.5, 123.0],
        [-7.3, 128.5],
      ]}
      minZoom={7}
      scrollWheelZoom={false}
      className="size-full"
      aria-label={label}
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      {points.map((p) => (
        <CircleMarker
          key={p.slug}
          center={[p.latitude, p.longitude]}
          radius={9}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#d91c1f", fillOpacity: 0.95 }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            {p.name}
          </Tooltip>
          <Popup>
            <div className="min-w-40 space-y-1">
              <p className="font-display text-lg font-bold leading-tight">{p.name}</p>
              {p.subtitle && <p className="!m-0 text-xs text-slate-500">{p.subtitle}</p>}
              <Link href={`/municipalities/${p.slug}`} className="inline-block text-sm font-semibold !text-pst-red">
                {p.detailLabel} →
              </Link>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
