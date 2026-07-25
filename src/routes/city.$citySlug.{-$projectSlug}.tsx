import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "./index";
import { projectSlug, projectSlugIdTail, PRESET_CITIES, citySlug, slugify } from "@/lib/cities";

interface ProjectMeta {
  title: string;
  description: string;
  image: string | null;
}

/**
 * Resolve a project from its `<title>-<6hex>` slug, server-side, so shared links unfurl
 * with real title/description/image. The 6-hex tail is the start of the UUID, so we match
 * it with an indexed uuid range query (validated against the live PostgREST API) rather
 * than scanning the table, then disambiguate on the full slug.
 */
async function resolveProject(slug: string): Promise<ProjectMeta | null> {
  const tail = projectSlugIdTail(slug);
  if (!tail) return null;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) return null;
  const lo = `${tail}00-0000-0000-0000-000000000000`;
  const hi = `${tail}ff-ffff-ffff-ffff-ffffffffffff`;
  const endpoint =
    `${url}/rest/v1/developments?select=id,title,description,images` +
    `&approval_status=eq.approved&id=gte.${lo}&id=lte.${hi}`;
  try {
    const res = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      id: string;
      title: string;
      description: string | null;
      images: string[] | null;
    }>;
    if (!rows.length) return null;
    const row = rows.find((r) => projectSlug(r) === slug) ?? rows[0];
    const images = Array.isArray(row.images) ? row.images.filter((u) => typeof u === "string") : [];
    return {
      title: row.title,
      description: (row.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      image: images[0] ?? null,
    };
  } catch {
    return null;
  }
}

/** Human-friendly city name from a slug ("cork-ie" -> "Cork", "san-francisco-us" -> "San Francisco"). */
function prettyCityName(slug: string): string {
  const preset = PRESET_CITIES.find((c) => citySlug(c) === slug);
  if (preset) return preset.name;
  const parts = slug.split("-");
  if (parts.length > 1 && /^[a-z]{2,3}$/.test(parts[parts.length - 1])) parts.pop();
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ") || "your city";
}

function ogMeta(title: string, description: string, image: string | null) {
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: image ? "article" : "website" },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    ...(image
      ? [
          { property: "og:image", content: image },
          { name: "twitter:image", content: image },
        ]
      : []),
  ];
}

export const Route = createFileRoute("/city/$citySlug/{-$projectSlug}")({
  loader: async ({ params }) => {
    const slug = params.projectSlug;
    return { project: slug ? await resolveProject(slug) : null };
  },
  head: ({ loaderData, params }) => {
    const project = loaderData?.project;
    if (project) {
      return {
        meta: ogMeta(
          `${project.title} · SiteWatch`,
          project.description || `A development tracked on SiteWatch.`,
          project.image,
        ),
      };
    }
    const city = prettyCityName(params.citySlug ?? "");
    return {
      meta: ogMeta(
        `Developments in ${city} · SiteWatch`,
        `Track, submit and discuss construction and planning developments in ${city} on SiteWatch.`,
        null,
      ),
    };
  },
  component: CityRoute,
});

function CityRoute() {
  const { citySlug: cSlug, projectSlug: pSlug } = Route.useParams();
  return <HomePage routeCitySlug={cSlug} routeProjectSlug={pSlug} />;
}
