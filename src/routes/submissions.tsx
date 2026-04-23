import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Clock, MapPin, ClipboardList } from "lucide-react";
import { CATEGORY_COLORS, type Category, type Status } from "@/lib/constants";

export const Route = createFileRoute("/submissions")({
  component: SubmissionsPage,
});

interface SubRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: Category;
  status: Status;
  address: string | null;
  approval_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
  images: string[];
  display_name?: string;
}

function SubmissionsPage() {
  const { user, loading, isApprover } = useAuth();
  const [tab, setTab] = useState<"mine" | "review">("mine");
  const [rows, setRows] = useState<SubRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setFetching(true);
    const query = supabase.from("developments").select("*").order("created_at", { ascending: false });
    const { data } =
      tab === "mine"
        ? await query.eq("user_id", user.id)
        : await query.eq("approval_status", "pending");
    const list = (data ?? []) as SubRow[];
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]));
    }
    setRows(list.map((r) => ({ ...r, display_name: names[r.user_id] })));
    setFetching(false);
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab]);

  const approve = async (id: string) => {
    setActing(id);
    const { error } = await supabase
      .from("developments")
      .update({ approval_status: "approved", approved_by: user!.id, approved_at: new Date().toISOString() })
      .eq("id", id);
    setActing(null);
    if (error) return toast.error(error.message);
    toast.success("Approved — now visible on the map");
    load();
  };

  const reject = async (id: string) => {
    const reason = prompt("Reason for rejection (optional):") ?? "";
    setActing(id);
    const { error } = await supabase
      .from("developments")
      .update({ approval_status: "rejected", approved_by: user!.id, approved_at: new Date().toISOString(), rejection_reason: reason || null })
      .eq("id", id);
    setActing(null);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    load();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 grid place-items-center"><Loader2 className="size-6 animate-spin" /></div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 grid place-items-center text-center px-6">
          <div>
            <p className="text-muted-foreground mb-3">Sign in to view your submissions.</p>
            <Button asChild><Link to="/auth">Sign in</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  const statusBadge = (s: SubRow["approval_status"]) => {
    if (s === "approved") return <Badge className="bg-primary/15 text-primary text-[10px] uppercase tracking-wider"><CheckCircle2 className="size-3 mr-1" />Approved</Badge>;
    if (s === "rejected") return <Badge className="bg-destructive/15 text-destructive text-[10px] uppercase tracking-wider"><XCircle className="size-3 mr-1" />Rejected</Badge>;
    return <Badge className="bg-amber-500/15 text-amber-600 text-[10px] uppercase tracking-wider"><Clock className="size-3 mr-1" />Pending</Badge>;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-5 py-8 space-y-6">
        <div>
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary">&larr; Back to map</Link>
          <h1 className="text-3xl font-bold mt-2 flex items-center gap-2">
            <ClipboardList className="size-7 text-primary" /> Submissions
          </h1>
        </div>

        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setTab("mine")}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${tab === "mine" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            My submissions
          </button>
          {isApprover && (
            <button
              onClick={() => setTab("review")}
              className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${tab === "review" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Review queue
            </button>
          )}
        </div>

        {fetching ? (
          <div className="py-12 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            {tab === "mine" ? "You haven't submitted anything yet." : "Nothing pending. All caught up! 🎉"}
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const color = CATEGORY_COLORS[r.category];
              return (
                <li key={r.id} className="rounded-lg border border-border bg-card overflow-hidden flex">
                  {r.images[0] ? (
                    <img src={r.images[0]} alt="" className="w-32 h-32 object-cover shrink-0 hidden sm:block" />
                  ) : (
                    <div className="w-32 h-32 shrink-0 hidden sm:flex items-center justify-center" style={{ backgroundColor: `${color}1a` }}>
                      <MapPin className="size-8" style={{ color }} />
                    </div>
                  )}
                  <div className="flex-1 p-4 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <h3 className="font-semibold leading-tight">{r.title}</h3>
                      {statusBadge(r.approval_status)}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{r.description}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono flex-wrap">
                      <span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}1a`, color }}>{r.category}</span>
                      <span>·</span>
                      <span>by {r.display_name ?? "anon"}</span>
                      <span>·</span>
                      <span>{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    {r.rejection_reason && (
                      <p className="mt-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-1">
                        Rejected: {r.rejection_reason}
                      </p>
                    )}
                    {tab === "review" && r.approval_status === "pending" && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" disabled={acting === r.id} onClick={() => approve(r.id)} className="gap-1.5">
                          {acting === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" disabled={acting === r.id} onClick={() => reject(r.id)} className="gap-1.5">
                          <XCircle className="size-3.5" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
