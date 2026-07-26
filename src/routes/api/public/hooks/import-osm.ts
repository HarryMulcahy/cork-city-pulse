import { createFileRoute } from "@tanstack/react-router";
import { CITY_PRESETS, getFirstAdminId, runOsmImport } from "@/lib/import-osm.server";

/**
 * Public cron endpoint. Works only on the PUBLISHED site (preview requires login).
 * The admin "Import now" button uses a server function instead — see
 * src/lib/import-osm.functions.ts.
 */
export const Route = createFileRoute("/api/public/hooks/import-osm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Optional shared-secret gate. Backwards-compatible: only enforced once
        // CRON_SECRET is set in the server environment AND the caller sends a matching
        // `x-cron-secret` header. Until then the endpoint behaves exactly as before.
        //
        // ⚠️ To ENABLE this safely you must do BOTH together, or the weekly cron breaks:
        //   1. set the CRON_SECRET server env var, and
        //   2. apply migration 20260725084902_import_hook_cron_secret.sql AND create a
        //      Supabase Vault secret named `cron_secret` with the same value, so the
        //      weekly pg_cron job sends the matching x-cron-secret header.
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && request.headers.get("x-cron-secret") !== cronSecret) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        let body: { city?: string } = {};
        try {
          body = (await request.json()) as { city?: string };
        } catch {
          // empty body OK
        }
        const cityKey = (body.city ?? "dublin").toLowerCase();
        if (!CITY_PRESETS[cityKey]) {
          return new Response(JSON.stringify({ error: `Unknown city: ${cityKey}` }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const importerId = await getFirstAdminId();
          const result = await runOsmImport(cityKey, importerId);
          return new Response(JSON.stringify({ success: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error("OSM import failed:", msg);
          return new Response(JSON.stringify({ success: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
