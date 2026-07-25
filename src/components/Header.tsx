import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { MapPin, ChevronDown, Shield, ClipboardList, Inbox } from "lucide-react";
import type { City } from "@/lib/cities";
import logoUrl from "@/assets/sitewatch-logo.png";
import { NotificationBell } from "./NotificationBell";

interface Props {
  city?: City | null;
  onChangeCity?: () => void;
  pendingCount?: number;
}

export function Header({ city, onChangeCity, pendingCount = 0 }: Props) {
  const { user, displayName, signOut, isAdmin, isApprover, roles } = useAuth();

  const primaryRole =
    roles.includes("admin") ? "Admin"
    : roles.includes("city_mod") ? "City Mod"
    : roles.includes("developer") ? "Developer"
    : null;

  return (
    <header className="border-b-2 border-[#ffcc00] bg-[#1a2b3c] text-white sticky top-0 z-[1000] shadow-md">
      <div className="flex items-center justify-between px-5 py-2.5 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="SiteWatch home">
            <img
              src={logoUrl}
              alt=""
              width={32}
              height={32}
              className="size-8 rounded-sm bg-white/95 p-0.5"
            />
            <span className="text-xl font-bold tracking-tight">
              Site<span className="text-[#ffcc00]">Watch</span>
            </span>
          </Link>
          {city && onChangeCity && (
            <button
              onClick={onChangeCity}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-white/70 hover:text-white transition group ml-2"
              aria-label="Change city"
            >
              <MapPin className="size-3" />
              <span className="font-bold text-white group-hover:text-[#ffcc00]">{city.name}</span>
              <ChevronDown className="size-3 opacity-60" />
            </button>
          )}
        </div>
        <nav className="flex items-center gap-1.5 text-sm">
          {city && onChangeCity && (
            <Button variant="ghost" size="sm" onClick={onChangeCity} className="sm:hidden gap-1 text-white hover:bg-white/10 hover:text-white">
              <MapPin className="size-3.5" /> {city.name}
            </Button>
          )}
          {user && <NotificationBell />}
          {user && (
            <Link
              to="/submissions"
              className="relative inline-flex items-center justify-center size-9 rounded-md text-white/85 hover:text-white hover:bg-white/10 transition"
              aria-label={isApprover ? `Review queue (${pendingCount} pending)` : `My submissions (${pendingCount} pending)`}
              title={isApprover ? "Review queue" : "My submissions"}
            >
              <Inbox className="size-4" />
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#ffcc00] text-[#1a2b3c] text-[10px] font-bold leading-none">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </Link>
          )}
          {isAdmin && (
            <Button asChild variant="ghost" size="sm" className="gap-1.5 hidden sm:inline-flex text-white hover:bg-white/10 hover:text-white">
              <Link to="/admin">
                <Shield className="size-3.5" />
                Admin
              </Link>
            </Button>
          )}
          {user ? (
            <>
              <span className="text-white/70 hidden md:inline">
                Hi, <span className="text-white font-semibold">{displayName ?? "neighbour"}</span>
                {primaryRole && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[#ffcc00] font-bold">
                    · {primaryRole}
                  </span>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut} className="text-white hover:bg-white/10 hover:text-white">
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm" className="bg-[#ffcc00] text-[#1a2b3c] hover:bg-[#ffcc00]/90 font-bold">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
