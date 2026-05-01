export interface City {
  id: string;
  name: string;
  country: string;
  /** [lat, lng] */
  center: [number, number];
  /** Bounding box [[southLat, westLng], [northLat, eastLng]] used to constrain the map. */
  bounds: [[number, number], [number, number]];
}

/** URL-safe slug, lowercase, dash-separated. Falls back to "untitled". */
export function slugify(input: string): string {
  return (
    (input || "")
      .toString()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled"
  );
}

/** Slug for a city — name + country code suffix when available. */
export function citySlug(city: { name: string; country?: string; id?: string }): string {
  const base = slugify(city.name);
  // For preset cities we keep the existing `<name>-<cc>` shape (cork-ie etc.).
  if (city.id && /-[a-z]{2,3}$/.test(city.id)) {
    return slugify(city.id);
  }
  return base;
}

/** Slug for a development — title + 6-char id suffix to guarantee uniqueness. */
export function projectSlug(dev: { id: string; title: string }): string {
  const base = slugify(dev.title);
  const tail = dev.id.replace(/-/g, "").slice(0, 6);
  return `${base}-${tail}`;
}

/** Extracts the trailing 6-char id fragment from a project slug. */
export function projectSlugIdTail(slug: string): string | null {
  const m = /-([a-f0-9]{6})$/i.exec(slug);
  return m ? m[1].toLowerCase() : null;
}

/** Popular preset cities so users can get started without a network request. */
export const PRESET_CITIES: City[] = [
  {
    id: "cork-ie",
    name: "Cork",
    country: "Ireland",
    center: [51.8985, -8.4756],
    bounds: [
      [51.83, -8.6],
      [51.95, -8.34],
    ],
  },
  {
    id: "dublin-ie",
    name: "Dublin",
    country: "Ireland",
    center: [53.3498, -6.2603],
    bounds: [
      [53.27, -6.42],
      [53.43, -6.08],
    ],
  },
  {
    id: "london-uk",
    name: "London",
    country: "United Kingdom",
    center: [51.5074, -0.1278],
    bounds: [
      [51.34, -0.51],
      [51.69, 0.33],
    ],
  },
  {
    id: "paris-fr",
    name: "Paris",
    country: "France",
    center: [48.8566, 2.3522],
    bounds: [
      [48.78, 2.22],
      [48.92, 2.47],
    ],
  },
  {
    id: "berlin-de",
    name: "Berlin",
    country: "Germany",
    center: [52.52, 13.405],
    bounds: [
      [52.34, 13.09],
      [52.68, 13.76],
    ],
  },
  {
    id: "amsterdam-nl",
    name: "Amsterdam",
    country: "Netherlands",
    center: [52.3676, 4.9041],
    bounds: [
      [52.28, 4.73],
      [52.43, 5.07],
    ],
  },
  {
    id: "nyc-us",
    name: "New York",
    country: "United States",
    center: [40.7128, -74.006],
    bounds: [
      [40.49, -74.27],
      [40.92, -73.68],
    ],
  },
  {
    id: "sf-us",
    name: "San Francisco",
    country: "United States",
    center: [37.7749, -122.4194],
    bounds: [
      [37.7, -122.53],
      [37.84, -122.34],
    ],
  },
];

const STORAGE_KEY = "city-builds:selected-city-v1";

export function loadSavedCity(): City | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as City;
    if (!parsed?.center || !parsed?.bounds) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCity(city: City) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(city));
  } catch {
    // ignore
  }
}

export function clearSavedCity() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  boundingbox: [string, string, string, string]; // [south, north, west, east]
  address?: { country?: string; city?: string; town?: string; village?: string; state?: string };
}

/**
 * Search for cities using OpenStreetMap's Nominatim service.
 * Free, no API key required. Be polite with usage.
 */
export async function searchCities(query: string, signal?: AbortSignal): Promise<City[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "8");
  url.searchParams.set("featuretype", "city");

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as NominatimResult[];

  return data
    .filter((r) => {
      // Keep things that look like populated places
      if (r.class === "boundary" && r.type === "administrative") return true;
      if (r.class === "place") return true;
      return false;
    })
    .map((r) => {
      const lat = parseFloat(r.lat);
      const lon = parseFloat(r.lon);
      const [south, north, west, east] = r.boundingbox.map(parseFloat) as [
        number,
        number,
        number,
        number,
      ];
      const cityName =
        r.address?.city ||
        r.address?.town ||
        r.address?.village ||
        r.display_name.split(",")[0];
      const country = r.address?.country ?? "";
      return {
        id: `nm-${r.place_id}`,
        name: cityName,
        country,
        center: [lat, lon] as [number, number],
        bounds: [
          [south, west],
          [north, east],
        ] as [[number, number], [number, number]],
      };
    });
}
