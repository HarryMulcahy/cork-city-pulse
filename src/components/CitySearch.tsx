import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { PRESET_CITIES, searchCities, type City } from "@/lib/cities";
import { Loader2, MapPin, Search, ArrowUpRight } from "lucide-react";
import logoUrl from "@/assets/sitewatch-logo.png";

interface Props {
  onPick: (city: City) => void;
}

/** Two-letter region tag derived from a city's country, for the index rail. */
function regionTag(country: string): string {
  const map: Record<string, string> = {
    Ireland: "IE",
    "United Kingdom": "UK",
    France: "FR",
    Germany: "DE",
    Netherlands: "NL",
    Spain: "ES",
    Italy: "IT",
    "United States": "US",
  };
  if (map[country]) return map[country];
  const cleaned = (country || "").replace(/[^A-Za-z ]/g, "").trim();
  if (!cleaned) return "··";
  const parts = cleaned.split(/\s+/);
  const tag = parts.length > 1 ? parts[0][0] + parts[1][0] : cleaned.slice(0, 2);
  return tag.toUpperCase();
}

/**
 * Subtle skyline silhouette + a lit construction crane, anchored to the base of
 * the navy cover. Pure inline SVG, no assets. Kept low-contrast so it reads as
 * atmosphere behind the headline — the city "rising" from the ground line —
 * without competing with the search field. Decorative only.
 */
function SkylineBase() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-44 overflow-hidden lg:block"
    >
      <div className="sw-horizon absolute inset-x-0 bottom-0 h-40" />
      <svg
        className="sw-skyline absolute bottom-0 left-0 h-44 w-full"
        viewBox="0 0 1440 300"
        preserveAspectRatio="xMidYMax slice"
        fill="none"
      >
        <g fill="#0d1a28">
          <rect x="0" y="150" width="120" height="150" />
          <rect x="132" y="96" width="84" height="204" />
          <rect x="228" y="180" width="104" height="120" />
          <rect x="344" y="60" width="70" height="240" />
          <rect x="430" y="150" width="120" height="150" />
          <rect x="566" y="118" width="76" height="182" />
          <rect x="660" y="196" width="118" height="104" />
          <rect x="792" y="80" width="78" height="220" />
          <rect x="884" y="164" width="112" height="136" />
          <rect x="1014" y="128" width="74" height="172" />
          <rect x="1102" y="200" width="120" height="100" />
          <rect x="1236" y="120" width="96" height="180" />
          <rect x="1344" y="176" width="96" height="124" />
        </g>
        {/* a topping-out cap in construction-yellow on the hero tower */}
        <rect x="344" y="54" width="70" height="7" fill="#ffcc00" opacity="0.6" />
        {/* construction crane — the signature accent */}
        <g stroke="#ffcc00" strokeLinecap="round" fill="none" opacity="0.55">
          <line x1="960" y1="44" x2="960" y2="300" strokeWidth="3" />
          <line x1="876" y1="56" x2="1076" y2="56" strokeWidth="3" />
          <line x1="960" y1="44" x2="922" y2="56" strokeWidth="2" />
          <line x1="960" y1="44" x2="1040" y2="56" strokeWidth="2" />
          <line x1="1050" y1="56" x2="1050" y2="128" strokeWidth="1.5" opacity="0.8" />
        </g>
        <circle className="sw-beacon" cx="960" cy="40" r="4.5" fill="#ffcc00" />
      </svg>
      {/* scrim so the search/headline stay legible over the silhouette */}
      <div className="absolute inset-0 bg-gradient-to-t from-transparent via-[#16273a]/45 to-[#16273a]" />
    </div>
  );
}

export function CitySearch({ onPick }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced live search — behaviour preserved exactly.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    const ac = new AbortController();
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const found = await searchCities(q, ac.signal);
        setResults(found);
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setError("Couldn't reach the search service. Try a city from the index.");
        }
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      ac.abort();
      clearTimeout(handle);
    };
  }, [query]);

  const isSearching = query.trim().length >= 2;
  const showResults = isSearching && results.length > 0;
  const noMatches = isSearching && !loading && !error && results.length === 0;

  // Stable folio numbers for the index (01, 02, …).
  const indexed = useMemo(
    () =>
      PRESET_CITIES.map((c, i) => ({
        city: c,
        folio: String(i + 1).padStart(2, "0"),
        region: regionTag(c.country),
      })),
    [],
  );

  return (
    <div className="sw-enter min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:overflow-hidden">
      {/* ───────────────── COVER (navy) ───────────────── */}
      <section className="scroll-slim relative flex min-h-[85vh] flex-col overflow-hidden bg-[#16273a] px-6 pb-10 pt-10 sm:px-10 lg:h-screen lg:min-h-0 lg:overflow-y-auto lg:px-14 lg:pb-44 lg:pt-14">
        {/* faint architectural grid, purely atmospheric */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(120% 90% at 15% 0%, black 30%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(120% 90% at 15% 0%, black 30%, transparent 78%)",
          }}
        />
        <SkylineBase />

        {/* masthead */}
        <header className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logoUrl}
              alt="SiteWatch"
              width={40}
              height={40}
              className="size-9 rounded-[6px] bg-white p-[3px] shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
            />
            <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-[-0.01em] text-white">
              SiteWatch
            </span>
          </div>
        </header>

        {/* headline block, ranged left, huge scale contrast */}
        <div className="relative z-10 mt-auto pt-16 lg:pt-0">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-[#ffcc00]" aria-hidden="true" />
            <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[#9fb1c4]">
              A living record of the skyline
            </p>
          </div>

          <h1 className="sw-headline mt-6 font-[family-name:var(--font-display)] text-[clamp(3rem,8.5vw,5.5rem)] font-semibold leading-[0.9] tracking-[-0.035em] text-white">
            See your
            <br />
            city{" "}
            <span className="relative inline-block">
              rise
              <span
                aria-hidden="true"
                className="sw-underline absolute -bottom-1 left-0 h-[3px] w-full bg-[#ffcc00]"
              />
            </span>
            .
          </h1>

          <p className="mt-7 max-w-[40ch] text-pretty text-[15px] leading-relaxed text-[#c3d0dd]">
            Track every tower, bridge and block as it goes up — dated photo diaries,
            milestones, before-and-afters and the specs that matter. Choose a city to
            open its file.
          </p>
        </div>

        {/* the single hero action */}
        <div className="relative z-10 mt-10 lg:mt-12">
          <label
            htmlFor="city-search"
            className="mb-3 block font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-[#8ea3b8]"
          >
            Open a city file
          </label>

          <div className="group relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-1/2 size-5 -translate-y-1/2 text-[#8ea3b8] transition-colors group-focus-within:text-[#ffcc00]"
            />
            <Input
              id="city-search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any city worldwide…"
              aria-label="Search for a city"
              className="h-14 rounded-none border-0 border-b-2 border-white/25 bg-transparent pl-9 pr-10 text-lg text-white shadow-none placeholder:text-[#8ea3b8] focus-visible:border-[#ffcc00] focus-visible:ring-2 focus-visible:ring-[#ffcc00]/60"
            />
            {loading && (
              <Loader2
                aria-hidden="true"
                className="absolute right-1 top-1/2 size-5 -translate-y-1/2 animate-spin text-[#ffcc00]"
              />
            )}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-[#ffb4a8]">
              {error}
            </p>
          )}
          {noMatches && (
            <p className="mt-3 text-sm text-[#9fb1c4]">
              No cities matched “{query.trim()}”. Try the index on the right.
            </p>
          )}

          {/* live results — a dossier list, not a dropdown card */}
          {showResults && (
            <ul className="scroll-slim mt-4 max-h-64 divide-y divide-white/10 overflow-y-auto pr-1">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onPick(c)}
                    className="group/row flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-white/[0.04] focus-visible:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#ffcc00]"
                  >
                    <MapPin aria-hidden="true" className="size-4 shrink-0 text-[#ffcc00]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-white">
                        {c.name}
                      </span>
                      {c.country && (
                        <span className="block truncate text-xs text-[#9fb1c4]">{c.country}</span>
                      )}
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-4 shrink-0 -translate-x-1 text-[#8ea3b8] opacity-0 transition-all group-hover/row:translate-x-0 group-hover/row:opacity-100"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ───────────────── INDEX (off-white) ───────────────── */}
      <aside className="scroll-slim relative flex flex-col border-t border-border bg-background px-6 py-10 sm:px-10 lg:h-screen lg:overflow-y-auto lg:border-l lg:border-t-0 lg:px-12 lg:py-14">
        <div className="flex items-baseline justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.02em] text-foreground">
            City Index
          </h2>
          <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {indexed.length} in&nbsp;record
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
          <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Popular cities
          </span>
        </div>

        <ul className="mt-2">
          {indexed.map(({ city, folio, region }) => (
            <li key={city.id}>
              <button
                onClick={() => onPick(city)}
                className="group/idx flex w-full items-baseline gap-4 border-b border-border py-4 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:gap-5"
              >
                <span className="w-7 shrink-0 font-[family-name:var(--font-mono)] text-[13px] tabular-nums text-muted-foreground transition-colors group-hover/idx:text-[#946f00]">
                  {folio}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-[family-name:var(--font-display)] text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-2xl">
                    {city.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                    {city.country}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="hidden shrink-0 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.12em] text-muted-foreground sm:inline"
                >
                  {region}
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-5 shrink-0 self-center text-muted-foreground opacity-0 transition-all group-hover/idx:-translate-y-0.5 group-hover/idx:translate-x-0.5 group-hover/idx:text-[#946f00] group-hover/idx:opacity-100"
                />
              </button>
            </li>
          ))}
        </ul>

        {/* colophon / attribution — reads like a page footer */}
        <footer className="mt-auto pt-10">
          <div className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Tallest · Most active · Newest — ranked per city
            </p>
            <p className="text-[11px] text-muted-foreground">
              City search powered by{" "}
              <span className="text-foreground/70">OpenStreetMap Nominatim</span>
            </p>
          </div>
        </footer>
      </aside>
    </div>
  );
}
