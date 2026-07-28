import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { ImagePlus, Loader2, X, Camera, Trash2, TrendingUp, ArrowLeftRight } from "lucide-react";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";

const MILESTONES = [
  { value: "foundation", label: "Foundation" },
  { value: "core_rising", label: "Core rising" },
  { value: "topped_out", label: "Topped out" },
  { value: "facade", label: "Façade" },
  { value: "completed", label: "Completed" },
] as const;

const MILESTONE_LABEL: Record<string, string> = Object.fromEntries(
  MILESTONES.map((m) => [m.value, m.label]),
);
const MILESTONE_ORDER: string[] = MILESTONES.map((m) => m.value);

interface ProgressUpdate {
  id: string;
  user_id: string;
  captured_at: string;
  caption: string | null;
  images: string[];
  milestone: string | null;
  created_at: string;
  author?: string | null;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ProgressTimeline({ developmentId }: { developmentId: string }) {
  const { user, isApprover } = useAuth();
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [capturedAt, setCapturedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [caption, setCaption] = useState("");
  const [milestone, setMilestone] = useState("");
  const [posting, setPosting] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("development_updates")
      .select("*")
      .eq("development_id", developmentId)
      .order("captured_at", { ascending: false });
    const rows = (data ?? []) as ProgressUpdate[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]));
    }
    setUpdates(rows.map((r) => ({ ...r, author: names[r.user_id] ?? null })));
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [developmentId]);

  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

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

  const resetForm = () => {
    setFiles([]);
    setPreviews((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return [];
    });
    setCaption("");
    setMilestone("");
    setCapturedAt(new Date().toISOString().slice(0, 10));
    setOpen(false);
  };

  const submit = async () => {
    if (!user) return;
    if (files.length === 0 && caption.trim().length < 2) {
      return toast.error("Add a photo or a note");
    }
    setPosting(true);
    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("development-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setPosting(false);
        return toast.error(`Upload failed: ${upErr.message}`);
      }
      urls.push(supabase.storage.from("development-images").getPublicUrl(path).data.publicUrl);
    }
    const { error } = await supabase.from("development_updates").insert({
      development_id: developmentId,
      user_id: user.id,
      captured_at: new Date(`${capturedAt}T12:00:00`).toISOString(),
      caption: caption.trim().slice(0, 1000) || null,
      images: urls,
      milestone: milestone || null,
    });
    setPosting(false);
    if (error) return toast.error(error.message);
    toast.success("Progress update posted");
    resetForm();
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("development_updates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setUpdates((prev) => prev.filter((u) => u.id !== id));
  };

  const reachedIdx = updates.reduce((max, u) => {
    const i = u.milestone ? MILESTONE_ORDER.indexOf(u.milestone) : -1;
    return i > max ? i : max;
  }, -1);
  const photoUpdates = updates.filter((u) => u.images.length > 0);
  const canCompare = photoUpdates.length >= 2;
  const oldest = photoUpdates[photoUpdates.length - 1];
  const newest = photoUpdates[0];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="size-4" /> Construction progress ({updates.length})
        </h2>
        {user ? (
          <Button size="sm" variant={open ? "secondary" : "outline"} onClick={() => setOpen((v) => !v)} className="gap-1.5">
            <Camera className="size-3.5" />
            {open ? "Close" : "Post update"}
          </Button>
        ) : null}
      </div>

      {reachedIdx >= 0 && (
        <div className="mb-4 flex items-end gap-1" aria-label="Milestone progress">
          {MILESTONE_ORDER.map((m, i) => (
            <div key={m} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span
                className={`text-[8px] leading-tight text-center w-full truncate ${
                  i <= reachedIdx ? "text-foreground font-semibold" : "text-muted-foreground"
                }`}
              >
                {MILESTONE_LABEL[m]}
              </span>
              <span
                className={`h-1.5 w-full rounded-full ${
                  i < reachedIdx ? "bg-primary" : i === reachedIdx ? "bg-accent" : "bg-border"
                }`}
              />
            </div>
          ))}
        </div>
      )}

      {canCompare && oldest && newest && (
        <div className="mb-4">
          <button
            onClick={() => setShowCompare((v) => !v)}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1 mb-2"
          >
            <ArrowLeftRight className="size-3.5" /> {showCompare ? "Hide" : "Compare"} before / after
          </button>
          {showCompare && (
            <BeforeAfterSlider
              beforeSrc={oldest.images[0]}
              afterSrc={newest.images[0]}
              beforeLabel={fmtDate(oldest.captured_at)}
              afterLabel={fmtDate(newest.captured_at)}
            />
          )}
        </div>
      )}

      {open && user && (
        <div className="rounded-md border border-border bg-secondary/40 p-3 space-y-3 mb-4">
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
            <label className="flex items-center justify-center gap-2 w-full h-16 rounded-md border-2 border-dashed border-border bg-background hover:border-primary/50 cursor-pointer transition text-sm text-muted-foreground">
              <ImagePlus className="size-4" />
              <span>Add progress photos · max 5MB each</span>
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="pu-date" className="text-xs">Date taken</Label>
              <Input id="pu-date" type="date" value={capturedAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setCapturedAt(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Milestone (optional)</Label>
              <Select value={milestone} onValueChange={setMilestone}>
                <SelectTrigger className="h-9"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent className="z-[1300]">
                  {MILESTONES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={1000} rows={2} placeholder="What's changed? (optional)" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={resetForm} disabled={posting}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={posting} className="gap-1.5">
              {posting && <Loader2 className="size-3.5 animate-spin" />}
              {posting ? "Posting…" : "Post update"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground py-4">Loading progress…</p>
      ) : updates.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">
          No progress updates yet.{" "}
          {user ? "Post the first photo of how it's coming along." : (
            <>
              <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to add one.
            </>
          )}
        </p>
      ) : (
        <ol className="relative border-l-2 border-border ml-2 space-y-5">
          {updates.map((u) => {
            const canDelete = user?.id === u.user_id || isApprover;
            return (
              <li key={u.id} className="ml-4">
                <span className="absolute -left-[7px] mt-1 size-3 rounded-full bg-primary border-2 border-background" aria-hidden="true" />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold font-mono">{fmtDate(u.captured_at)}</span>
                    {u.milestone && (
                      <span
                        className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
                          u.milestone === "topped_out" || u.milestone === "completed"
                            ? "bg-accent text-accent-foreground"
                            : "bg-primary/15 text-primary"
                        }`}
                      >
                        {MILESTONE_LABEL[u.milestone] ?? u.milestone}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">by {u.author ?? "anon"}</span>
                  </div>
                  {canDelete && (
                    <button onClick={() => remove(u.id)} className="text-muted-foreground hover:text-destructive transition" aria-label="Delete update">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                {u.caption && <p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap">{u.caption}</p>}
                {u.images.length > 0 && (
                  <div className={`mt-2 grid gap-1.5 ${u.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                    {u.images.map((src) => (
                      <a key={src} href={src} target="_blank" rel="noreferrer" className="block rounded-md overflow-hidden border border-border hover:opacity-90 transition">
                        <img src={src} alt="" loading="lazy" className="w-full max-h-72 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
