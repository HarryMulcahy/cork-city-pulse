// Server-only OSM import logic. Used by both the public cron route and the
// admin-triggered server function. NEVER import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface CityPreset {
  name: string;
  bbox: [number, number, number, number]; // south, west, north, east
}

export const CITY_PRESETS: Record<string, CityPreset> = {
  dublin: {
    name: "Dublin",
    bbox: [53.27, -6.42, 53.43, -6.08],
  },
};

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function classifyCategory(tags: Record<string, string>): string {
  const building = tags.building ?? "";
  const construction = tags["construction"] ?? tags["construction:building"] ?? "";
  const landuse = tags.landuse ?? "";
  const railway = tags.railway ?? "";
  const highway = tags.highway ?? "";

  if (railway || highway || landuse === "railway") return "infrastructure";
  if (
    building === "residential" ||
    building === "apartments" ||
    building === "house" ||
    construction === "residential" ||
    construction === "apartments"
  )
    return "residential";
  if (
    building === "commercial" ||
    building === "office" ||
    building === "retail" ||
    construction === "commercial" ||
    construction === "office"
  )
    return "commercial";
  if (landuse === "construction") return "mixed_use";
  return "other";
}

function buildOverpassQuery(bbox: [number, number, number, number]): string {
  const [s, w, n, e] = bbox;
  return `
    [out:json][timeout:60];
    (
      way["landuse"="construction"](${s},${w},${n},${e});
      relation["landuse"="construction"](${s},${w},${n},${e});
      way["building"="construction"](${s},${w},${n},${e});
      way["construction"](${s},${w},${n},${e});
      relation["construction"](${s},${w},${n},${e});
    );
    out tags center geom 400;
  `;
}

function polygonFromGeometry(
  geometry: Array<{ lat: number; lon: number }>,
): { type: "Polygon"; coordinates: number[][][] } | null {
  if (!geometry || geometry.length < 3) return null;
  const ring = geometry.map((p) => [p.lon, p.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
  return { type: "Polygon", coordinates: [ring] };
}

function centerFromGeometry(geometry?: Array<{ lat: number; lon: number }>): { lat: number; lon: number } | null {
  if (!geometry?.length) return null;
  const totals = geometry.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lon: acc.lon + point.lon }),
    { lat: 0, lon: 0 },
  );
  return { lat: totals.lat / geometry.length, lon: totals.lon / geometry.length };
}

function titleFor(tags: Record<string, string>, fallback: string): string {
  const name = tags.name || tags["name:en"] || tags.operator || tags.addr_street;
  if (name) return name.slice(0, 120);
  const kind =
    tags.building === "construction" || tags.landuse === "construction"
      ? "Construction site"
      : tags.construction
        ? `${tags.construction.replace(/_/g, " ")} construction`
        : "Development site";
  return `${kind} — ${fallback}`;
}

function descriptionFor(tags: Record<string, string>, scaleNote?: string): string {
  const bits: string[] = [];
  if (tags.description) bits.push(tags.description);
  if (tags.operator) bits.push(`Operator: ${tags.operator}`);
  if (tags.start_date) bits.push(`Start: ${tags.start_date}`);
  if (tags.opening_date) bits.push(`Opening: ${tags.opening_date}`);
  if (tags["building:levels"]) bits.push(`${tags["building:levels"]} levels`);
  if (scaleNote) bits.push(scaleNote);
  bits.push("Imported automatically from OpenStreetMap. Pending review by a moderator.");
  return bits.join("\n\n");
}

export interface ImportResult {
  city: string;
  fetched: number;
  inserted: number;
  skipped: number;
  skippedSmall: number;
  failed: number;
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function fetchOverpassJson(query: string): Promise<OverpassResponse> {
  const errors: string[] = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const overpassRes = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
          Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        },
        body: query,
      });
      const contentType = overpassRes.headers.get("content-type") ?? "";
      const raw = await overpassRes.text();
      if (!overpassRes.ok) {
        errors.push(`${endpoint}: ${overpassRes.status} ${overpassRes.statusText}`);
        continue;
      }
      if (!contentType.includes("json")) {
        errors.push(`${endpoint}: unexpected content type ${contentType || "unknown"}`);
        continue;
      }
      return JSON.parse(raw) as OverpassResponse;
    } catch (err) {
      errors.push(`${endpoint}: ${err instanceof Error ? err.message : "request failed"}`);
    }
  }
  throw new Error(`Overpass API failed: ${errors.join("; ")}`);
}

/**
 * Significance filter — SiteWatch focuses on large-scale / notable projects, not every
 * house-scale build that OSM tags as "construction". Tune these thresholds to taste:
 * raise them to be stricter (fewer, bigger projects), lower them to include more.
 */
const MIN_POLYGON_AREA_M2 = 2500; // ~0.25 ha: excludes individual houses & small buildings
const MIN_BUILDING_LEVELS = 4; // keep mid-rise+ towers even on a small footprint
const MIN_LINE_LENGTH_M = 800; // keep major road/rail/cycle routes, drop short segments

