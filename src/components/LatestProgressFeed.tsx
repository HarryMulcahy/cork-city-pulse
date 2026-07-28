import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ImageOff, TrendingUp } from "lucide-react";

const MILESTONE_LABEL: Record<string, string> = {
  foundation: "Foundation",
  core_rising: "Core rising",
  topped_out: "Topped out",
  facade: "Façade",
  completed: "Completed",
};

interface FeedItem {
  id: string;
  development_id: string;
  user_id: string;
  captured_at: string;
  created_at: string;
  caption: string | null;
  images: string[];
  milestone: string | null;
  author?: string | null;
}

interface Props {
  /** The current city's developments — scopes + labels the feed. */
  developments: { id: string; title: string }[];
  onOpen: (developmentId: string) => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function LatestProgressFeed({ developments, onOpen }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const titleById = useMemo(
    () => Object.fromEntries(developments.map((d) => [d.id, d.title])),
    [developments],
  );

  useEffect(() => {
    const ids = developments.map((d) => d.id);
    if (!ids.length) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("development_updates")
        .select("*")
        .in("development_id", ids)
        .order("created_at", { ascending: false })
        .limit(30);
      const rows = (data ?? []) as FeedItem[];
      const uids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
      let names: Record<string, string> = {};
      if (uids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", uids);
        names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]));
      }
      if (!cancelled) {
        setItems(rows.map((r) => ({ ...r, author: names[r.user_id] ?? null })));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [developments]);

  if (loading) {
    return <p className="px-5 py-8 text-center text-xs text-muted-foreground">Loading latest progress…</p>;
  }
  if (items.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-sm text-muted-foreground">
        No progress updates in this city yet. Open a project and post the first construction photo.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((u) => (
        <li key={u.id}>
          <button
            onClick={() => onOpen(u.development_id)}
            className="w-full text-left px-4 py-3 flex gap-3 hover:bg-secondary/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {u.images[0] ? (
              <img src={u.images[0]} alt="" loading="lazy" className="size-16 rounded-md object-cover shrink-0 border border-border" />
            ) : (
              <div className="size-16 rounded-md shrink-0 border border-border bg-secondary flex items-center justify-center text-muted-foreground">
                <ImageOff className="size-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold leading-tight line-clamp-1">
                  {titleById[u.development_id] ?? "A development"}
                </span>
                {u.milestone && (
                  <span
                    className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                      u.milestone === "topped_out" || u.milestone === "completed"
                        ? "bg-accent text-accent-foreground"
                        : "bg-primary/15 text-primary"
                    }`}
                  >
                    {MILESTONE_LABEL[u.milestone] ?? u.milestone}
                  </span>
                )}
              </div>
              {u.caption && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{u.caption}</p>}
              <p className="text-[11px] text-muted-foreground font-mono mt-1 flex items-center gap-1.5">
                <TrendingUp className="size-3" />
                {u.author ?? "anon"} · {timeAgo(u.created_at)}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
