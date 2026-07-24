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
 * Distinct hex color per category. Used for pin fill, area outline, and swatches.
 * Chosen to stay >= 4.5:1 (WCAG AA) as white-on-fill so they work as text/pill colors.
 */
export const CATEGORY_COLORS: Record<Category, string> = {
  residential: "#2563eb",      // blue-600
  commercial: "#9333ea",       // purple-600
  infrastructure: "#c2410c",   // orange-700 (darkened for AA contrast)
  public_space: "#15803d",     // green-700 (darkened for AA contrast)
  mixed_use: "#0e7490",        // cyan-700 (darkened for AA contrast)
  other: "#64748b",            // slate-500
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
