import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { geocodeAddress, type GeocodeResult } from "@/lib/cities";
import { Loader2, Search, MapPin } from "lucide-react";

interface Props {
  /** Called with the chosen location's coordinates and its display label. */
  onPick: (lat: number, lng: number, label: string) => void;
  autoFocus?: boolean;
}

/**
 * Keyboard-accessible address/place search that geocodes via Nominatim, so a pin can be
 * placed without interacting with the map (also handy on mobile). Mirrors the debounce +
 * abort pattern used by CitySearch.
 */
export function AddressSearch({ onPick, autoFocus }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const ac = new AbortController();
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await geocodeAddress(q, ac.signal));
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") setResults([]);
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
    <div className="text-foreground">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an address or place…"
          className="pl-8 h-9 bg-background"
          aria-label="Search for an address to place the development"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
        )}
      </div>
      {results.length > 0 && (
        <ul className="mt-2 max-h-52 overflow-y-auto rounded-md border border-border bg-background divide-y divide-border">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r.lat, r.lng, r.label)}
                className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-secondary transition text-xs focus:outline-none focus-visible:bg-secondary"
              >
                <MapPin className="size-3.5 text-primary shrink-0 mt-0.5" />
                <span className="flex-1 min-w-0">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[10px] text-muted-foreground">Powered by OpenStreetMap Nominatim</p>
    </div>
  );
}
