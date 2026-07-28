import { CATEGORY_COLORS, type Category } from "@/lib/constants";
import { Building2, MessageSquare } from "lucide-react";

interface RankDev {
  id: string;
  title: string;
  category: Category;
  height_m: number | null;
  floor_count: number | null;
  comments_count: number;
}

interface Props {
  developments: RankDev[];
  onOpen: (id: string) => void;
}

/** Per-city leaderboards: a height-comparison diagram (tallest) + most-discussed. */
export function RankingsPanel({ developments, onOpen }: Props) {
  const tallest = developments
    .filter((d) => d.height_m != null)
    .sort((a, b) => (b.height_m as number) - (a.height_m as number))
    .slice(0, 10);
  const maxH = tallest[0]?.height_m ?? 1;
  const discussed = developments
    .filter((d) => d.comments_count > 0)
    .sort((a, b) => b.comments_count - a.comments_count)
    .slice(0, 8);

  return (
    <div className="p-4 space-y-6">
      <section>
        <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
          <Building2 className="size-3.5" /> Tallest
        </h3>
        {tallest.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No heights recorded yet. Add a height to a project (open it → Edit → Specifications) to
            build the ranking.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {tallest.map((d, i) => (
              <li key={d.id}>
                <button onClick={() => onOpen(d.id)} className="w-full text-left group">
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <span className="truncate font-medium group-hover:text-primary transition">
                      <span className="text-muted-foreground font-mono mr-1">{i + 1}.</span>
                      {d.title}
                    </span>
                    <span className="font-mono font-semibold shrink-0">
                      {d.height_m}m{d.floor_count ? ` · ${d.floor_count}fl` : ""}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{
                        width: `${Math.max(4, ((d.height_m as number) / maxH) * 100)}%`,
                        backgroundColor: CATEGORY_COLORS[d.category],
                      }}
                    />
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
          <MessageSquare className="size-3.5" /> Most discussed
        </h3>
        {discussed.length === 0 ? (
          <p className="text-xs text-muted-foreground">No discussion yet.</p>
        ) : (
          <ol className="divide-y divide-border rounded-md border border-border overflow-hidden">
            {discussed.map((d, i) => (
              <li key={d.id}>
                <button
                  onClick={() => onOpen(d.id)}
                  className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-secondary transition text-xs"
                >
                  <span className="truncate font-medium">
                    <span className="text-muted-foreground font-mono mr-1">{i + 1}.</span>
                    {d.title}
                  </span>
                  <span className="font-mono text-muted-foreground shrink-0 inline-flex items-center gap-1">
                    <MessageSquare className="size-3" />
                    {d.comments_count}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
