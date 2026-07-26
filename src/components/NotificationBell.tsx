import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Bell, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Notif {
  id: string;
  development_id: string | null;
  kind: "comment" | "status" | "approval";
  data: { dev_title?: string; from?: string; to?: string } | null;
  created_at: string;
  read_at: string | null;
}

function describe(n: Notif): string {
  const title = n.data?.dev_title ?? "a development";
  if (n.kind === "comment") return `New comment on “${title}”`;
  if (n.kind === "approval") return `“${title}” was ${n.data?.to ?? "updated"}`;
  return `“${title}” is now ${(n.data?.to ?? "updated").replace(/_/g, " ")}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled) setItems((data ?? []) as unknown as Notif[]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!user) return null;

  const unread = items.filter((n) => !n.read_at).length;
  const now = () => new Date().toISOString();

  const openNotif = async (n: Notif) => {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: now() } : x)));
      await supabase.from("notifications").update({ read_at: now() }).eq("id", n.id);
    }
    if (n.development_id) navigate({ to: "/", search: { dev: n.development_id } });
  };

  const markAll = async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? now() })));
    await supabase.from("notifications").update({ read_at: now() }).in("id", ids);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative inline-flex items-center justify-center size-9 rounded-md text-white/85 hover:text-white hover:bg-white/10 transition"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#ffcc00] text-[#1a2b3c] text-[10px] font-bold leading-none">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-y-auto p-0 z-[1200]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-popover">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button
              onClick={markAll}
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              <Check className="size-3" /> Mark all read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            No notifications yet. Follow a development to get updates.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => openNotif(n)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-secondary transition flex gap-2 items-start ${
                    n.read_at ? "" : "bg-primary/5"
                  }`}
                >
                  <span
                    className={`mt-1 size-2 rounded-full shrink-0 ${n.read_at ? "bg-transparent" : "bg-primary"}`}
                    aria-hidden="true"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs leading-snug text-foreground">{describe(n)}</span>
                    <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                      {timeAgo(n.created_at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
