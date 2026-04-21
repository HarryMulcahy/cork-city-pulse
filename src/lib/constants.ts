export const CORK_CENTER: [number, number] = [51.8985, -8.4756];
export const CORK_BOUNDS: [[number, number], [number, number]] = [
  [51.83, -8.6],
  [51.95, -8.34],
];

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
