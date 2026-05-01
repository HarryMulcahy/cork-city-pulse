import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, lazy, Suspense, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORIES, STATUSES, CATEGORY_COLORS, type Category, type Status } from "@/lib/constants";
import { CitySearch } from "@/components/CitySearch";
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
} from "lucide-react";

const READ_STORAGE_KEY = "city-builds:dev-reads-v1";

function loadReads(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(READ_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
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

type LatLng = { lat: number; lng: number };
type ShapeKind = "polygon" | "line";

interface ShapeData {
  shape: ShapeKind;
  points: LatLng[];
}

/**
 * Older rows store area_geojson as a bare array of {lat,lng}.
 * Newer rows store {type, points}. This normalises both.
 */
function parseShape(raw: unknown): ShapeData | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const pts = raw.filter(
      (p): p is LatLng =>
        !!p && typeof (p as LatLng).lat === "number" && typeof (p as LatLng).lng === "number",
    );
    if (pts.length < 2) return null;
    return { shape: "polygon", points: pts };
  }
  if (typeof raw === "object") {
    const obj = raw as { type?: string; points?: unknown };
    const pts = Array.isArray(obj.points)
      ? (obj.points as unknown[]).filter(
          (p): p is LatLng =>
            !!p &&
            typeof (p as LatLng).lat === "number" &&
            typeof (p as LatLng).lng === "number",
        )
      : [];
    if (pts.length < 2) return null;
    const shape: ShapeKind = obj.type === "line" ? "line" : "polygon";
    return { shape, points: pts };
  }
  return null;
}

interface Development {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: Category;
  status: Status;
  latitude: number;
  longitude: number;
  address: string | null;
  area: ShapeData | null;
  images: string[];
  created_at: string;
  approval_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  source: string;
  source_ref: string | null;
  last_activity_at: string;
  comments_count: number;
  profiles?: { display_name: string } | null;
}

interface Comment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: { display_name: string } | null;
}

const STATUS_COLORS: Record<Status, string> = {
  proposed: "bg-muted text-muted-foreground",
  planning: "bg-secondary text-secondary-foreground",
  approved: "bg-primary/15 text-primary",
  under_construction: "bg-primary text-primary-foreground",
  completed: "bg-foreground text-background",
  rejected: "bg-destructive/15 text-destructive",
};

