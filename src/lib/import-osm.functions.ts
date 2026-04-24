import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CITY_PRESETS, runOsmImport, type ImportResult } from "@/lib/import-osm.server";

/**
 * Client-side middleware that attaches the current Supabase session token
 * as a Bearer header so requireSupabaseAuth (server) can verify the user.
 */
const withAuthHeader = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});

/**
 * Admin-triggered OSM import. Called from /admin via useServerFn.
 * Verifies the caller is signed in AND has the 'admin' role before running.
 */
export const importOsmCity = createServerFn({ method: "POST" })
  .middleware([withAuthHeader, requireSupabaseAuth])
  .inputValidator((input: { city: string }) =>
    z
      .object({
        city: z.enum(Object.keys(CITY_PRESETS) as [string, ...string[]]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ImportResult> => {
    const { supabase: serverSupabase, userId } = context;

    // Confirm admin role using the user-scoped client (RLS enforced).
    const { data: roleRow, error } = await serverSupabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) throw new Error(`Role check failed: ${error.message}`);
    if (!roleRow) throw new Error("Forbidden: admin role required");

    return runOsmImport(data.city, userId);
  });
