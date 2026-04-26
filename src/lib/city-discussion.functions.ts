import { createServerFn } from "@tanstack/react-start";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

interface EnsureInput {
  cityId: string;
  cityName: string;
  lat: number;
  lng: number;
}

export const ensureCityDiscussion = createServerFn({ method: "POST" })
  .inputValidator((input: EnsureInput) => {
    if (
      !input ||
      typeof input.cityId !== "string" ||
      typeof input.cityName !== "string" ||
      typeof input.lat !== "number" ||
      typeof input.lng !== "number"
    ) {
      throw new Error("Invalid input");
    }
    if (input.cityId.length < 1 || input.cityId.length > 200) throw new Error("Invalid cityId");
    if (input.cityName.length < 1 || input.cityName.length > 200) throw new Error("Invalid cityName");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("developments")
      .select("id")
      .eq("source", "general")
      .eq("source_ref", data.cityId)
      .maybeSingle();

    if (existing) return { id: existing.id };

    const { data: inserted, error } = await supabaseAdmin
      .from("developments")
      .insert({
        user_id: SYSTEM_USER_ID,
        title: `${data.cityName} — General Discussion`,
        description: `A space to talk about ${data.cityName} in general — share thoughts, ask questions, or discuss anything that doesn't fit a specific development.`,
        category: "other",
        status: "completed",
        latitude: data.lat,
        longitude: data.lng,
        approval_status: "approved",
        source: "general",
        source_ref: data.cityId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });
