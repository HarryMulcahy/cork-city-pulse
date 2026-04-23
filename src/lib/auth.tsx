import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "city_mod" | "developer" | "user";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  displayName: string | null;
  roles: AppRole[];
  isAdmin: boolean;
  isCityMod: boolean;
  isDeveloper: boolean;
  isApprover: boolean;
  refreshRoles: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const fetchRoles = async (uid: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        const uid = s.user.id;
        setTimeout(() => {
          supabase
            .from("profiles")
            .select("display_name")
            .eq("id", uid)
            .maybeSingle()
            .then(({ data }) => setDisplayName(data?.display_name ?? null));
          fetchRoles(uid);
        }, 0);
      } else {
        setDisplayName(null);
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) fetchRoles(data.session.user.id);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshRoles = async () => {
    if (session?.user) await fetchRoles(session.user.id);
  };

  const isAdmin = roles.includes("admin");
  const isCityMod = roles.includes("city_mod");
  const isDeveloper = roles.includes("developer");
  const isApprover = isAdmin || isCityMod || isDeveloper;

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        displayName,
        roles,
        isAdmin,
        isCityMod,
        isDeveloper,
        isApprover,
        refreshRoles,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
