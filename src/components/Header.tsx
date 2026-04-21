import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function Header() {
  const { user, displayName, signOut } = useAuth();

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-[1000]">
      <div className="flex items-center justify-between px-5 py-3 gap-4">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="text-xl font-bold tracking-tight">Cork Builds</span>
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground hidden sm:inline">
            citizen planning map
          </span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          {user ? (
            <>
              <span className="text-muted-foreground hidden sm:inline">
                Hi, <span className="text-foreground font-medium">{displayName ?? "neighbour"}</span>
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
