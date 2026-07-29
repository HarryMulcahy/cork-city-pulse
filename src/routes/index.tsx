import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, lazy, Suspense, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORIES, STATUSES, CATEGORY_COLORS, type Category, type Status } from "@/lib/constants";
import { CitySearch } from "@/components/CitySearch";
import { Onboarding, CategoryLegend } from "@/components/Onboarding";
import { ProgressTimeline } from "@/components/ProgressTimeline";
import { LatestProgressFeed } from "@/components/LatestProgressFeed";
import { RankingsPanel } from "@/components/RankingsPanel";
import { AddressSearch } from "@/components/AddressSearch";
import { DevelopmentDetail } from "@/components/DevelopmentDetail";
import { DevelopmentSidebar } from "@/components/DevelopmentSidebar";
import {
  parseShape,
  inBounds,
  formatRelative,
  STATUS_COLORS,
  statusLabel,
  categoryLabel,
  type Development,
  type Comment,
  type ShapeData,
  type ShapeKind,
  type LatLng,
} from "@/lib/developments";
import { loadSavedCity, saveCity, clearSavedCity, citySlug, projectSlug, projectSlugIdTail, type City } from "@/lib/cities";
import { PRESET_CITIES } from "@/lib/cities";
import { ensureCityDiscussion } from "@/lib/city-discussion.functions";
import { toast } from "sonner";
import {
  MapPin,
  Plus,
  MessageSquare,
  X,
  Pencil,
  Undo2,
  Check,
  ImagePlus,
  Loader2,
  PanelLeftOpen,
  PanelLeftClose,
  Maximize2,
  Minimize2,
  Spline,
  Hexagon,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Trash2,
  Tag,
  Activity,
  Globe2,
  ArrowLeft,
  Search,
  ArrowUpDown,
  Bell,
  HelpCircle,
  TrendingUp,
  Building2,
  ChevronUp,
  Reply,
} from "lucide-react";

const READ_STORAGE_KEY = "city-builds:dev-reads-v1";
const ONBOARD_KEY = "sitewatch:onboarded-v1";

function loadReads(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(READ_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveReads(r: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(r));
  } catch {
    // ignore
  }
}

const CorkMap = lazy(() => import("@/components/CorkMap").then((m) => ({ default: m.CorkMap })));

type IndexSearch = { dev?: string };
export const Route = createFileRoute("/")({
  component: HomePageRoute,
  validateSearch: (search: Record<string, unknown>): IndexSearch => {
    const dev = typeof search.dev === "string" ? search.dev : undefined;
    return dev ? { dev } : {};
  },
});

function HomePageRoute() {
  const { dev } = Route.useSearch();
  return <HomePage devSearchParam={dev} />;
}


interface SubmitDraft {
  title: string;
  description: string;
  address: string;
  category: Category;
  status: Status;
  files: File[];
  previews: string[];
}
const EMPTY_DRAFT: SubmitDraft = {
  title: "",
  description: "",
  address: "",
  category: "residential",
  status: "proposed",
  files: [],
  previews: [],
};

interface HomePageProps {
  /** Legacy ?dev=<id> deep link (from review queue / submissions list). */
  devSearchParam?: string;
  /** Slug of the city in the URL, when rendered via /city/$citySlug. */
  routeCitySlug?: string;
  /** Slug of the focused project in the URL, when rendered via /city/$citySlug/$projectSlug. */
  routeProjectSlug?: string;
}

