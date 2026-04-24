import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Imports large construction / development sites from OpenStreetMap (Overpass API)
 * for a given city. Inserts them as `pending` developments tagged with source='osm'
 * so they go through the same approval workflow as user submissions.
 *
 * This endpoint lives under /api/public so cron and the Admin button can both call
 * it. It is safe to expose because:
 *  - it only writes server-side (uses supabaseAdmin)
 *  - it only inserts pending rows, never approves them
 *  - it dedupes via the unique (source, source_ref) index
 *  - it accepts only a small whitelist of city presets
 */

interface CityPreset {
  name: string;
  /** Overpass area name (matches name=* on a relation, usually the council area). */
  area: string;
  /** Lat/lng fallback bounding box if the area lookup is too narrow. */
  bbox: [number, number, number, number]; // south, west, north, east
}

const CITY_PRESETS: Record<string, CityPreset> = {
  dublin: {
    name: "Dublin",
    area: "Dublin",
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
  // Construction sites and large planned developments. Filter to ways/relations
  // (polygons) so we get an area to draw, not just a point.
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
  // Close ring
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

async function runImport(cityKey: string) {
  const preset = CITY_PRESETS[cityKey];
  if (!preset) throw new Error(`Unknown city preset: ${cityKey}`);

  // Find the first admin to attribute imports to.
  const { data: adminRow, error: adminErr } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (adminErr) throw new Error(`Admin lookup failed: ${adminErr.message}`);
  if (!adminRow) throw new Error("No admin user exists yet — sign up first.");
  const importerId = adminRow.user_id;

  const query = buildOverpassQuery(preset.bbox);
  const overpassRes = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!overpassRes.ok) {
    throw new Error(`Overpass API failed: ${overpassRes.status} ${overpassRes.statusText}`);
  }
  const json = (await overpassRes.json()) as OverpassResponse;

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
      // Duplicate (unique index) — silently skip
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

export const Route = createFileRoute("/api/public/hooks/import-osm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { city?: string } = {};
        try {
          body = (await request.json()) as { city?: string };
        } catch {
          // empty body OK
        }
        const cityKey = (body.city ?? "dublin").toLowerCase();
        if (!CITY_PRESETS[cityKey]) {
          return new Response(JSON.stringify({ error: `Unknown city: ${cityKey}` }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await runImport(cityKey);
          return new Response(JSON.stringify({ success: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error("OSM import failed:", msg);
          return new Response(JSON.stringify({ success: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
