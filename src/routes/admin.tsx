import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, Trash2, Loader2, UserPlus, Download } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface RoleRow {
  id: string;
  user_id: string;
  role: AppRole;
  city_name: string | null;
  created_at: string;
  display_name?: string;
}

const ASSIGNABLE_ROLES: { value: AppRole; label: string; desc: string }[] = [
  { value: "admin", label: "Admin", desc: "Full access — manages all roles" },
  { value: "city_mod", label: "City Moderator", desc: "Can approve submissions and appoint other mods" },
  { value: "developer", label: "Developer", desc: "Can submit and approve developments" },
  { value: "user", label: "Standard User", desc: "Can submit (requires approval) and comment" },
];

function AdminPage() {
  const { user, loading, isAdmin, isCityMod } = useAuth();
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("city_mod");
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);

  const canManage = isAdmin || isCityMod;

  const runImport = async (city: string) => {
    setImporting(true);
    try {
      const res = await fetch("/api/public/hooks/import-osm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        inserted?: number;
        skipped?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(json.error ?? "Import failed");
      } else {
        toast.success(
          `Imported ${json.inserted} new sites · ${json.skipped} already existed${
            json.failed ? ` · ${json.failed} failed` : ""
          }. Review them in the queue.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };
  // City mods can only assign city_mod
  const allowedRoles = isAdmin ? ASSIGNABLE_ROLES : ASSIGNABLE_ROLES.filter((r) => r.value === "city_mod");

  const load = async () => {
    setFetching(true);
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("*")
      .order("created_at", { ascending: false });
    const ids = Array.from(new Set((roleData ?? []).map((r) => r.user_id)));
    let names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]));
    }
    setRows(
      (roleData ?? []).map((r) => ({
        ...(r as RoleRow),
        display_name: names[r.user_id],
      })),
    );
    setFetching(false);
  };

  useEffect(() => {
    if (canManage) load();
  }, [canManage]);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    // Look up user by email via profiles join — we need auth.users which isn't directly readable.
    // Workaround: search profiles by display_name, OR ask for user id. Simpler: search by display_name.
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", email.trim());
    if (!profs || profs.length === 0) {
      setSubmitting(false);
      toast.error("No user found with that display name");
      return;
    }
    if (profs.length > 1) {
      setSubmitting(false);
      toast.error("Multiple users match — please be more specific");
      return;
    }
    const targetId = profs[0].id;
    const { error } = await supabase.from("user_roles").insert({ user_id: targetId, role: newRole });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(`Granted ${newRole} to ${profs[0].display_name}`);
    setEmail("");
    load();
  };

  const revoke = async (id: string, label: string) => {
    if (!confirm(`Revoke ${label}?`)) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Role revoked");
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
            <p className="text-muted-foreground mb-3">Sign in to view this page.</p>
            <Button asChild><Link to="/auth">Sign in</Link></Button>
          </div>
        </div>
      </div>
    );
  }
  if (!canManage) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 grid place-items-center text-center px-6">
          <div>
            <Shield className="size-10 mx-auto mb-3 text-muted-foreground" />
            <h1 className="text-xl font-bold mb-1">Restricted</h1>
            <p className="text-muted-foreground text-sm">Only admins and city moderators can manage roles.</p>
            <Button asChild variant="outline" className="mt-4"><Link to="/">Back to map</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  const roleColor: Record<AppRole, string> = {
    admin: "bg-destructive/15 text-destructive",
    city_mod: "bg-primary/15 text-primary",
    developer: "bg-secondary text-secondary-foreground",
    user: "bg-muted text-muted-foreground",
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-5 py-8 space-y-8">
        <div>
          <Link to="/" className="text-xs text-muted-foreground hover:text-primary">&larr; Back to map</Link>
          <h1 className="text-3xl font-bold mt-2 flex items-center gap-2">
            <Shield className="size-7 text-primary" /> Role management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? "Grant or revoke any role. The first signup is admin by default."
              : "City moderators can appoint other city moderators."}
          </p>
        </div>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><UserPlus className="size-4" /> Grant a role</h2>
          <form onSubmit={grant} className="grid sm:grid-cols-[1fr_180px_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="dn">User display name</Label>
              <Input id="dn" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Exact display name" required />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allowedRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <div>
                        <div className="font-medium">{r.label}</div>
                        <div className="text-[11px] text-muted-foreground">{r.desc}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="size-4 animate-spin" />} Grant
            </Button>
          </form>
        </section>

        {isAdmin && (
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold mb-1 flex items-center gap-2">
              <Download className="size-4" /> Auto-import from OpenStreetMap
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Pulls construction sites and large development polygons tagged in OSM. Imports go
              into the review queue tagged as <code className="text-xs">osm</code> — approve them
              like any other submission. Duplicates are skipped automatically.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => runImport("dublin")}
                disabled={importing}
                variant="outline"
                className="gap-2"
              >
                {importing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Import Dublin sites
              </Button>
              <span className="text-xs text-muted-foreground">
                Runs automatically once a week. Click to trigger now.
              </span>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">All role assignments</h2>
            <span className="text-xs text-muted-foreground">{rows.length} total</span>
          </div>
          {fetching ? (
            <div className="py-12 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground text-center">No roles assigned yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const canRevoke = isAdmin && r.user_id !== user.id;
                return (
                  <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{r.display_name ?? r.user_id.slice(0, 8)}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        Granted {new Date(r.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={`${roleColor[r.role]} text-[10px] uppercase tracking-wider`}>{r.role}</Badge>
                      {canRevoke && (
                        <button
                          onClick={() => revoke(r.id, `${r.role} from ${r.display_name ?? "user"}`)}
                          className="text-destructive hover:opacity-70"
                          aria-label="Revoke"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
