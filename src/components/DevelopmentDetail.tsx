import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
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
import { ProgressTimeline } from "@/components/ProgressTimeline";
import {
  STATUS_COLORS,
  statusLabel,
  categoryLabel,
  type Development,
  type Comment,
  type ShapeData,
  type ShapeKind,
  type LatLng,
} from "@/lib/developments";
import {
  Activity,
  ArrowLeft,
  Bell,
  Building2,
  CheckCircle2,
  ChevronUp,
  Clock,
  Globe2,
  Hexagon,
  ImagePlus,
  Loader2,
  MapPin,
  MessageSquare,
  MoreVertical,
  Pencil,
  Reply,
  Spline,
  Tag,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

interface DetailProps {
  dev: Development;
  cityName: string;
  onBack: () => void;
  onChange: () => void;
  pendingShape: ShapeData | null;
  consumePendingShape: () => void;
  onStartDraw: (shape: ShapeKind) => void;
  pendingPoint: LatLng | null;
  consumePendingPoint: () => void;
  onStartMovePin: () => void;
}

export function DevelopmentDetail({
  dev,
  cityName,
  onBack,
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
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [commentSort, setCommentSort] = useState<"top" | "new">("top");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(dev.title);
  const [editDescription, setEditDescription] = useState(dev.description);
  const [editAddress, setEditAddress] = useState(dev.address ?? "");
  const [editCategory, setEditCategory] = useState<Category>(dev.category);
  const [editStatus, setEditStatus] = useState<Status>(dev.status);
  const [editHeight, setEditHeight] = useState(dev.height_m != null ? String(dev.height_m) : "");
  const [editFloors, setEditFloors] = useState(dev.floor_count != null ? String(dev.floor_count) : "");
  const [editArchitect, setEditArchitect] = useState(dev.architect ?? "");
  const [editDeveloper, setEditDeveloper] = useState(dev.developer ?? "");
  const [editYear, setEditYear] = useState(dev.completion_year != null ? String(dev.completion_year) : "");
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
    setEditHeight(dev.height_m != null ? String(dev.height_m) : "");
    setEditFloors(dev.floor_count != null ? String(dev.floor_count) : "");
    setEditArchitect(dev.architect ?? "");
    setEditDeveloper(dev.developer ?? "");
    setEditYear(dev.completion_year != null ? String(dev.completion_year) : "");
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
        height_m: editHeight.trim() && Number.isFinite(Number(editHeight)) ? Number(editHeight) : null,
        floor_count: editFloors.trim() && Number.isInteger(Number(editFloors)) ? Number(editFloors) : null,
        architect: editArchitect.trim().slice(0, 120) || null,
        developer: editDeveloper.trim().slice(0, 120) || null,
        completion_year: editYear.trim() && Number.isInteger(Number(editYear)) ? Number(editYear) : null,
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

    const commentIds = rows.map((r) => r.id);
    if (commentIds.length) {
      const { data: vs } = await supabase
        .from("comment_votes")
        .select("comment_id, user_id")
        .in("comment_id", commentIds);
      const counts: Record<string, number> = {};
      const mine = new Set<string>();
      for (const v of vs ?? []) {
        counts[v.comment_id] = (counts[v.comment_id] ?? 0) + 1;
        if (user && v.user_id === user.id) mine.add(v.comment_id);
      }
      setVotes(counts);
      setMyVotes(mine);
    } else {
      setVotes({});
      setMyVotes(new Set());
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dev.id]);

  // Is the current user following this development?
  useEffect(() => {
    if (!user) {
      setFollowing(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("development_id", dev.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFollowing(!!data);
      });
    return () => {
      cancelled = true;
    };
  }, [dev.id, user?.id]);

  const toggleFollow = async () => {
    if (!user) return toast.info("Sign in to follow this development");
    setFollowBusy(true);
    if (following) {
      const { error } = await supabase
        .from("subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("development_id", dev.id);
      setFollowBusy(false);
      if (error) return toast.error(error.message);
      setFollowing(false);
      toast("Unfollowed — you won't get updates for this");
    } else {
      const { error } = await supabase
        .from("subscriptions")
        .insert({ user_id: user.id, development_id: dev.id });
      setFollowBusy(false);
      if (error) return toast.error(error.message);
      setFollowing(true);
      toast.success("Following — we'll notify you of updates");
    }
  };

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

  const startEditComment = (c: Comment) => {
    setEditingCommentId(c.id);
    setEditingCommentBody(c.body);
  };

  const saveCommentEdit = async () => {
    if (!editingCommentId) return;
    const next = editingCommentBody.trim();
    if (next.length < 2) return;
    setSavingComment(true);
    const { error } = await supabase
      .from("comments")
      .update({ body: next.slice(0, 1000) })
      .eq("id", editingCommentId);
    setSavingComment(false);
    if (error) return toast.error(error.message);
    setEditingCommentId(null);
    setEditingCommentBody("");
    load();
  };

  const doDeleteComment = async () => {
    if (!deleteCommentId) return;
    const { error } = await supabase.from("comments").delete().eq("id", deleteCommentId);
    if (error) return toast.error(error.message);
    setDeleteCommentId(null);
    toast.success("Comment deleted");
    load();
  };

  const toggleVote = async (commentId: string) => {
    if (!user) return toast.info("Sign in to upvote");
    const voted = myVotes.has(commentId);
    setMyVotes((prev) => {
      const n = new Set(prev);
      if (voted) n.delete(commentId);
      else n.add(commentId);
      return n;
    });
    setVotes((prev) => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] ?? 0) + (voted ? -1 : 1)) }));
    if (voted) {
      await supabase.from("comment_votes").delete().eq("comment_id", commentId).eq("user_id", user.id);
    } else {
      await supabase.from("comment_votes").insert({ comment_id: commentId, user_id: user.id });
    }
  };

  const postReply = async (parentId: string) => {
    if (!user) return;
    const text = replyBody.trim();
    if (text.length < 2) return;
    const { error } = await supabase.from("comments").insert({
      development_id: dev.id,
      user_id: user.id,
      body: text.slice(0, 1000),
      parent_id: parentId,
    });
    if (error) return toast.error(error.message);
    setReplyBody("");
    setReplyTo(null);
    load();
  };

  const remove = async () => {
    const { error } = await supabase.from("developments").delete().eq("id", dev.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    setConfirmDeleteOpen(false);
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
    setApproving(true);
    const { error } = await supabase
      .from("developments")
      .update({
        approval_status: "rejected",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        rejection_reason: rejectReason.trim() || null,
      })
      .eq("id", dev.id);
    setApproving(false);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    setRejectOpen(false);
    setRejectReason("");
    onChange();
  };

  // Build the comment tree: top-level (sorted) + replies grouped by parent.
  const repliesByParent: Record<string, Comment[]> = {};
  for (const c of comments) {
    if (c.parent_id) (repliesByParent[c.parent_id] ??= []).push(c);
  }
  Object.values(repliesByParent).forEach((arr) =>
    arr.sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
  );
  const topLevel = comments
    .filter((c) => !c.parent_id)
    .sort((a, b) => {
      if (commentSort === "new") return a.created_at < b.created_at ? 1 : -1;
      const va = votes[a.id] ?? 0;
      const vb = votes[b.id] ?? 0;
      if (vb !== va) return vb - va;
      return a.created_at < b.created_at ? -1 : 1;
    });

  const renderComment = (c: Comment, isReply: boolean) => {
    const isCommentOwner = user?.id === c.user_id;
    const isEditing = editingCommentId === c.id;
    const count = votes[c.id] ?? 0;
    const voted = myVotes.has(c.id);
    const replies = repliesByParent[c.id] ?? [];
    return (
      <li key={c.id} className="bg-secondary/60 rounded-md p-3">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <Link
            to="/u/$userId"
            params={{ userId: c.user_id }}
            className="text-xs font-semibold hover:text-primary hover:underline"
          >
            {c.profiles?.display_name ?? "anon"}
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground">
              {new Date(c.created_at).toLocaleDateString()}
            </span>
            {(isCommentOwner || isApprover) && !isEditing && (
              <div className="flex items-center gap-1">
                {isCommentOwner && (
                  <button
                    type="button"
                    onClick={() => startEditComment(c)}
                    className="text-muted-foreground hover:text-foreground transition"
                    aria-label="Edit comment"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleteCommentId(c.id)}
                  className="text-muted-foreground hover:text-destructive transition"
                  aria-label={isCommentOwner ? "Delete comment" : "Remove comment (moderator)"}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editingCommentBody}
              onChange={(e) => setEditingCommentBody(e.target.value)}
              maxLength={1000}
              rows={3}
              aria-label="Edit comment"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={saveCommentEdit} disabled={savingComment || editingCommentBody.trim().length < 2}>
                {savingComment ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingCommentId(null);
                  setEditingCommentBody("");
                }}
                disabled={savingComment}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.body}</p>
        )}
        {!isEditing && (
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={() => toggleVote(c.id)}
              aria-pressed={voted}
              className={`inline-flex items-center gap-1 text-xs transition ${
                voted ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ChevronUp className="size-3.5" />
              {count > 0 ? count : "Upvote"}
            </button>
            {!isReply && user && (
              <button
                type="button"
                onClick={() => {
                  setReplyTo(replyTo === c.id ? null : c.id);
                  setReplyBody("");
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
              >
                <Reply className="size-3.5" /> Reply
              </button>
            )}
          </div>
        )}
        {replyTo === c.id && user && (
          <div className="mt-2 space-y-2">
            <Textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Write a reply…"
              aria-label="Reply"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => postReply(c.id)} disabled={replyBody.trim().length < 2}>
                Reply
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setReplyTo(null); setReplyBody(""); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {replies.length > 0 && (
          <ul className="mt-3 space-y-2 pl-3 border-l-2 border-border">
            {replies.map((r) => renderComment(r, true))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background" role="region" aria-label={`${dev.title} details`}>
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent className="z-[1300]">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this development?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{dev.title}" and its photos, and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={rejectOpen}
        onOpenChange={(o) => {
          setRejectOpen(o);
          if (!o) setRejectReason("");
        }}
      >
        <DialogContent className="z-[1300]">
          <DialogHeader>
            <DialogTitle>Reject submission</DialogTitle>
            <DialogDescription>
              Optionally tell the submitter why — they'll see this on their rejected submission.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="e.g. Duplicate of an existing pin, or not a real development."
            aria-label="Reason for rejection"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={approving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={approving} className="gap-1.5">
              {approving && <Loader2 className="size-4 animate-spin" />}
              Reject submission
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteCommentId !== null} onOpenChange={(o) => { if (!o) setDeleteCommentId(null); }}>
        <AlertDialogContent className="z-[1300]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the comment and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDeleteComment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sticky Back bar */}
      <div className="sticky top-0 z-20 flex items-center gap-2 px-4 py-3 bg-card/95 backdrop-blur border-b border-border">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 -ml-1 px-2 py-1.5 rounded-md text-sm font-semibold text-foreground hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition"
          aria-label={`Back to ${cityName}`}
        >
          <ArrowLeft className="size-4" />
          <span className="truncate max-w-[200px]">Back to {cityName}</span>
        </button>
        {user && (
          <Button
            size="sm"
            variant={following ? "secondary" : "outline"}
            onClick={toggleFollow}
            disabled={followBusy}
            aria-pressed={following}
            className="ml-auto gap-1.5"
            title={following ? "Stop getting updates" : "Get notified of updates"}
          >
            <Bell className={`size-3.5 ${following ? "fill-current" : ""}`} />
            {following ? "Following" : "Follow"}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scroll-slim">
        {/* Hero image — full width of the panel */}
        {dev.images.length > 0 && (
          <div className="w-full bg-secondary border-b border-border">
            <img
              src={dev.images[0]}
              alt={dev.title}
              className="block w-full max-h-[420px] object-cover"
            />
            {dev.images.length > 1 && (
              <div className="px-6 py-3 grid grid-cols-4 gap-2 max-w-3xl mx-auto">
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

        {/* Centered, max-width content */}
        <div className="px-6 py-6 max-w-3xl mx-auto">
        <div className="space-y-2">
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
          <h1 className="text-3xl sm:text-4xl leading-[1.05] font-semibold tracking-[-0.03em] text-balance">{dev.title}</h1>
          {dev.address && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <MapPin className="size-3.5" /> {dev.address}
            </p>
          )}
        </div>

      {dev.approval_status === "pending" && isApprover && (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
            <Clock className="size-3.5" /> Awaiting your review
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={approving} onClick={approve} className="gap-1.5 flex-1">
              {approving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={approving} onClick={() => setRejectOpen(true)} className="gap-1.5 flex-1">
              <XCircle className="size-3.5" />
              Reject
            </Button>
          </div>
        </div>
      )}
      {dev.approval_status === "pending" && !isApprover && dev.user_id === user?.id && (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 flex items-center gap-1.5">
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

      {dev.source !== "general" &&
        (dev.height_m || dev.floor_count || dev.architect || dev.developer || dev.completion_year) && (
          <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
            <p className="flex items-center gap-1.5 border-b border-border bg-secondary/40 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground/60">
              <Building2 className="size-3.5" /> Specifications
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 text-xs">
              {dev.height_m ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Height</dt>
                  <dd className="font-semibold font-mono">{dev.height_m} m</dd>
                </div>
              ) : null}
              {dev.floor_count ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Floors</dt>
                  <dd className="font-semibold font-mono">{dev.floor_count}</dd>
                </div>
              ) : null}
              {dev.completion_year ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Completion</dt>
                  <dd className="font-semibold font-mono">{dev.completion_year}</dd>
                </div>
              ) : null}
              {dev.architect ? (
                <div className="flex justify-between gap-2 col-span-2">
                  <dt className="text-muted-foreground shrink-0">Architect</dt>
                  <dd className="font-semibold text-right truncate">{dev.architect}</dd>
                </div>
              ) : null}
              {dev.developer ? (
                <div className="flex justify-between gap-2 col-span-2">
                  <dt className="text-muted-foreground shrink-0">Developer</dt>
                  <dd className="font-semibold text-right truncate">{dev.developer}</dd>
                </div>
              ) : null}
            </dl>
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
            <Label className="flex items-center gap-1.5">
              <Building2 className="size-3.5" /> Specifications (optional)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" inputMode="decimal" value={editHeight} onChange={(e) => setEditHeight(e.target.value)} placeholder="Height (m)" aria-label="Height in metres" />
              <Input type="number" inputMode="numeric" value={editFloors} onChange={(e) => setEditFloors(e.target.value)} placeholder="Floors" aria-label="Floor count" />
              <Input value={editArchitect} onChange={(e) => setEditArchitect(e.target.value)} maxLength={120} placeholder="Architect" aria-label="Architect" />
              <Input value={editDeveloper} onChange={(e) => setEditDeveloper(e.target.value)} maxLength={120} placeholder="Developer" aria-label="Developer" />
              <Input type="number" inputMode="numeric" value={editYear} onChange={(e) => setEditYear(e.target.value)} placeholder="Completion year" aria-label="Completion year" className="col-span-2" />
            </div>
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
                <span className="flex items-center gap-2">
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
                    <span className="absolute bottom-1 left-1 bg-primary text-primary-foreground text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded">
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
              <Link
                to="/u/$userId"
                params={{ userId: dev.user_id }}
                className="font-bold text-foreground hover:text-primary hover:underline"
              >
                {dev.profiles?.display_name ?? "anon"}
              </Link>{" "}
              ·{" "}
              <span className="font-bold text-foreground">
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
                  <DropdownMenuItem onClick={() => setConfirmDeleteOpen(true)} className="gap-2 text-destructive focus:text-destructive">
                    <Trash2 className="size-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      {dev.source !== "general" && (
        <div className="mt-8">
          <ProgressTimeline developmentId={dev.id} />
        </div>
      )}

      <div className="mt-8 flex-1">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <MessageSquare className="size-4" /> Discussion ({comments.length})
          </h2>
          {topLevel.length > 1 && (
            <div className="flex text-[11px] rounded-md bg-secondary p-0.5">
              <button
                onClick={() => setCommentSort("top")}
                aria-pressed={commentSort === "top"}
                className={`px-2 py-1 rounded transition ${commentSort === "top" ? "bg-card shadow-sm text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                Top
              </button>
              <button
                onClick={() => setCommentSort("new")}
                aria-pressed={commentSort === "new"}
                className={`px-2 py-1 rounded transition ${commentSort === "new" ? "bg-card shadow-sm text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                Newest
              </button>
            </div>
          )}
        </div>
        <ul className="space-y-3 mb-4">
          {topLevel.length === 0 ? (
            <li className="text-xs text-muted-foreground italic">No comments yet — start the conversation.</li>
          ) : (
            topLevel.map((c) => renderComment(c, false))
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
