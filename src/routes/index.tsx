import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense, type FormEvent } from "react";
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
import { CATEGORIES, STATUSES, type Category, type Status } from "@/lib/constants";
import { toast } from "sonner";
import { MapPin, Plus, MessageSquare, X, Pencil, Undo2, Check, ImagePlus, Loader2, PanelLeftOpen, PanelLeftClose } from "lucide-react";

const READ_STORAGE_KEY = "cork-dev-reads-v1";

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

export const Route = createFileRoute("/")({
  component: HomePage,
});

type LatLng = { lat: number; lng: number };

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
  area_geojson: LatLng[] | null;
  images: string[];
  created_at: string;
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

function HomePage() {
  const { user } = useAuth();
  const [devs, setDevs] = useState<Development[]>([]);
  const [selected, setSelected] = useState<Development | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [pickedPoint, setPickedPoint] = useState<LatLng | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<LatLng[]>([]);
  const [pendingArea, setPendingArea] = useState<LatLng[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [reads, setReads] = useState<Record<string, string>>(() => loadReads());

  const loadDevs = async () => {
    const { data, error } = await supabase
      .from("developments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load developments");
      return;
    }
    const rows = (data ?? []) as Array<Omit<Development, "profiles" | "area_geojson" | "images"> & { area_geojson: unknown; images: string[] | null }>;
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    let profMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]));
    }
    setDevs(
      rows.map((r) => ({
        ...r,
        area_geojson: Array.isArray(r.area_geojson)
          ? (r.area_geojson as LatLng[]).filter((p) => p && typeof p.lat === "number" && typeof p.lng === "number")
          : null,
        images: Array.isArray(r.images) ? r.images.filter((u): u is string => typeof u === "string") : [],
        profiles: profMap[r.user_id] ? { display_name: profMap[r.user_id] } : null,
      }))
    );
  };

  useEffect(() => {
    loadDevs();
  }, []);

  const handlePick = (lat: number, lng: number) => {
    setPickedPoint({ lat, lng });
    setSubmitOpen(true);
    setPickMode(false);
  };

  const startPicking = () => {
    if (!user) {
      toast.info("Sign in to submit a development");
      return;
    }
    setPickMode(true);
    setSelected(null);
    toast("Tap anywhere on the map to drop your pin");
  };

  const startDrawing = () => {
    setSubmitOpen(false);
    setDrawPoints([]);
    setPendingArea(null);
    setDrawMode(true);
    toast("Click to add vertices · double-click or 'Finish' when done");
  };

  const finishDrawing = () => {
    if (drawPoints.length < 3) {
      toast.error("Add at least 3 points to make an outline");
      return;
    }
    setPendingArea(drawPoints);
    setDrawPoints([]);
    setDrawMode(false);
    setSubmitOpen(true);
  };

  const cancelDrawing = () => {
    setDrawPoints([]);
    setDrawMode(false);
    setSubmitOpen(true);
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Header />
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Sidebar */}
        <aside className="lg:w-[380px] xl:w-[420px] border-b lg:border-b-0 lg:border-r border-border bg-card flex flex-col min-h-0 max-h-[40vh] lg:max-h-none">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-xs uppercase tracking-[0.2em] text-primary mb-1">
              Cork City · Live feed
            </p>
            <h1 className="text-2xl font-bold leading-tight">
              What's being built<br />in our city.
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {devs.length} {devs.length === 1 ? "development" : "developments"} tracked by neighbours.
            </p>
            <Button onClick={startPicking} className="w-full mt-4 gap-2">
              <Plus className="size-4" />
              Submit a development
            </Button>
            {!user && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                <Link to="/auth" className="text-primary hover:underline">
                  Sign in
                </Link>{" "}
                to contribute.
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {devs.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                No developments yet. Be the first to drop a pin.
              </div>
            ) : (
              <ul
                role="listbox"
                aria-label="Developments in Cork City"
                aria-activedescendant={selected ? `dev-item-${selected.id}` : undefined}
                className="divide-y divide-border focus:outline-none"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (devs.length === 0) return;
                  const idx = selected ? devs.findIndex((d) => d.id === selected.id) : -1;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const next = devs[Math.min(devs.length - 1, idx + 1)] ?? devs[0];
                    setSelected(next);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const prev = devs[Math.max(0, idx - 1)] ?? devs[0];
                    setSelected(prev);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    setSelected(devs[0]);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    setSelected(devs[devs.length - 1]);
                  } else if (e.key === "Escape" && selected) {
                    e.preventDefault();
                    setSelected(null);
                  }
                }}
              >
                {devs.map((d) => {
                  const isSelected = selected?.id === d.id;
                  return (
                    <li key={d.id} role="presentation">
                      <button
                        id={`dev-item-${d.id}`}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => setSelected(d)}
                        className={`w-full text-left px-5 py-4 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                          isSelected
                            ? "bg-secondary border-l-4 border-primary pl-4"
                            : "hover:bg-secondary/50 border-l-4 border-transparent"
                        }`}
                      >
                        <div className="flex gap-3">
                          {d.images[0] && (
                            <img
                              src={d.images[0]}
                              alt=""
                              loading="lazy"
                              className="size-16 rounded-md object-cover shrink-0 border border-border"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className={`font-semibold text-sm leading-tight transition-colors ${isSelected ? "text-primary" : "group-hover:text-primary"}`}>
                                {d.title}
                              </h3>
                              <Badge className={`${STATUS_COLORS[d.status]} text-[10px] uppercase tracking-wider shrink-0 font-medium`}>
                                {statusLabel(d.status)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{d.description}</p>
                            <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground font-mono">
                              <span>{categoryLabel(d.category)}</span>
                              <span>·</span>
                              <span>{d.profiles?.display_name ?? "anon"}</span>
                              {d.images.length > 1 && (
                                <>
                                  <span>·</span>
                                  <span>{d.images.length} photos</span>
                                </>
                              )}
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

        {/* Map */}
        <main className="flex-1 relative min-h-0">
          <Suspense
            fallback={<div className="w-full h-full bg-secondary animate-pulse" />}
          >
            <CorkMap
              developments={devs.map((d) => ({
                id: d.id,
                latitude: d.latitude,
                longitude: d.longitude,
                title: d.title,
                area: d.area_geojson,
              }))}
              selectedId={selected?.id ?? null}
              onSelect={(id) => setSelected(devs.find((d) => d.id === id) ?? null)}
              pickMode={pickMode}
              pickedPoint={pickedPoint}
              onPick={handlePick}
              drawMode={drawMode}
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
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-foreground text-background px-3 py-2 rounded-md shadow-lg flex items-center gap-2 text-sm">
              <Pencil className="size-4" />
              <span className="hidden sm:inline">
                {drawPoints.length < 3
                  ? `Add ${3 - drawPoints.length} more point${3 - drawPoints.length === 1 ? "" : "s"}`
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
                disabled={drawPoints.length < 3}
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
      </div>

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto z-[1100]">
          {selected && <DevelopmentDetail dev={selected} onChange={loadDevs} />}
        </SheetContent>
      </Sheet>

      {/* Submit dialog */}
      <Dialog
        open={submitOpen}
        onOpenChange={(o) => {
          setSubmitOpen(o);
          if (!o) {
            setPickedPoint(null);
            setPendingArea(null);
          }
        }}
      >
        <DialogContent className="z-[1100]">
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
              area={pendingArea}
              onClearArea={() => setPendingArea(null)}
              onStartDraw={startDrawing}
              onDone={() => {
                setSubmitOpen(false);
                setPickedPoint(null);
                setPendingArea(null);
                loadDevs();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubmitForm({
  point,
  area,
  onClearArea,
  onStartDraw,
  onDone,
}: {
  point: LatLng;
  area: LatLng[] | null;
  onClearArea: () => void;
  onStartDraw: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState<Category>("residential");
  const [status, setStatus] = useState<Status>("proposed");
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

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
    const combined = [...files, ...accepted].slice(0, 6);
    setFiles(combined);
    setPreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return combined.map((f) => URL.createObjectURL(f));
    });
  };

  const removeFile = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    setPreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return next.map((f) => URL.createObjectURL(f));
    });
  };

  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (title.trim().length < 3) return toast.error("Title is too short");
    if (description.trim().length < 10) return toast.error("Add a bit more detail to the description");
    setLoading(true);

    // Upload images first
    const uploadedUrls: string[] = [];
    for (const file of files) {
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
      title: title.trim().slice(0, 120),
      description: description.trim().slice(0, 2000),
      address: address.trim().slice(0, 200) || null,
      category,
      status,
      latitude: point.lat,
      longitude: point.lng,
      area_geojson: area && area.length >= 3 ? area : null,
      images: uploadedUrls,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Development added to the map");
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="t">Title</Label>
        <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="e.g. Marina Quarter masterplan" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="a">Address (optional)</Label>
        <Input id="a" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="e.g. South Docks, Cork" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200]">
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200]">
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Area outline (optional)</Label>
        {area && area.length >= 3 ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2 text-xs">
            <span className="flex items-center gap-2 font-mono">
              <Pencil className="size-3.5 text-primary" />
              {area.length}-point outline drawn
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={onStartDraw} className="text-primary hover:underline">
                Redraw
              </button>
              <span className="text-muted-foreground">·</span>
              <button type="button" onClick={onClearArea} className="text-destructive hover:underline">
                Clear
              </button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={onStartDraw} className="w-full gap-2">
            <Pencil className="size-4" />
            Draw outline on map
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Photos (optional · up to 6)</Label>
        {previews.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {previews.map((src, i) => (
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
        {files.length < 6 && (
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
        <Textarea id="d" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} required rows={5} placeholder="What's being proposed or built? Why does it matter?" />
      </div>
      <Button type="submit" className="w-full gap-2" disabled={loading}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        {loading ? (files.length > 0 ? "Uploading photos…" : "Submitting…") : "Add to map"}
      </Button>
    </form>
  );
}

function DevelopmentDetail({ dev, onChange }: { dev: Development; onChange: () => void }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(dev.title);
  const [editDescription, setEditDescription] = useState(dev.description);
  const [editAddress, setEditAddress] = useState(dev.address ?? "");
  const [editCategory, setEditCategory] = useState<Category>(dev.category);
  const [editStatus, setEditStatus] = useState<Status>(dev.status);
  const [savingEdit, setSavingEdit] = useState(false);
  const [existingImages, setExistingImages] = useState<string[]>(dev.images);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const isOwner = user?.id === dev.user_id;

  useEffect(() => {
    setEditing(false);
    setEditTitle(dev.title);
    setEditDescription(dev.description);
    setEditAddress(dev.address ?? "");
    setEditCategory(dev.category);
    setEditStatus(dev.status);
    setExistingImages(dev.images);
    setNewFiles([]);
    setNewPreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return [];
    });
  }, [dev.id]);

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

    // Upload any new files
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

    // Try to delete removed images from storage (best-effort)
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

  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="px-0">
        <Badge className={`${STATUS_COLORS[dev.status]} w-fit text-[10px] uppercase tracking-wider font-medium`}>
          {statusLabel(dev.status)} · {categoryLabel(dev.category)}
        </Badge>
        <SheetTitle className="text-2xl leading-tight font-bold">{dev.title}</SheetTitle>
        {dev.address && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <MapPin className="size-3.5" /> {dev.address}
          </p>
        )}
      </SheetHeader>

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
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
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
          <p className="text-[11px] text-muted-foreground font-mono">
            Map outline isn't editable here yet.
          </p>
        </form>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{dev.description}</p>
          <div className="text-xs text-muted-foreground font-mono pt-2 border-t border-border flex items-center justify-between gap-3">
            <span>
              Submitted by {dev.profiles?.display_name ?? "anon"} · {new Date(dev.created_at).toLocaleDateString()}
            </span>
            {isOwner && (
              <span className="flex items-center gap-2">
                <button onClick={() => setEditing(true)} className="text-primary hover:underline flex items-center gap-1">
                  <Pencil className="size-3" /> edit
                </button>
                <span>·</span>
                <button onClick={remove} className="text-destructive hover:underline">
                  delete
                </button>
              </span>
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
