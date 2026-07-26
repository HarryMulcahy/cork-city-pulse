import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CATEGORIES, CATEGORY_COLORS, type Category } from "@/lib/constants";
import { MapPin, Plus, Bell, Home, Building2, TrainFront, Trees, LayoutGrid } from "lucide-react";
import type { ComponentType } from "react";

const CATEGORY_ICON: Record<Category, ComponentType<{ className?: string }>> = {
  residential: Home,
  commercial: Building2,
  infrastructure: TrainFront,
  public_space: Trees,
  mixed_use: LayoutGrid,
  other: MapPin,
};

/** Category colour key — reused in the onboarding dialog and the on-map legend. */
export function CategoryLegend({ compact = false }: { compact?: boolean }) {
  return (
    <ul className={`grid ${compact ? "grid-cols-2 gap-1.5" : "grid-cols-2 sm:grid-cols-3 gap-2"}`}>
      {CATEGORIES.map((c) => {
        const Icon = CATEGORY_ICON[c.value];
        const color = CATEGORY_COLORS[c.value];
        return (
          <li key={c.value} className="flex items-center gap-2 text-xs">
            <span
              className="inline-flex items-center justify-center size-5 rounded-full shrink-0 text-white"
              style={{ backgroundColor: color }}
            >
              <Icon className="size-3" />
            </span>
            <span className="text-foreground/80 truncate">{c.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface Step {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}
const STEPS: Step[] = [
  {
    icon: MapPin,
    title: "Browse",
    body: "Colour-coded pins mark projects by type. Tap one to see details, photos and the discussion.",
  },
  {
    icon: Plus,
    title: "Contribute",
    body: "Hit “Submit a development”, search an address or tap the map, and add a few details.",
  },
  {
    icon: Bell,
    title: "Follow",
    body: "Follow a project to be notified when its status changes or someone comments.",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  cityName?: string;
}

export function Onboarding({ open, onClose, cityName }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[1200] max-h-[90vh] overflow-y-auto scroll-slim sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            Welcome to Site<span className="text-accent-foreground">Watch</span>
          </DialogTitle>
          <DialogDescription>
            Track, discuss and help shape the developments reshaping{" "}
            {cityName ? <span className="font-semibold text-foreground">{cityName}</span> : "your city"}.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 mt-1">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex items-center justify-center size-9 rounded-md bg-secondary text-primary shrink-0">
                <s.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-muted-foreground">{i + 1}</span>
                  {s.title}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-2 rounded-md border border-border bg-secondary/40 p-3">
          <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
            Pin colours
          </p>
          <CategoryLegend />
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          New submissions are reviewed by a moderator before they appear on the public map.
        </p>

        <Button onClick={onClose} className="btn-cta w-full h-11 rounded-md">
          Explore the map
        </Button>
      </DialogContent>
    </Dialog>
  );
}
