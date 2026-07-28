import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MapPin, UserRound } from "lucide-react";
import { CATEGORY_COLORS, type Category } from "@/lib/constants";

export const Route = createFileRoute("/u/$userId")({
  component: ProfilePage,
});

interface DevRow {
  id: string;
  title: string;
  category: Category;
  status: string;
}

function ProfilePage() {
  const { userId } = Route.useParams();
  const { user } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [devs, setDevs] = useState<DevRow[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const isSelf = user?.id === userId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [prof, devRes, folRes, gRes, meRes] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
        supabase
          .from("developments")
          .select("id, title, category, status")
          .eq("user_id", userId)
          .eq("approval_status", "approved")
          .neq("source", "general")
          .order("created_at", { ascending: false }),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", userId),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
        user
          ? supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", userId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setName(prof.data?.display_name ?? null);
      setDevs((devRes.data ?? []) as DevRow[]);
      setFollowers(folRes.count ?? 0);
      setFollowing(gRes.count ?? 0);
      setIsFollowing(!!meRes.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, user?.id]);

  const toggleFollow = async () => {
    if (!user) return toast.info("Sign in to follow people");
    setBusy(true);
    if (isFollowing) {
      const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", userId);
      setBusy(false);
      if (error) return toast.error(error.message);
      setIsFollowing(false);
      setFollowers((c) => Math.max(0, c - 1));
    } else {
      const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: userId });
      setBusy(false);
      if (error) return toast.error(error.message);
      setIsFollowing(true);
      setFollowers((c) => c + 1);
      toast.success("Following");
    }
  };

  const displayName = name ?? "SiteWatch member";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl w-full mx-auto px-5 py-8 space-y-8">
        <Link to="/" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">
          <ArrowLeft className="size-3.5" /> Back to map
        </Link>

        {loading ? (
          <div className="py-16 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <span className="flex items-center justify-center size-16 rounded-full bg-primary text-primary-foreground text-2xl font-bold shrink-0">
                {name ? initial : <UserRound className="size-8" />}
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold truncate">{displayName}</h1>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{followers}</span> follower{followers === 1 ? "" : "s"}
                  {" · "}
                  <span className="font-semibold text-foreground">{following}</span> following
                  {" · "}
                  <span className="font-semibold text-foreground">{devs.length}</span> project{devs.length === 1 ? "" : "s"}
                </p>
              </div>
              {!isSelf && (
                <Button
                  onClick={toggleFollow}
                  disabled={busy}
                  variant={isFollowing ? "secondary" : "default"}
                  className="ml-auto shrink-0"
                >
                  {isFollowing ? "Following" : "Follow"}
                </Button>
              )}
            </div>

            <section>
              <h2 className="text-sm font-semibold mb-3">Projects contributed</h2>
              {devs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No public projects yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {devs.map((d) => (
                    <li key={d.id}>
                      <Link
                        to="/"
                        search={{ dev: d.id }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-secondary transition"
                      >
                        <span
                          className="size-8 rounded-md shrink-0 flex items-center justify-center"
                          style={{ backgroundColor: `${CATEGORY_COLORS[d.category]}1a` }}
                        >
                          <MapPin className="size-4" style={{ color: CATEGORY_COLORS[d.category] }} />
                        </span>
                        <span className="text-sm font-medium truncate">{d.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