export function HomePage({ devSearchParam, routeCitySlug, routeProjectSlug }: HomePageProps = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [city, setCityState] = useState<City | null>(() => loadSavedCity());
  // Wrap setCity so picking a new city also reflects in the URL.
  const setCity = (next: City | null) => {
    setCityState(next);
    if (next) {
      saveCity(next);
      const slug = citySlug(next);
      navigate({ to: "/city/$citySlug/{-$projectSlug}", params: { citySlug: slug, projectSlug: undefined } });
    }
  };
  // Helper: navigate to a development's stacked URL.
  const openDevelopmentRoute = (d: Development | null) => {
    if (!city) {
      setSelected(d);
      return;
    }
    const cSlug = citySlug(city);
    if (d) {
      // Ensure the sidebar is visible so the detail panel can be seen
      setSidebarMode((m) => (m === "collapsed" ? "side" : m));
      navigate({
        to: "/city/$citySlug/{-$projectSlug}",
        params: { citySlug: cSlug, projectSlug: projectSlug(d) },
      });
    } else {
      navigate({
        to: "/city/$citySlug/{-$projectSlug}",
        params: { citySlug: cSlug, projectSlug: undefined },
      });
    }
  };
  const [devs, setDevs] = useState<Development[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [selected, setSelected] = useState<Development | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [pickedPoint, setPickedPoint] = useState<LatLng | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);

  // Drawing state (used by both submit + edit flows)
  const [drawMode, setDrawMode] = useState(false);
  const [drawShape, setDrawShape] = useState<ShapeKind>("polygon");
  const [drawPoints, setDrawPoints] = useState<LatLng[]>([]);
  const [pendingShape, setPendingShape] = useState<ShapeData | null>(null);
  const [drawTarget, setDrawTarget] = useState<"submit" | "edit">("submit");
  const [pickTarget, setPickTarget] = useState<"submit" | "edit">("submit");
  const [pendingPoint, setPendingPoint] = useState<LatLng | null>(null);

  // Lifted submit-form draft so closing the dialog (e.g. while drawing) doesn't lose data.
  const [draft, setDraft] = useState<SubmitDraft>(EMPTY_DRAFT);

  type SidebarMode = "collapsed" | "side" | "full";
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("side");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<"projects" | "latest" | "ranks">("projects");

  // First-run induction: show the intro once, when a user first lands on a city.
  useEffect(() => {
    if (!city) return;
    try {
      if (!localStorage.getItem(ONBOARD_KEY)) setOnboardingOpen(true);
    } catch {
      // ignore
    }
  }, [city?.id]);

  const closeOnboarding = () => {
    setOnboardingOpen(false);
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      // ignore
    }
  };
  const [reads, setReads] = useState<Record<string, string>>(() => loadReads());

  // Filters (multi-select). Empty set = "all".
  const [categoryFilter, setCategoryFilter] = useState<Set<Category>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"activity" | "newest" | "discussed" | "az">("activity");
  const toggleInSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const loadDevs = async () => {
    // No city selected yet (city-search screen) — nothing to render, so skip the fetch.
    if (!city) {
      setDevs([]);
      setInitialLoading(false);
      return;
    }
    const b = city.bounds;
    // Scope the query to the current city's bounding box server-side instead of pulling
    // every development on earth and filtering in the browser. A deep-linked (?dev=)
    // project is OR-ed in by id so shared links to an out-of-city project still resolve.
    const deepLink =
      devSearchParam && /^[0-9a-f-]{36}$/i.test(devSearchParam) ? devSearchParam : null;
    const base = supabase.from("developments").select("*").order("created_at", { ascending: false });
    const scoped = deepLink
      ? base.or(
          `id.eq.${deepLink},and(latitude.gte.${b[0][0]},latitude.lte.${b[1][0]},longitude.gte.${b[0][1]},longitude.lte.${b[1][1]})`,
        )
      : base
          .gte("latitude", b[0][0])
          .lte("latitude", b[1][0])
          .gte("longitude", b[0][1])
          .lte("longitude", b[1][1]);
    const { data, error } = await scoped;
    if (error) {
      toast.error("Failed to load developments");
      setInitialLoading(false);
      return;
    }
    type RawRow = Omit<Development, "profiles" | "area" | "images" | "last_activity_at" | "comments_count" | "approval_status" | "rejection_reason" | "source" | "source_ref"> & {
      area_geojson: unknown;
      images: string[] | null;
      approval_status?: "pending" | "approved" | "rejected" | null;
      rejection_reason?: string | null;
      source?: string | null;
      source_ref?: string | null;
    };
    const rows = (data ?? []) as RawRow[];
    // Only enrich the developments we'll actually display (the current city) with author
    // profiles and comment counts. Previously this pulled every profile and EVERY comment
    // row in the entire database on every load and after every mutation — the dominant
    // payload as data grows. Off-city rows are never rendered, so scoping is invisible.
    const visibleRows = city
      ? rows.filter((r) => inBounds(r.latitude, r.longitude, city.bounds))
      : [];

    const ids = Array.from(new Set(visibleRows.map((r) => r.user_id)));
    let profMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]));
    }

    const devIds = visibleRows.map((r) => r.id);
    const activity: Record<string, { last: string; count: number }> = {};
    if (devIds.length) {
      const { data: cs } = await supabase
        .from("comments")
        .select("development_id, created_at")
        .in("development_id", devIds);
      for (const c of cs ?? []) {
        const a = activity[c.development_id] ?? { last: "", count: 0 };
        a.count += 1;
        if (!a.last || c.created_at > a.last) a.last = c.created_at;
        activity[c.development_id] = a;
      }
    }

    const mapped: Development[] = rows.map((r) => {
      const a = activity[r.id];
      const last = a?.last && a.last > r.created_at ? a.last : r.created_at;
      return {
        ...r,
        approval_status: (r.approval_status ?? "approved") as "pending" | "approved" | "rejected",
        rejection_reason: r.rejection_reason ?? null,
        source: r.source ?? "user",
        source_ref: r.source_ref ?? null,
        area: parseShape(r.area_geojson),
        images: Array.isArray(r.images) ? r.images.filter((u): u is string => typeof u === "string") : [],
        profiles: profMap[r.user_id] ? { display_name: profMap[r.user_id] } : null,
        last_activity_at: last,
        comments_count: a?.count ?? 0,
      };
    });
    mapped.sort((a, b) => (a.last_activity_at < b.last_activity_at ? 1 : -1));
    setDevs(mapped);
    setInitialLoading(false);
  };

  useEffect(() => {
    loadDevs();
  }, []);

  // If the URL provides a city slug but our state doesn't match, try to resolve it.
  useEffect(() => {
    if (!routeCitySlug) return;
    if (city && citySlug(city) === routeCitySlug) return;
    const fromPreset = PRESET_CITIES.find((c) => citySlug(c) === routeCitySlug);
    if (fromPreset) {
      setCityState(fromPreset);
      saveCity(fromPreset);
    }
    // Else: keep whatever city is loaded (fall back to saved). The url slug will
    // be normalised next time the user picks a city from the search screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCitySlug]);

  // Ensure a "General Discussion" thread exists for the active city.
  useEffect(() => {
    if (!city) return;
    let cancelled = false;
    ensureCityDiscussion({
      data: {
        cityId: city.id,
        cityName: city.name,
        lat: city.center[0],
        lng: city.center[1],
      },
    })
      .then(() => {
        if (!cancelled) loadDevs();
      })
      .catch(() => {
        // Non-critical: city discussion will simply not appear.
      });
    return () => {
      cancelled = true;
    };
  }, [city?.id]);

  // Deep-link: open detail sheet for ?dev=<id> (used from review queue / submissions list)
  useEffect(() => {
    if (!devSearchParam) return;
    const found = devs.find((d) => d.id === devSearchParam);
    if (!found) return;
    setSelected(found);
    // If pinned dev sits outside the saved city bounds, switch the city view to fit it
    if (city && !inBounds(found.latitude, found.longitude, city.bounds)) {
      const c: City = {
        id: `dev-${found.id}`,
        name: found.title,
        country: "",
        center: [found.latitude, found.longitude],
        bounds: [
          [found.latitude - 0.05, found.longitude - 0.05],
          [found.latitude + 0.05, found.longitude + 0.05],
        ],
      };
      saveCity(c);
      setCity(c);
    }
    // Replace the legacy ?dev= URL with the canonical /city/<slug>/<project> route.
    // Pass only the name (not the synthetic `dev-<id>`) so citySlug slugifies the title
    // rather than mistaking a uuid tail for a preset country-code suffix.
    const cSlug = citySlug(city ?? { name: found.title });
    navigate({
      to: "/city/$citySlug/{-$projectSlug}",
      params: { citySlug: cSlug, projectSlug: projectSlug(found) },
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devSearchParam, devs]);

  // Resolve URL → selected (when user navigates via /city/.../<projectSlug> or hits Back)
  useEffect(() => {
    if (!routeProjectSlug) {
      // No project in URL → clear selection (covers browser Back from a project page).
      setSelected((cur) => (cur ? null : cur));
      return;
    }
    const tail = projectSlugIdTail(routeProjectSlug);
    // Prefer an exact canonical-slug match (title + id tail); only fall back to the
    // 6-char id-tail prefix if the title portion has since changed. This prevents two
    // developments that share the first 6 hex chars of their UUID from resolving to the
    // wrong project.
    const found =
      devs.find((d) => projectSlug(d) === routeProjectSlug) ??
      (tail ? devs.find((d) => d.id.replace(/-/g, "").toLowerCase().startsWith(tail)) : undefined);
    if (found) setSelected(found);
  }, [routeProjectSlug, devs]);

  // Mark a development as read when it gets opened
  useEffect(() => {
    if (!selected) return;
    setReads((prev) => {
      const next = { ...prev, [selected.id]: selected.last_activity_at };
      saveReads(next);
      return next;
    });
  }, [selected?.id, selected?.last_activity_at]);

  const cityDiscussion = useMemo(
    () =>
      city
        ? devs.find(
            (d) => d.source === "general" && d.source_ref === city.id && d.approval_status === "approved",
          ) ?? null
        : null,
    [devs, city],
  );

  const cityDevs = useMemo(
    () =>
      city
        ? devs.filter(
            (d) =>
              d.source !== "general" &&
              d.approval_status === "approved" &&
              inBounds(d.latitude, d.longitude, city.bounds),
          )
        : [],
    [devs, city],
  );

  const myPendingCount = useMemo(
    () => devs.filter((d) => d.approval_status === "pending" && d.user_id === user?.id).length,
    [devs, user?.id],
  );

  const filteredDevs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = cityDevs.filter((d) => {
      if (categoryFilter.size > 0 && !categoryFilter.has(d.category)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(d.status)) return false;
      if (q) {
        const haystack = `${d.title} ${d.description} ${d.address ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...base].sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
        case "discussed":
          return b.comments_count - a.comments_count;
        case "az":
          return a.title.localeCompare(b.title);
        case "activity":
        default:
          return a.last_activity_at < b.last_activity_at
            ? 1
            : a.last_activity_at > b.last_activity_at
              ? -1
              : 0;
      }
    });
    // Always include the currently selected dev (e.g. a pending one opened from the review queue)
    if (selected && selected.source !== "general" && !sorted.some((d) => d.id === selected.id)) {
      return [selected, ...sorted];
    }
    return sorted;
  }, [cityDevs, categoryFilter, statusFilter, selected, searchQuery, sortBy]);

  const filtersActive = categoryFilter.size > 0 || statusFilter.size > 0;

  const isUnread = (d: Development) => {
    const seen = reads[d.id];
    return !seen || seen < d.last_activity_at;
  };

  const handlePick = (lat: number, lng: number) => {
    if (pickTarget === "edit") {
      setPendingPoint({ lat, lng });
      setPickMode(false);
      const id = pendingEditId.current;
      if (id) {
        const found = devs.find((d) => d.id === id);
        if (found) setSelected(found);
      }
      return;
    }
    setPickedPoint({ lat, lng });
    setSubmitOpen(true);
    setPickMode(false);
  };

  // Keyboard-accessible alternative to tapping the map: place via a geocoded address.
  const handleAddressPick = (lat: number, lng: number, label: string) => {
    if (pickTarget === "submit") {
      setDraft((d) => (d.address.trim() ? d : { ...d, address: label.slice(0, 200) }));
    }
    handlePick(lat, lng);
  };

  const startPicking = () => {
    if (!user) {
      toast.info("Sign in to submit a development");
      return;
    }
    // Reset only when starting a brand-new submission
    setDraft(EMPTY_DRAFT);
    setPendingShape(null);
    setPickTarget("submit");
    setPickMode(true);
    setSelected(null);
    // On mobile the full-width list covers the map — reveal it so the pin can be tapped.
    if (isMobile) setSidebarMode("collapsed");
    toast("Tap anywhere on the map to drop your pin");
  };

  const startDrawing = (target: "submit" | "edit", shape: ShapeKind) => {
    setSubmitOpen(false);
    setSelected(null); // close detail sheet so the map is clear
    setDrawTarget(target);
    setDrawShape(shape);
    setDrawPoints([]);
    setDrawMode(true);
    if (shape === "line") {
      toast("Click to add waypoints · double-click or 'Finish' to complete the line");
    } else {
      toast("Click to add vertices · double-click or 'Finish' when done");
    }
  };

  const finishDrawing = () => {
    const min = drawShape === "line" ? 2 : 3;
    if (drawPoints.length < min) {
      toast.error(`Add at least ${min} points`);
      return;
    }
    setPendingShape({ shape: drawShape, points: drawPoints });
    setDrawPoints([]);
    setDrawMode(false);
    if (drawTarget === "submit") {
      setSubmitOpen(true);
    } else {
      // For edit, the SubmitForm/EditForm will read pendingShape on next open.
      // Re-open the previously-selected development sheet:
      const id = pendingEditId.current;
      if (id) {
        const found = devs.find((d) => d.id === id);
        if (found) setSelected(found);
      }
    }
  };

  const cancelDrawing = () => {
    setDrawPoints([]);
    setDrawMode(false);
    if (drawTarget === "submit") {
      setSubmitOpen(true);
    } else {
      const id = pendingEditId.current;
      if (id) {
        const found = devs.find((d) => d.id === id);
        if (found) setSelected(found);
      }
    }
  };

  // Track which dev is being edited so we can re-open its sheet after drawing.
  const pendingEditId = useMemo(() => ({ current: null as string | null }), []);

  const unreadCount = cityDevs.filter(isUnread).length;

  const handleChangeCity = () => {
    clearSavedCity();
    setCity(null);
    setSelected(null);
    setPickedPoint(null);
    setPendingShape(null);
    setSubmitOpen(false);
  };

  // CITY SEARCH SCREEN
  if (!city) {
    return (
      <CitySearch
        onPick={(c) => {
          saveCity(c);
          setCity(c);
        }}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header city={city} onChangeCity={handleChangeCity} pendingCount={myPendingCount} />
      <div className="flex-1 relative min-h-0">
        {/* Full-screen Map */}
        <main
          className={`absolute inset-0 transition-[left] duration-300 ease-out ${
            sidebarMode === "side" ? "sm:left-[440px] lg:left-[520px]" : ""
          }`}
        >
          <Suspense
            fallback={<div className="w-full h-full bg-secondary animate-pulse" />}
          >
            <CorkMap
              center={city.center}
              bounds={city.bounds}
              cityKey={city.id}
              resizeKey={sidebarMode}
              developments={filteredDevs.map((d) => ({
                id: d.id,
                latitude: d.latitude,
                longitude: d.longitude,
                title: d.title,
                category: d.category,
                area: d.area?.points ?? null,
                shape: d.area?.shape,
              }))}
              selectedId={selected?.id ?? null}
              onSelect={(id) => openDevelopmentRoute(filteredDevs.find((d) => d.id === id) ?? null)}
              pickMode={pickMode}
              pickedPoint={pickedPoint}
              pickedCategory={draft.category}
              onPick={handlePick}
              drawMode={drawMode}
              drawShape={drawShape}
              drawCategory={draft.category}
              drawPoints={drawPoints}
              onDrawPoint={(lat, lng) => setDrawPoints((prev) => [...prev, { lat, lng }])}
              onDrawFinish={finishDrawing}
            />
          </Suspense>

          {pickMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[700] w-[min(92vw,26rem)] bg-foreground text-background rounded-md shadow-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 text-sm">
                <MapPin className="size-4 shrink-0" />
                <span className="flex-1">Tap the map, or search an address</span>
                <button
                  onClick={() => setPickMode(false)}
                  className="opacity-70 hover:opacity-100"
                  aria-label="Cancel"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="bg-card p-2 border-t border-background/15">
                <AddressSearch autoFocus onPick={handleAddressPick} />
              </div>
            </div>
          )}

          {drawMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-foreground text-background px-3 py-2 rounded-md shadow-lg flex items-center gap-2 text-sm flex-wrap justify-center max-w-[95vw]">
              {drawShape === "line" ? <Spline className="size-4" /> : <Hexagon className="size-4" />}
              <span className="hidden sm:inline" role="status" aria-live="polite">
                {drawPoints.length < (drawShape === "line" ? 2 : 3)
                  ? `Add ${(drawShape === "line" ? 2 : 3) - drawPoints.length} more point${(drawShape === "line" ? 2 : 3) - drawPoints.length === 1 ? "" : "s"}`
                  : `${drawPoints.length} points · double-click to finish`}
              </span>
              <span className="sm:hidden font-mono text-xs" role="status" aria-live="polite">{drawPoints.length} pts</span>
              <button
                onClick={() => setDrawPoints((p) => p.slice(0, -1))}
                disabled={drawPoints.length === 0}
                className="ml-1 px-2 py-1 rounded hover:bg-background/15 disabled:opacity-40 flex items-center gap-1 text-xs"
              >
                <Undo2 className="size-3.5" /> Undo
              </button>
              <button
                onClick={finishDrawing}
                disabled={drawPoints.length < (drawShape === "line" ? 2 : 3)}
                className="px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 flex items-center gap-1 text-xs"
              >
                <Check className="size-3.5" /> Finish
              </button>
              <button
                onClick={cancelDrawing}
                className="opacity-70 hover:opacity-100 ml-1"
                aria-label="Cancel drawing"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {/* Map legend (collapsible) */}
          <div className="absolute bottom-4 right-4 z-[500]">
            {legendOpen ? (
              <div className="bg-card/95 backdrop-blur border border-border rounded-md elevated p-3 w-52">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    Project types
                  </span>
                  <button
                    onClick={() => setLegendOpen(false)}
                    aria-label="Hide legend"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <CategoryLegend compact />
              </div>
            ) : (
              <button
                onClick={() => setLegendOpen(true)}
                className="bg-card/95 backdrop-blur border border-border rounded-md elevated px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition inline-flex items-center gap-1.5"
                aria-label="Show map key"
              >
                <MapPin className="size-3.5" /> Key
              </button>
            )}
          </div>
        </main>

        {/* Floating sidebar toggle (visible when collapsed) */}
        {sidebarMode === "collapsed" && (
          <button
            onClick={() => setSidebarMode("side")}
            className="absolute top-4 left-4 z-[600] flex items-center gap-2 bg-card border border-border elevated rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary transition"
            aria-label="Open developments list"
          >
            <PanelLeftOpen className="size-4" />
            <span>Developments</span>
            {unreadCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
                {unreadCount}
              </span>
            )}
          </button>
        )}

        {/* Collapsible sidebar overlay */}
        <aside
          className={`absolute top-0 left-0 bottom-0 z-[550] bg-card border-r border-border shadow-2xl flex flex-col transition-all duration-300 ease-out ${
            sidebarMode === "full"
              ? "w-full translate-x-0"
              : sidebarMode === "side"
                ? "w-full sm:w-[440px] lg:w-[520px] translate-x-0"
                : "w-full sm:w-[440px] lg:w-[520px] -translate-x-full"
          }`}
          aria-hidden={sidebarMode === "collapsed"}
          inert={sidebarMode === "collapsed"}
        >
          {selected ? (
            <div
              key={selected.id}
              className="absolute inset-0 z-10 flex flex-col bg-card animate-in slide-in-from-right-8 fade-in duration-300"
            >
              <DevelopmentDetail
                dev={selected}
                cityName={city.name}
                onBack={() => openDevelopmentRoute(null)}
                onChange={loadDevs}
                pendingShape={drawTarget === "edit" && pendingShape ? pendingShape : null}
                consumePendingShape={() => {
                  setPendingShape(null);
                }}
                onStartDraw={(shape) => {
                  pendingEditId.current = selected.id;
                  startDrawing("edit", shape);
                }}
                pendingPoint={pickTarget === "edit" ? pendingPoint : null}
                consumePendingPoint={() => setPendingPoint(null)}
                onStartMovePin={() => {
                  pendingEditId.current = selected.id;
                  setPickTarget("edit");
                  setPickMode(true);
                  setSelected(null);
                  toast("Tap on the map to move the pin");
                }}
              />
            </div>
          ) : null}
          <DevelopmentSidebar
            filteredDevs={filteredDevs}
            cityDevs={cityDevs}
            cityDiscussion={cityDiscussion}
            selected={selected}
            city={city}
            filtersActive={filtersActive}
            unreadCount={unreadCount}
            initialLoading={initialLoading}
            sidebarMode={sidebarMode}
            setSidebarMode={setSidebarMode}
            sidebarView={sidebarView}
            setSidebarView={setSidebarView}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            sortBy={sortBy}
            setSortBy={setSortBy}
            filtersOpen={filtersOpen}
            setFiltersOpen={setFiltersOpen}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            setOnboardingOpen={setOnboardingOpen}
            startPicking={startPicking}
            openDevelopmentRoute={openDevelopmentRoute}
            isUnread={isUnread}
          />
        </aside>
      </div>

      {/* Detail panel is rendered inline inside the sidebar above. */}
      <Onboarding open={onboardingOpen} onClose={closeOnboarding} cityName={city.name} />

      <Dialog
        open={submitOpen}
        onOpenChange={(o) => {
          setSubmitOpen(o);
          if (!o && !drawMode) {
            // Only fully reset when the user closes the dialog without going to draw
            setPickedPoint(null);
            setPendingShape(null);
            setDraft(EMPTY_DRAFT);
          }
        }}
      >
        <DialogContent className="z-[1100] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submit a development</DialogTitle>
            <DialogDescription>
              {pickedPoint
                ? `Pinned at ${pickedPoint.lat.toFixed(5)}, ${pickedPoint.lng.toFixed(5)}`
                : "Pick a spot on the map first"}
            </DialogDescription>
          </DialogHeader>
          {pickedPoint && (
            <SubmitForm
              point={pickedPoint}
              shape={pendingShape}
              draft={draft}
              setDraft={setDraft}
              onClearShape={() => setPendingShape(null)}
              onStartDraw={(s) => {
                setDrawTarget("submit");
                startDrawing("submit", s);
              }}
              onDone={() => {
                setSubmitOpen(false);
                setPickedPoint(null);
                setPendingShape(null);
                setDraft(EMPTY_DRAFT);
                loadDevs();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SubmitFormProps {
  point: LatLng;
  shape: ShapeData | null;
  draft: SubmitDraft;
  setDraft: React.Dispatch<React.SetStateAction<SubmitDraft>>;
  onClearShape: () => void;
  onStartDraw: (shape: ShapeKind) => void;
  onDone: () => void;
}

function SubmitForm({
  point,
  shape,
  draft,
  setDraft,
  onClearShape,
  onStartDraw,
  onDone,
}: SubmitFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const accepted: File[] = [];
    for (const f of Array.from(incoming)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} is over 5MB`);
        continue;
      }
      accepted.push(f);
    }
    setDraft((d) => {
      const combined = [...d.files, ...accepted].slice(0, 6);
      d.previews.forEach((u) => URL.revokeObjectURL(u));
      return {
        ...d,
        files: combined,
        previews: combined.map((f) => URL.createObjectURL(f)),
      };
    });
  };

  const removeFile = (idx: number) => {
    setDraft((d) => {
      const next = d.files.filter((_, i) => i !== idx);
      d.previews.forEach((u) => URL.revokeObjectURL(u));
      return {
        ...d,
        files: next,
        previews: next.map((f) => URL.createObjectURL(f)),
      };
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (draft.title.trim().length < 3) return toast.error("Title is too short");
    if (draft.description.trim().length < 10) return toast.error("Add a bit more detail to the description");
    setLoading(true);

    const uploadedUrls: string[] = [];
    for (const file of draft.files) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("development-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setLoading(false);
        toast.error(`Image upload failed: ${upErr.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from("development-images").getPublicUrl(path);
      uploadedUrls.push(pub.publicUrl);
    }

    const { error } = await supabase.from("developments").insert({
      user_id: user.id,
      title: draft.title.trim().slice(0, 120),
      description: draft.description.trim().slice(0, 2000),
      address: draft.address.trim().slice(0, 200) || null,
      category: draft.category,
      status: draft.status,
      latitude: point.lat,
      longitude: point.lng,
      area_geojson: shape ? { type: shape.shape, points: shape.points } : null,
      images: uploadedUrls,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Submitted! Pending approval from a city moderator or developer.");
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="t">Title</Label>
        <Input
          id="t"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          maxLength={120}
          required
          placeholder="e.g. Marina Quarter masterplan"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="a">Address (optional)</Label>
        <Input
          id="a"
          value={draft.address}
          onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
          maxLength={200}
          placeholder="Street, neighbourhood…"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select
            value={draft.category}
            onValueChange={(v) => setDraft((d) => ({ ...d, category: v as Category }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200]">
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.value] }} />
                    {c.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={draft.status}
            onValueChange={(v) => setDraft((d) => ({ ...d, status: v as Status }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200]">
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Site shape (optional)</Label>
        {shape ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs">
            <span className="flex items-center gap-2">
              {shape.shape === "line" ? <Spline className="size-3.5 text-primary" /> : <Hexagon className="size-3.5 text-primary" />}
              {shape.shape === "line" ? "Line" : "Outline"} · {shape.points.length} points
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => onStartDraw(shape.shape)} className="text-primary hover:underline">
                Redraw
              </button>
              <span className="text-muted-foreground">·</span>
              <button type="button" onClick={onClearShape} className="text-destructive hover:underline">
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => onStartDraw("polygon")} className="gap-2">
              <Hexagon className="size-4" />
              Draw outline
            </Button>
            <Button type="button" variant="outline" onClick={() => onStartDraw("line")} className="gap-2">
              <Spline className="size-4" />
              Draw line
            </Button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Outlines suit buildings or sites · lines suit roads, rail, cycle paths.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label>Photos (optional · up to 6)</Label>
        {draft.previews.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {draft.previews.map((src, i) => (
              <div key={src} className="relative group aspect-square rounded-md overflow-hidden border border-border">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1 right-1 bg-foreground/80 text-background rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                  aria-label="Remove photo"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {draft.files.length < 6 && (
          <label className="flex items-center justify-center gap-2 w-full h-20 rounded-md border-2 border-dashed border-border bg-secondary/30 hover:bg-secondary/60 hover:border-primary/50 cursor-pointer transition text-sm text-muted-foreground">
            <ImagePlus className="size-4" />
            <span>Add photos · max 5MB each</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="d">Description</Label>
        <Textarea
          id="d"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          maxLength={2000}
          required
          rows={5}
          placeholder="What's being proposed or built? Why does it matter?"
        />
      </div>
      <Button type="submit" className="w-full gap-2" disabled={loading}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        {loading ? (draft.files.length > 0 ? "Uploading photos…" : "Submitting…") : "Submit for review"}
      </Button>
      <p className="text-[11px] text-muted-foreground text-center">
        Submissions are reviewed by city moderators or developers before appearing on the public map.
      </p>
    </form>
  );
}