function statusLabel(s: Status) {
  return STATUSES.find((x) => x.value === s)?.label ?? s;
}
function categoryLabel(c: Category) {
  return CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

/** Bounding-box check so we only show developments inside the current city. */
function inBounds(lat: number, lng: number, b: City["bounds"]) {
  return lat >= b[0][0] && lat <= b[1][0] && lng >= b[0][1] && lng <= b[1][1];
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
  const [reads, setReads] = useState<Record<string, string>>(() => loadReads());

  // Filters (multi-select). Empty set = "all".
  const [categoryFilter, setCategoryFilter] = useState<Set<Category>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const toggleInSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const loadDevs = async () => {
    const { data, error } = await supabase
      .from("developments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load developments");
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
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    let profMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]));
    }

    const devIds = rows.map((r) => r.id);
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
    const cSlug = citySlug(city ?? { name: found.title, id: `dev-${found.id}` });
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
    const found = devs.find((d) => {
      if (tail && d.id.replace(/-/g, "").toLowerCase().startsWith(tail)) return true;
      return projectSlug(d) === routeProjectSlug;
    });
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
    const base = cityDevs.filter((d) => {
      if (categoryFilter.size > 0 && !categoryFilter.has(d.category)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(d.status)) return false;
      return true;
    });
    // Always include the currently selected dev (e.g. a pending one opened from the review queue)
    if (selected && selected.source !== "general" && !base.some((d) => d.id === selected.id)) {
      return [selected, ...base];
    }
    return base;
  }, [cityDevs, categoryFilter, statusFilter, selected]);

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
        <main className="absolute inset-0">
          <Suspense
            fallback={<div className="w-full h-full bg-secondary animate-pulse" />}
          >
            <CorkMap
              center={city.center}
              bounds={city.bounds}
              cityKey={city.id}
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
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-foreground text-background px-4 py-2 rounded-md shadow-lg flex items-center gap-3 text-sm">
              <MapPin className="size-4" />
              <span>Click on the map to place your development</span>
              <button
                onClick={() => setPickMode(false)}
                className="ml-2 opacity-70 hover:opacity-100"
                aria-label="Cancel"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {drawMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-foreground text-background px-3 py-2 rounded-md shadow-lg flex items-center gap-2 text-sm flex-wrap justify-center max-w-[95vw]">
              {drawShape === "line" ? <Spline className="size-4" /> : <Hexagon className="size-4" />}
              <span className="hidden sm:inline">
                {drawPoints.length < (drawShape === "line" ? 2 : 3)
                  ? `Add ${(drawShape === "line" ? 2 : 3) - drawPoints.length} more point${(drawShape === "line" ? 2 : 3) - drawPoints.length === 1 ? "" : "s"}`
                  : `${drawPoints.length} points · double-click to finish`}
              </span>
              <span className="sm:hidden font-mono text-xs">{drawPoints.length} pts</span>
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
        </main>

        {/* Floating sidebar toggle (visible when collapsed) */}
        {sidebarMode === "collapsed" && (
          <button
            onClick={() => setSidebarMode("side")}
            className="absolute top-4 left-4 z-[600] flex items-center gap-2 bg-card border border-border shadow-lg rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary transition"
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
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{filteredDevs.length}</span>
                {filtersActive && <span className="text-muted-foreground">/{cityDevs.length}</span>}{" "}
                {filteredDevs.length === 1 ? "development" : "developments"}
                {unreadCount > 0 && (
                  <> · <span className="text-primary font-semibold">{unreadCount} new</span></>
                )}
              </p>
              <div className="flex items-center gap-1">
                {/* Fullscreen toggle: hidden on mobile (sidebar is already full-width) */}
                <button
                  onClick={() => setSidebarMode(sidebarMode === "full" ? "side" : "full")}
                  className="hidden sm:inline-flex text-muted-foreground hover:text-foreground transition p-1"
                  aria-label={sidebarMode === "full" ? "Exit fullscreen" : "Expand to fullscreen"}
                  title={sidebarMode === "full" ? "Side view" : "Fullscreen"}
                >
                  {sidebarMode === "full" ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>
                {/* Close button: icon-only on desktop, labelled "Close map" button on mobile */}
                <button
                  onClick={() => setSidebarMode("collapsed")}
                  className="hidden sm:inline-flex text-muted-foreground hover:text-foreground transition p-1"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="size-4" />
                </button>
                <button
                  onClick={() => setSidebarMode("collapsed")}
                  className="sm:hidden inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary/80 transition"
                  aria-label="Show map"
                >
                  <MapPin className="size-3.5" />
                  Show map
                </button>
              </div>
            </div>
            <Button onClick={startPicking} className="btn-cta w-full mt-3 gap-2 h-11 rounded-md">
              <Plus className="size-4" />
              Submit a development
            </Button>
            {!user && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                <Link to="/auth" className="text-primary hover:underline font-semibold">
                  Sign in
                </Link>{" "}
                to contribute.
              </p>
            )}

            {/* Filters (collapsible) */}
            <div className="mt-3">
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                className="w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition py-1"
                aria-expanded={filtersOpen}
              >
                <span className="flex items-center gap-1.5">
                  {filtersOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  Filters
                  {filtersActive && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold normal-case tracking-normal">
                      {categoryFilter.size + statusFilter.size}
                    </span>
                  )}
                </span>
                {filtersActive && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCategoryFilter(new Set());
                      setStatusFilter(new Set());
                    }}
                    className="text-[11px] text-primary hover:underline normal-case tracking-normal cursor-pointer"
                  >
                    Clear
                  </span>
                )}
              </button>
              {filtersOpen && (
                <div className="space-y-2 mt-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Type</p>
                    <div className="flex flex-wrap gap-1">
                      {CATEGORIES.map((c) => {
                        const active = categoryFilter.has(c.value);
                        const color = CATEGORY_COLORS[c.value];
                        return (
                          <button
                            key={c.value}
                            onClick={() => setCategoryFilter((s) => toggleInSet(s, c.value))}
                            aria-pressed={active}
                            className={`text-[11px] px-2 py-1 rounded-full border transition ${
                              active
                                ? "text-white border-transparent"
                                : "bg-background hover:bg-secondary border-border text-foreground"
                            }`}
                            style={active ? { backgroundColor: color } : { borderColor: `${color}55` }}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                    <div className="flex flex-wrap gap-1">
                      {STATUSES.map((s) => {
                        const active = statusFilter.has(s.value);
                        return (
                          <button
                            key={s.value}
                            onClick={() => setStatusFilter((set) => toggleInSet(set, s.value))}
                            aria-pressed={active}
                            className={`text-[11px] px-2 py-1 rounded-full border transition ${
                              active
                                ? "bg-foreground text-background border-foreground"
                                : "bg-background hover:bg-secondary border-border text-foreground"
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {cityDiscussion && (
              <button
                onClick={() => {
                  openDevelopmentRoute(cityDiscussion);
                  if (sidebarMode === "full") setSidebarMode("side");
                }}
                className={`w-full text-left px-5 py-4 border-b border-border transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                  selected?.id === cityDiscussion.id
                    ? "bg-primary/10 border-l-4 border-l-primary pl-4"
                    : "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary/60 pl-4"
                }`}
                aria-label={`Open ${city.name} general discussion`}
              >
                <div className="flex gap-3 items-center">
                  <div className="size-12 rounded-full shrink-0 bg-primary/15 flex items-center justify-center">
                    <MessageSquare className="size-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold text-foreground">
                        Talk about {city.name}
                      </h3>
                      <Badge className="bg-primary text-primary-foreground text-[10px] uppercase tracking-wider font-medium">
                        Pinned
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      General discussion · no specific development needed
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground font-mono">
                      {cityDiscussion.comments_count > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="size-3" />
                          {cityDiscussion.comments_count}
                        </span>
                      )}
                      {cityDiscussion.comments_count > 0 && <span>·</span>}
                      <span>{formatRelative(cityDiscussion.last_activity_at)}</span>
                    </div>
                  </div>
                </div>
              </button>
            )}
            {filteredDevs.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                {cityDevs.length === 0
                  ? `No developments here yet. Be the first to drop a pin in ${city.name}.`
                  : "No developments match your filters."}
              </div>
            ) : (
              <ul
                role="listbox"
                aria-label={`Developments in ${city.name}`}
                aria-activedescendant={selected ? `dev-item-${selected.id}` : undefined}
                className="divide-y divide-border focus:outline-none"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (filteredDevs.length === 0) return;
                  const idx = selected ? filteredDevs.findIndex((d) => d.id === selected.id) : -1;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    openDevelopmentRoute(filteredDevs[Math.min(filteredDevs.length - 1, idx + 1)] ?? filteredDevs[0]);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    openDevelopmentRoute(filteredDevs[Math.max(0, idx - 1)] ?? filteredDevs[0]);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    openDevelopmentRoute(filteredDevs[0]);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    openDevelopmentRoute(filteredDevs[filteredDevs.length - 1]);
                  } else if (e.key === "Escape" && selected) {
                    e.preventDefault();
                    openDevelopmentRoute(null);
                  }
                }}
              >
                {filteredDevs.map((d) => {
                  const isSelected = selected?.id === d.id;
                  const unread = isUnread(d);
                  const catColor = CATEGORY_COLORS[d.category];
                  return (
                    <li key={d.id} role="presentation">
                      <button
                        id={`dev-item-${d.id}`}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          openDevelopmentRoute(d);
                          if (sidebarMode === "full") setSidebarMode("side");
                        }}
                        className={`w-full text-left px-5 py-4 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                          isSelected
                            ? "bg-secondary border-l-4 pl-4"
                            : unread
                              ? "bg-primary/5 hover:bg-secondary/70 border-l-4 pl-4"
                              : "hover:bg-secondary/50 border-l-4 border-transparent"
                        }`}
                        style={isSelected || unread ? { borderLeftColor: catColor } : undefined}
                      >
                        <div className="flex gap-3">
                          {d.images[0] ? (
                            <img
                              src={d.images[0]}
                              alt=""
                              loading="lazy"
                              className="size-20 rounded-md object-cover shrink-0 border border-border"
                            />
                          ) : (
                            <div
                              className="size-20 rounded-md shrink-0 border border-border flex items-center justify-center"
                              style={{ backgroundColor: `${catColor}1a`, borderColor: `${catColor}55` }}
                            >
                              <MapPin className="size-6" style={{ color: catColor }} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className={`text-sm leading-tight transition-colors ${
                                unread && !isSelected ? "font-bold text-foreground" : "font-semibold"
                              } ${isSelected ? "text-primary" : "group-hover:text-primary"}`}>
                                {unread && !isSelected && (
                                  <span
                                    className="inline-block size-2 rounded-full mr-1.5 -translate-y-0.5"
                                    style={{ backgroundColor: catColor }}
                                    aria-label="unread"
                                  />
                                )}
                                {d.title}
                              </h3>
                              <Badge className={`${STATUS_COLORS[d.status]} text-[10px] uppercase tracking-wider shrink-0 font-medium`}>
                                {statusLabel(d.status)}
                              </Badge>
                            </div>
                            <p className={`text-xs line-clamp-2 ${unread && !isSelected ? "text-foreground/80" : "text-muted-foreground"}`}>
                              {d.description}
                            </p>
                            <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground font-mono flex-wrap">
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: `${catColor}1a`, color: catColor }}
                              >
                                {categoryLabel(d.category)}
                              </span>
                              <span>·</span>
                              <span>{d.profiles?.display_name ?? "anon"}</span>
                              {d.comments_count > 0 && (
                                <>
                                  <span>·</span>
                                  <span className={`flex items-center gap-1 ${unread ? "text-primary font-semibold" : ""}`}>
                                    <MessageSquare className="size-3" />
                                    {d.comments_count}
                                  </span>
                                </>
                              )}
                              <span>·</span>
                              <span>{formatRelative(d.last_activity_at)}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* Detail panel is rendered inline inside the sidebar above. */}
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
            <span className="flex items-center gap-2 font-mono">
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
        <p className="text-[11px] text-muted-foreground font-mono">
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
      <p className="text-[11px] text-muted-foreground text-center font-mono">
        Submissions are reviewed by city moderators or developers before appearing on the public map.
      </p>
    </form>
  );
}

interface DetailProps {
  dev: Development;
  onChange: () => void;
  pendingShape: ShapeData | null;
  consumePendingShape: () => void;
  onStartDraw: (shape: ShapeKind) => void;
  pendingPoint: LatLng | null;
  consumePendingPoint: () => void;
  onStartMovePin: () => void;
}

function DevelopmentDetail({
  dev,
  onChange,
  pendingShape,
  consumePendingShape,
  onStartDraw,
  pendingPoint,
  consumePendingPoint,
  onStartMovePin,
}: DetailProps) {
  const { user, isApprover } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(dev.title);
  const [editDescription, setEditDescription] = useState(dev.description);
  const [editAddress, setEditAddress] = useState(dev.address ?? "");
  const [editCategory, setEditCategory] = useState<Category>(dev.category);
  const [editStatus, setEditStatus] = useState<Status>(dev.status);
  const [editShape, setEditShape] = useState<ShapeData | null>(dev.area);
  const [editPoint, setEditPoint] = useState<LatLng>({ lat: dev.latitude, lng: dev.longitude });
  const [savingEdit, setSavingEdit] = useState(false);
  const [existingImages, setExistingImages] = useState<string[]>(dev.images);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const isOwner = user?.id === dev.user_id;

  // When the dev changes (open a different one), reset edit state.
  useEffect(() => {
    setEditing(false);
    setEditTitle(dev.title);
    setEditDescription(dev.description);
    setEditAddress(dev.address ?? "");
    setEditCategory(dev.category);
    setEditStatus(dev.status);
    setEditShape(dev.area);
    setEditPoint({ lat: dev.latitude, lng: dev.longitude });
    setExistingImages(dev.images);
    setNewFiles([]);
    setNewPreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return [];
    });
  }, [dev.id]);

  // Pick up a freshly-drawn shape from the parent after returning from draw mode.
  useEffect(() => {
    if (pendingShape) {
      setEditShape(pendingShape);
      setEditing(true);
      consumePendingShape();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingShape]);

  // Pick up a freshly-moved pin point from the parent after returning from pick mode.
  useEffect(() => {
    if (pendingPoint) {
      setEditPoint(pendingPoint);
      setEditing(true);
      consumePendingPoint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPoint]);

  useEffect(() => () => newPreviews.forEach((u) => URL.revokeObjectURL(u)), [newPreviews]);

  const totalImages = existingImages.length + newFiles.length;

  const addEditFiles = (incoming: FileList | null) => {
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
    const room = Math.max(0, 6 - existingImages.length);
    const combined = [...newFiles, ...accepted].slice(0, room);
    setNewFiles(combined);
    setNewPreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return combined.map((f) => URL.createObjectURL(f));
    });
  };

  const removeNewFile = (idx: number) => {
    const next = newFiles.filter((_, i) => i !== idx);
    setNewFiles(next);
    setNewPreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return next.map((f) => URL.createObjectURL(f));
    });
  };

  const removeExistingImage = (idx: number) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOwner || !user) return;
    if (editTitle.trim().length < 3) return toast.error("Title is too short");
    if (editDescription.trim().length < 10) return toast.error("Add a bit more detail to the description");
    setSavingEdit(true);

    const uploadedUrls: string[] = [];
    for (const file of newFiles) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("development-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setSavingEdit(false);
        toast.error(`Image upload failed: ${upErr.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from("development-images").getPublicUrl(path);
      uploadedUrls.push(pub.publicUrl);
    }

    const removedUrls = dev.images.filter((u) => !existingImages.includes(u));
    if (removedUrls.length) {
      const paths = removedUrls
        .map((url) => {
          const marker = "/development-images/";
          const i = url.indexOf(marker);
          return i >= 0 ? url.slice(i + marker.length) : null;
        })
        .filter((p): p is string => !!p);
      if (paths.length) {
        await supabase.storage.from("development-images").remove(paths);
      }
    }

    const finalImages = [...existingImages, ...uploadedUrls];

    const { error } = await supabase
      .from("developments")
      .update({
        title: editTitle.trim().slice(0, 120),
        description: editDescription.trim().slice(0, 2000),
        address: editAddress.trim().slice(0, 200) || null,
        category: editCategory,
        status: editStatus,
        images: finalImages,
        latitude: editPoint.lat,
        longitude: editPoint.lng,
        area_geojson: editShape ? { type: editShape.shape, points: editShape.points } : null,
      })
      .eq("id", dev.id);
    setSavingEdit(false);
    if (error) return toast.error(error.message);
    toast.success("Development updated");
    setNewFiles([]);
    setNewPreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return [];
    });
    setEditing(false);
    onChange();
  };

  const load = async () => {
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("development_id", dev.id)
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as Omit<Comment, "profiles">[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    let profMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]));
    }
    setComments(rows.map((r) => ({ ...r, profiles: profMap[r.user_id] ? { display_name: profMap[r.user_id] } : null })));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dev.id]);

  const post = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return toast.info("Sign in to comment");
    if (body.trim().length < 2) return;
    setLoading(true);
    const { error } = await supabase.from("comments").insert({
      development_id: dev.id,
      user_id: user.id,
      body: body.trim().slice(0, 1000),
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setBody("");
    load();
  };

  const remove = async () => {
    if (!confirm("Remove this development?")) return;
    const { error } = await supabase.from("developments").delete().eq("id", dev.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    onChange();
  };

  const approve = async () => {
    if (!user) return;
    setApproving(true);
    const { error } = await supabase
      .from("developments")
      .update({ approval_status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
      .eq("id", dev.id);
    setApproving(false);
    if (error) return toast.error(error.message);
    toast.success("Approved — now visible on the public map");
    onChange();
  };

  const reject = async () => {
    if (!user) return;
    const reason = prompt("Reason for rejection (optional):") ?? "";
    setApproving(true);
    const { error } = await supabase
      .from("developments")
      .update({
        approval_status: "rejected",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        rejection_reason: reason || null,
      })
      .eq("id", dev.id);
    setApproving(false);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    onChange();
  };

  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="px-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={`${STATUS_COLORS[dev.status]} w-fit text-[10px] uppercase tracking-wider font-medium`}>
            {statusLabel(dev.status)} ·{" "}
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[dev.category] }} />
              {categoryLabel(dev.category)}
            </span>
          </Badge>
          {dev.approval_status === "pending" && (
            <Badge className="bg-amber-500/15 text-amber-600 text-[10px] uppercase tracking-wider"><Clock className="size-3 mr-1" />Pending</Badge>
          )}
          {dev.approval_status === "rejected" && (
            <Badge className="bg-destructive/15 text-destructive text-[10px] uppercase tracking-wider"><XCircle className="size-3 mr-1" />Rejected</Badge>
          )}
        </div>
        <SheetTitle className="text-2xl leading-tight font-bold">{dev.title}</SheetTitle>
        {dev.address && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <MapPin className="size-3.5" /> {dev.address}
          </p>
        )}
      </SheetHeader>

      {dev.approval_status === "pending" && isApprover && (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <Clock className="size-3.5" /> Awaiting your review
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={approving} onClick={approve} className="gap-1.5 flex-1">
              {approving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={approving} onClick={reject} className="gap-1.5 flex-1">
              <XCircle className="size-3.5" />
              Reject
            </Button>
          </div>
        </div>
      )}
      {dev.approval_status === "pending" && !isApprover && dev.user_id === user?.id && (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <Clock className="size-3.5 shrink-0" />
          Pending review by a city moderator or developer.
        </div>
      )}
      {dev.approval_status === "rejected" && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <p className="font-semibold flex items-center gap-1.5"><XCircle className="size-3.5" /> Rejected</p>
          {dev.rejection_reason && <p className="mt-1">{dev.rejection_reason}</p>}
        </div>
      )}

      {dev.images.length > 0 && (
        <div className="mt-4 -mx-6">
          <div className="aspect-[4/3] w-full overflow-hidden bg-secondary border-y border-border">
            <img
              src={dev.images[0]}
              alt={dev.title}
              className="h-full w-full object-cover"
            />
          </div>
          {dev.images.length > 1 && (
            <div className="px-6 mt-2 grid grid-cols-4 gap-2">
              {dev.images.slice(1).map((src, i) => (
                <a
                  key={src}
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square rounded-md overflow-hidden border border-border hover:opacity-80 transition"
                >
                  <img src={src} alt={`${dev.title} photo ${i + 2}`} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick-info grid (2x2, scannable in sunlight) */}
      {dev.source !== "general" && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <QuickInfo
            icon={<Tag className="size-3.5" />}
            label="Type"
            value={categoryLabel(dev.category)}
            color={CATEGORY_COLORS[dev.category]}
          />
          <QuickInfo
            icon={<Activity className="size-3.5" />}
            label="Status"
            value={statusLabel(dev.status)}
          />
          <QuickInfo
            icon={<MessageSquare className="size-3.5" />}
            label="Activity"
            value={`${dev.comments_count} comment${dev.comments_count === 1 ? "" : "s"}`}
          />
          <QuickInfo
            icon={<Globe2 className="size-3.5" />}
            label="Location"
            value={dev.address ? dev.address.split(",")[0] : `${dev.latitude.toFixed(3)}, ${dev.longitude.toFixed(3)}`}
            mono={!dev.address}
          />
        </div>
      )}

      {editing && isOwner ? (
        <form onSubmit={saveEdit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="et">Title</Label>
            <Input id="et" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={120} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ea">Address</Label>
            <Input id="ea" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} maxLength={200} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={editCategory} onValueChange={(v) => setEditCategory(v as Category)}>
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
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200]">
                  {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed">Description</Label>
            <Textarea id="ed" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={2000} required rows={5} />
          </div>

          <div className="space-y-1.5">
            <Label>Pin location</Label>
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs">
              <span className="flex items-center gap-2 font-mono">
                <MapPin className="size-3.5 text-primary" />
                {editPoint.lat.toFixed(5)}, {editPoint.lng.toFixed(5)}
              </span>
              <button type="button" onClick={onStartMovePin} className="text-primary hover:underline">
                Move pin
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Site shape</Label>
            {editShape ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs">
                <span className="flex items-center gap-2 font-mono">
                  {editShape.shape === "line" ? <Spline className="size-3.5 text-primary" /> : <Hexagon className="size-3.5 text-primary" />}
                  {editShape.shape === "line" ? "Line" : "Outline"} · {editShape.points.length} points
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => onStartDraw(editShape.shape)} className="text-primary hover:underline">
                    Redraw
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button type="button" onClick={() => setEditShape(null)} className="text-destructive hover:underline">
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onStartDraw("polygon")} className="gap-2">
                  <Hexagon className="size-3.5" />
                  Draw outline
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onStartDraw("line")} className="gap-2">
                  <Spline className="size-3.5" />
                  Draw line
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Photos ({totalImages}/6)</Label>
            {(existingImages.length > 0 || newPreviews.length > 0) && (
              <div className="grid grid-cols-3 gap-2">
                {existingImages.map((src, i) => (
                  <div key={src} className="relative group aspect-square rounded-md overflow-hidden border border-border">
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeExistingImage(i)}
                      className="absolute top-1 right-1 bg-foreground/80 text-background rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                      aria-label="Remove photo"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                {newPreviews.map((src, i) => (
                  <div key={src} className="relative group aspect-square rounded-md overflow-hidden border border-primary/60">
                    <img src={src} alt="" className="h-full w-full object-cover" />
                    <span className="absolute bottom-1 left-1 bg-primary text-primary-foreground text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono">
                      new
                    </span>
                    <button
                      type="button"
                      onClick={() => removeNewFile(i)}
                      className="absolute top-1 right-1 bg-foreground/80 text-background rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                      aria-label="Remove photo"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {totalImages < 6 && (
              <label className="flex items-center justify-center gap-2 w-full h-16 rounded-md border-2 border-dashed border-border bg-secondary/30 hover:bg-secondary/60 hover:border-primary/50 cursor-pointer transition text-sm text-muted-foreground">
                <ImagePlus className="size-4" />
                <span>Add photos · max 5MB each</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => addEditFiles(e.target.files)}
                />
              </label>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={savingEdit} className="gap-2">
              {savingEdit && <Loader2 className="size-4 animate-spin" />}
              {savingEdit ? (newFiles.length > 0 ? "Uploading…" : "Saving…") : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={savingEdit}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{dev.description}</p>
          <div className="text-xs text-foreground/70 pt-2 border-t border-border flex items-center justify-between gap-3">
            <span>
              Submitted by{" "}
              <span className="font-bold text-foreground">{dev.profiles?.display_name ?? "anon"}</span>{" "}
              ·{" "}
              <span className="font-bold text-foreground font-mono">
                {new Date(dev.created_at).toLocaleDateString()}
              </span>
            </span>
            {isOwner && dev.source !== "general" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="inline-flex items-center justify-center size-8 -mr-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition"
                    aria-label="Actions"
                  >
                    <MoreVertical className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[1200]">
                  <DropdownMenuItem onClick={() => setEditing(true)} className="gap-2">
                    <Pencil className="size-3.5" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={remove} className="gap-2 text-destructive focus:text-destructive">
                    <Trash2 className="size-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      <div className="mt-8 flex-1">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <MessageSquare className="size-4" /> Discussion ({comments.length})
        </h3>
        <ul className="space-y-3 mb-4">
          {comments.map((c) => (
            <li key={c.id} className="bg-secondary/60 rounded-md p-3">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-xs font-semibold">{c.profiles?.display_name ?? "anon"}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
          {comments.length === 0 && (
            <li className="text-xs text-muted-foreground italic">No comments yet — start the conversation.</li>
          )}
        </ul>

        {user ? (
          <form onSubmit={post} className="space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your perspective…"
              maxLength={1000}
              rows={3}
            />
            <Button type="submit" size="sm" disabled={loading || body.trim().length < 2}>
              {loading ? "Posting…" : "Post comment"}
            </Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            <Link to="/auth" className="text-primary hover:underline">
              Sign in
            </Link>{" "}
            to join the discussion.
          </p>
        )}
      </div>
    </div>
  );
}

interface QuickInfoProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}
function QuickInfo({ icon, label, value, color, mono }: QuickInfoProps) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5 flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-foreground/60">
        <span style={color ? { color } : undefined}>{icon}</span>
        {label}
      </span>
      <span className={`text-sm font-bold text-foreground leading-tight truncate ${mono ? "font-mono" : ""}`} title={value}>
        {value}
      </span>
    </div>
  );
}
