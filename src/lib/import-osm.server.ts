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
    out tags center geom 200;
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

function descriptionFor(tags: Record<string, string>): string {
  const bits: string[] = [];
  if (tags.description) bits.push(tags.description);
  if (tags.operator) bits.push(`Operator: ${tags.operator}`);
  if (tags.start_date) bits.push(`Start: ${tags.start_date}`);
  if (tags.opening_date) bits.push(`Opening: ${tags.opening_date}`);
  if (tags["building:levels"]) bits.push(`${tags["building:levels"]} levels`);
  bits.push("Imported automatically from OpenStreetMap. Pending review by a moderator.");
  return bits.join("\n\n");
}

export interface ImportResult {
  city: string;
  fetched: number;
  inserted: number;
  skipped: number;
  failed: number;
}

export async function runOsmImport(cityKey: string, importerId: string): Promise<ImportResult> {
  const preset = CITY_PRESETS[cityKey];
  if (!preset) throw new Error(`Unknown city preset: ${cityKey}`);

  const query = buildOverpassQuery(preset.bbox);
  const overpassRes = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    },
    body: query,
  });
  if (!overpassRes.ok) {
    throw new Error(`Overpass API failed: ${overpassRes.status} ${overpassRes.statusText}`);
  }
  const contentType = overpassRes.headers.get("content-type") ?? "";
  const raw = await overpassRes.text();
  if (!contentType.includes("json")) {
    throw new Error(`Overpass API returned unexpected content type: ${contentType || "unknown"}`);
  }

  let json: OverpassResponse;
  try {
    json = JSON.parse(raw) as OverpassResponse;
  } catch {
    throw new Error("Overpass API returned invalid JSON");
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const el of json.elements) {
    if (el.type === "node") continue;
    const tags = el.tags ?? {};
    const center = el.center ?? (el.lat && el.lon ? { lat: el.lat, lon: el.lon } : null);
    if (!center) {
      skipped++;
      continue;
    }
    const sourceRef = `${el.type}/${el.id}`;
    const polygon = el.geometry ? polygonFromGeometry(el.geometry) : null;

    const { error } = await supabaseAdmin.from("developments").insert({
      user_id: importerId,
      title: titleFor(tags, preset.name),
      description: descriptionFor(tags),
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
