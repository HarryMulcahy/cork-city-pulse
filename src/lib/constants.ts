export const CATEGORIES = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "public_space", label: "Public Space" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "other", label: "Other" },
] as const;

export const STATUSES = [
  { value: "proposed", label: "Proposed" },
  { value: "planning", label: "Planning" },
  { value: "approved", label: "Approved" },
  { value: "under_construction", label: "Under Construction" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];
export type Status = (typeof STATUSES)[number]["value"];

/**
 * Distinct hex color per category. Used for both pin tint and area outline.
 * Picked for high contrast against the warm-stone basemap.
 */
export const CATEGORY_COLORS: Record<Category, string> = {
  residential: "#2563eb",      // blue
  commercial: "#9333ea",       // purple
  infrastructure: "#ea580c",   // orange
  public_space: "#16a34a",     // green
  mixed_use: "#0891b2",        // teal
  other: "#64748b",            // slate
};

/**
 * Lucide icon names per category. Resolved in components via dynamic lookup.
 */
export const CATEGORY_ICON_NAME: Record<Category, string> = {
  residential: "Home",
  commercial: "Building2",
  infrastructure: "TrainFront",
  public_space: "Trees",
  mixed_use: "LayoutGrid",
  other: "MapPin",
};
