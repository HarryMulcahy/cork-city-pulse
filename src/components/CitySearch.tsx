import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESET_CITIES, searchCities, type City } from "@/lib/cities";
import { Loader2, MapPin, Search } from "lucide-react";
import logoUrl from "@/assets/sitewatch-logo.png";

interface Props {
  onPick: (city: City) => void;
}

export function CitySearch({ onPick }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced live search
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
          setError("Couldn't reach the search service. Try a preset below.");
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#16273a] via-[#1a2b3c] to-background flex flex-col relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 size-[460px] rounded-full bg-[#ffcc00]/10 blur-3xl"
      />
      <main className="relative flex-1 flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-2xl">
          {/* Brand mark */}
          <div className="flex flex-col items-center text-center mb-8">
            <img
              src={logoUrl}
              alt="SiteWatch"
              width={72}
              height={72}
              className="size-16 sm:size-[72px] rounded-md bg-white p-1 shadow-lg ring-2 ring-[#ffcc00]"
            />
            <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-[#ffcc00] font-semibold">
              SiteWatch · Citizen Planning Map
            </p>
            <h1 className="mt-2 text-4xl sm:text-5xl font-bold leading-[1.05] text-white">
              Pick a city to begin.
            </h1>
            <p className="mt-3 text-white/75 max-w-md">
              Track and discuss developments in any city. Search below or jump into a popular one.
            </p>
          </div>

          {/* Hero search container */}
          <div className="bg-card rounded-xl shadow-2xl ring-1 ring-black/5 p-5 sm:p-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a city…"
                className="pl-11 h-14 text-base sm:text-lg rounded-lg border-2 focus-visible:ring-[#ffcc00] focus-visible:border-[#ffcc00]"
                aria-label="Search for a city"
              />
              {loading && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground animate-spin" />
              )}
            </div>

            {error && (
              <p className="mt-3 text-sm text-destructive">{error}</p>
            )}

            {results.length > 0 && (
              <ul className="mt-4 rounded-lg border border-border bg-background divide-y divide-border overflow-hidden">
                {results.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => onPick(c)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-secondary transition group"
                    >
                      <MapPin className="size-4 text-primary shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold truncate group-hover:text-primary transition">
                          {c.name}
                        </span>
                        {c.country && (
                          <span className="block text-xs text-muted-foreground truncate">
                            {c.country}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {query.trim().length < 2 && (
              <div className="mt-6">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3 font-bold">
                  Popular cities
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PRESET_CITIES.map((c) => (
                    <Button
                      key={c.id}
                      variant="outline"
                      onClick={() => onPick(c)}
                      className="justify-start h-auto py-3 px-3 flex-col items-start gap-0.5 hover:border-[#ffcc00] hover:bg-[#ffcc00]/10"
                    >
                      <span className="font-bold">{c.name}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {c.country}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <footer className="px-5 py-4 text-center text-[11px] text-white/60 font-mono">
        City search powered by OpenStreetMap Nominatim
      </footer>
    </div>
  );
}
