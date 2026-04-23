import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { MapPin, ChevronDown, Shield, ClipboardList } from "lucide-react";
import type { City } from "@/lib/cities";

interface Props {
  city?: City | null;
  onChangeCity?: () => void;
}

export function Header({ city, onChangeCity }: Props) {
  const { user, displayName, signOut, isAdmin, isApprover, roles } = useAuth();

  const primaryRole =
    roles.includes("admin") ? "Admin"
    : roles.includes("city_mod") ? "City Mod"
    : roles.includes("developer") ? "Developer"
    : null;

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-[1000]">
      <div className="flex items-center justify-between px-5 py-3 gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          <Link to="/" className="text-xl font-bold tracking-tight shrink-0">
            City Builds
          </Link>
          {city && onChangeCity && (
            <button
              onClick={onChangeCity}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition group"
              aria-label="Change city"
            >
              <MapPin className="size-3" />
              <span className="font-semibold text-foreground group-hover:text-primary">{city.name}</span>
              <ChevronDown className="size-3 opacity-60" />
            </button>
          )}
        </div>
        <nav className="flex items-center gap-2 text-sm">
          {city && onChangeCity && (
            <Button variant="ghost" size="sm" onClick={onChangeCity} className="sm:hidden gap-1">
              <MapPin className="size-3.5" /> {city.name}
            </Button>
          )}
          {user && (
            <Button asChild variant="ghost" size="sm" className="gap-1.5 hidden sm:inline-flex">
              <Link to="/submissions">
                <ClipboardList className="size-3.5" />
                {isApprover ? "Review" : "My subs"}
              </Link>
            </Button>
          )}
          {isAdmin && (
            <Button asChild variant="ghost" size="sm" className="gap-1.5 hidden sm:inline-flex">
              <Link to="/admin">
                <Shield className="size-3.5" />
                Admin
              </Link>
            </Button>
          )}
          {user ? (
            <>
              <span className="text-muted-foreground hidden md:inline">
                Hi, <span className="text-foreground font-medium">{displayName ?? "neighbour"}</span>
                {primaryRole && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider text-primary font-bold">
                    · {primaryRole}
                  </span>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
