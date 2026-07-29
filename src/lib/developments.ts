import { CATEGORIES, STATUSES, type Category, type Status } from "@/lib/constants";
import type { City } from "@/lib/cities";

/**
 * Shared domain types + display helpers for developments.
 *
 * Extracted from routes/index.tsx so the map page, the sidebar, and the
 * detail panel can all share one source of truth without circular imports.
 */

export type LatLng = { lat: number; lng: number };
export type ShapeKind = "polygon" | "line";

export interface ShapeData {
  shape: ShapeKind;
  points: LatLng[];
}

/**
 * Older rows store area_geojson as a bare array of {lat,lng}.
 * Newer rows store {type, points}. This normalises both.
 */
export function parseShape(raw: unknown): ShapeData | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const pts = raw.filter(
      (p): p is LatLng =>
        !!p && typeof (p as LatLng).lat === "number" && typeof (p as LatLng).lng === "number",
    );
    if (pts.length < 2) return null;
    return { shape: "polygon", points: pts };
  }
  if (typeof raw === "object") {
    const obj = raw as { type?: string; points?: unknown };
    const pts = Array.isArray(obj.points)
      ? (obj.points as unknown[]).filter(
          (p): p is LatLng =>
            !!p &&
            typeof (p as LatLng).lat === "number" &&
            typeof (p as LatLng).lng === "number",
        )
      : [];
    if (pts.length < 2) return null;
    const shape: ShapeKind = obj.type === "line" ? "line" : "polygon";
    return { shape, points: pts };
  }
  return null;
}

export interface Development {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: Category;
  status: Status;
  latitude: number;
  longitude: number;
  address: string | null;
  area: ShapeData | null;
  images: string[];
  created_at: string;
  approval_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  source: string;
  source_ref: string | null;
  height_m: number | null;
  floor_count: number | null;
  architect: string | null;
  developer: string | null;
  completion_year: number | null;
  last_activity_at: string;
  comments_count: number;
  profiles?: { display_name: string } | null;
}

export interface Comment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  profiles?: { display_name: string } | null;
}

export const STATUS_COLORS: Record<Status, string> = {
  proposed: "bg-muted text-muted-foreground",
  planning: "bg-secondary text-secondary-foreground",
  approved: "bg-primary/15 text-primary",
  under_construction: "bg-primary text-primary-foreground",
  completed: "bg-foreground text-background",
  rejected: "bg-destructive/15 text-destructive",
};

export function statusLabel(s: Status) {
  return STATUSES.find((x) => x.value === s)?.label ?? s;
}
export function categoryLabel(c: Category) {
  return CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

/** Bounding-box check so we only show developments inside the current city. */
export function inBounds(lat: number, lng: number, b: City["bounds"]) {
  return lat >= b[0][0] && lat <= b[1][0] && lng >= b[0][1] && lng <= b[1][1];
}

export function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}