function ringIsClosed(geometry?: Array<{ lat: number; lon: number }>): boolean {
  if (!geometry || geometry.length < 4) return false;
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  return first.lat === last.lat && first.lon === last.lon;
}

/** Approximate area (m²) of a lat/lon ring via an equirectangular projection + shoelace. */
function polygonAreaM2(geometry?: Array<{ lat: number; lon: number }>): number {
  if (!geometry || geometry.length < 3) return 0;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((geometry[0].lat * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < geometry.length; i++) {
    const a = geometry[i];
    const b = geometry[(i + 1) % geometry.length];
    const ax = a.lon * mPerDegLon;
    const ay = a.lat * mPerDegLat;
    const bx = b.lon * mPerDegLon;
    const by = b.lat * mPerDegLat;
    sum += ax * by - bx * ay;
  }
  return Math.abs(sum) / 2;
}

/** Approximate length (m) of a lat/lon polyline. */
function lineLengthM(geometry?: Array<{ lat: number; lon: number }>): number {
  if (!geometry || geometry.length < 2) return 0;
  const mPerDegLat = 111320;
  let total = 0;
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1];
    const b = geometry[i];
    const mPerDegLon = 111320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    const dx = (b.lon - a.lon) * mPerDegLon;
    const dy = (b.lat - a.lat) * mPerDegLat;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

function parseLevels(tags: Record<string, string>): number {
  const raw = tags["building:levels"] ?? tags["building:levels:aboveground"] ?? "";
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Decide whether an OSM element is a large-scale / notable development worth importing.
 * Returns whether to keep it and a short scale note surfaced in the description for reviewers.
 */
function assessSignificance(
  el: OverpassElement,
  tags: Record<string, string>,
): { keep: boolean; note?: string } {
  // Multipolygon relations are aggregated development sites — inherently notable.
  if (el.type === "relation") return { keep: true, note: "Scale: multi-part development site" };

  const levels = parseLevels(tags);
  if (levels >= MIN_BUILDING_LEVELS) return { keep: true, note: `Scale: ${levels} storeys` };

  const geom = el.geometry;
  if (ringIsClosed(geom)) {
    const area = Math.round(polygonAreaM2(geom));
    if (area >= MIN_POLYGON_AREA_M2) return { keep: true, note: `Scale: ~${area.toLocaleString()} m² footprint` };
    return { keep: false };
  }

  // Open way = a line (road / rail / cycleway under construction).
  const len = Math.round(lineLengthM(geom));
  if (len >= MIN_LINE_LENGTH_M) return { keep: true, note: `Scale: ~${len.toLocaleString()} m route` };
  return { keep: false };
}

export async function runOsmImport(cityKey: string, importerId: string): Promise<ImportResult> {
  const preset = CITY_PRESETS[cityKey];
  if (!preset) throw new Error(`Unknown city preset: ${cityKey}`);

  const query = buildOverpassQuery(preset.bbox);
  const json = await fetchOverpassJson(query);

  let inserted = 0;
  let skipped = 0;
  let skippedSmall = 0;
  let failed = 0;

  for (const el of json.elements) {
    if (el.type === "node") continue;
    const tags = el.tags ?? {};

    // Only import large-scale / notable projects, not every tagged construction site.
    const significance = assessSignificance(el, tags);
    if (!significance.keep) {
      skippedSmall++;
      continue;
    }

    const center = el.center ?? (el.lat && el.lon ? { lat: el.lat, lon: el.lon } : null) ?? centerFromGeometry(el.geometry);
    if (!center) {
      skipped++;
      continue;
    }
    const sourceRef = `${el.type}/${el.id}`;
    const polygon = el.geometry ? polygonFromGeometry(el.geometry) : null;

    const { error } = await supabaseAdmin.from("developments").insert({
      user_id: importerId,
      title: titleFor(tags, preset.name),
      description: descriptionFor(tags, significance.note),
      category: classifyCategory(tags) as
        | "residential"
        | "commercial"
        | "infrastructure"
        | "public_space"
        | "mixed_use"
        | "other",
      status: "under_construction",
      latitude: center.lat,
      longitude: center.lon,
      address: tags["addr:full"] ?? tags["addr:street"] ?? preset.name,
      area_geojson: polygon,
      images: [],
      approval_status: "pending",
      source: "osm",
      source_ref: sourceRef,
    });
    if (error) {
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        skipped++;
      } else {
        failed++;
        console.error("Import insert failed:", error.message, sourceRef);
      }
    } else {
      inserted++;
    }
  }

  return {
    city: preset.name,
    fetched: json.elements.length,
    inserted,
    skipped,
    skippedSmall,
    failed,
  };
}

/** Look up the first admin user (used as the attribution for cron-triggered imports). */
export async function getFirstAdminId(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Admin lookup failed: ${error.message}`);
  if (!data) throw new Error("No admin user exists yet — sign up first.");
  return data.user_id;
}
