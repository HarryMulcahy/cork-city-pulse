import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CITY_PRESETS, runOsmImport, type ImportResult } from "@/lib/import-osm.server";

/**
 * Admin-triggered OSM import. Called from /admin via useServerFn.
 * Verifies the caller is signed in AND has the 'admin' role before running.
 * Imports are attributed to the calling admin.
 */
export const importOsmCity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { city: string }) =>
    z
      .object({
        city: z.enum(Object.keys(CITY_PRESETS) as [string, ...string[]]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ImportResult> => {
    const { supabase, userId } = context;

    // Confirm admin role using the user-scoped client (RLS enforced).
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) throw new Error(`Role check failed: ${error.message}`);
    if (!roles) throw new Error("Forbidden: admin role required");

    return runOsmImport(data.city, userId);
  });
