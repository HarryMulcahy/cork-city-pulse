import { type Dispatch, type SetStateAction } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LatestProgressFeed } from "@/components/LatestProgressFeed";
import { RankingsPanel } from "@/components/RankingsPanel";
import { CATEGORIES, STATUSES, CATEGORY_COLORS, type Category, type Status } from "@/lib/constants";
import {
  STATUS_COLORS,
  statusLabel,
  categoryLabel,
  formatRelative,
  type Development,
} from "@/lib/developments";
import type { City } from "@/lib/cities";
import {
  HelpCircle,
  Minimize2,
  Maximize2,
  PanelLeftClose,
  MapPin,
  Plus,
  TrendingUp,
  Building2,
  Search,
  X,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  MessageSquare,
} from "lucide-react";

type SidebarMode = "collapsed" | "side" | "full";
type SidebarView = "projects" | "latest" | "ranks";
type SortBy = "activity" | "newest" | "discussed" | "az";

interface DevelopmentSidebarProps {
  filteredDevs: Development[];
  cityDevs: Development[];
  cityDiscussion: Development | null;
  selected: Development | null;
  city: City;
  filtersActive: boolean;
  unreadCount: number;
  initialLoading: boolean;
  sidebarMode: SidebarMode;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode>>;
  sidebarView: SidebarView;
  setSidebarView: Dispatch<SetStateAction<SidebarView>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  sortBy: SortBy;
  setSortBy: Dispatch<SetStateAction<SortBy>>;
  filtersOpen: boolean;
  setFiltersOpen: Dispatch<SetStateAction<boolean>>;
  categoryFilter: Set<Category>;
  setCategoryFilter: Dispatch<SetStateAction<Set<Category>>>;
  statusFilter: Set<Status>;
  setStatusFilter: Dispatch<SetStateAction<Set<Status>>>;
  setOnboardingOpen: Dispatch<SetStateAction<boolean>>;
  startPicking: () => void;
  openDevelopmentRoute: (d: Development | null) => void;
  isUnread: (d: Development) => boolean;
}

/**
 * The docked sidebar for the map page: project count + controls, the
 * Projects / Latest / Ranks view toggle, search + filters, and the three
 * views (project list, citywide progress feed, rankings). Extracted from
 * routes/index.tsx; the detail-panel overlay stays in the page since it owns
 * the map draw/pick state.
 */
export function DevelopmentSidebar({
  filteredDevs,
  cityDevs,
  cityDiscussion,
  selected,
  city,
  filtersActive,
  unreadCount,
  initialLoading,
  sidebarMode,
  setSidebarMode,
  sidebarView,
  setSidebarView,
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  filtersOpen,
  setFiltersOpen,
  categoryFilter,
  setCategoryFilter,
  statusFilter,
  setStatusFilter,
  setOnboardingOpen,
  startPicking,
  openDevelopmentRoute,
  isUnread,
}: DevelopmentSidebarProps) {
  const { user } = useAuth();
  const toggleInSet = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  return (
    <>
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{filteredDevs.length}</span>
                {filtersActive && <span className="text-muted-foreground">/{cityDevs.length}</span>}{" "}
                {filteredDevs.length === 1 ? "development" : "developments"}
                {unreadCount > 0 && (
                  <> · <span className="text-primary font-semibold">{unreadCount} new</span></>
                )}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setOnboardingOpen(true)}
                  className="text-muted-foreground hover:text-foreground transition p-1"
                  aria-label="How SiteWatch works"
                  title="How it works"
                >
                  <HelpCircle className="size-4" />
                </button>
                {/* Fullscreen toggle: hidden on mobile (sidebar is already full-width) */}
                <button
                  onClick={() => setSidebarMode(sidebarMode === "full" ? "side" : "full")}
                  className="hidden sm:inline-flex text-muted-foreground hover:text-foreground transition p-1"
                  aria-label={sidebarMode === "full" ? "Exit fullscreen" : "Expand to fullscreen"}
                  title={sidebarMode === "full" ? "Side view" : "Fullscreen"}
                >
                  {sidebarMode === "full" ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>
                {/* Close button: icon-only on desktop, labelled "Close map" button on mobile */}
                <button
                  onClick={() => setSidebarMode("collapsed")}
                  className="hidden sm:inline-flex text-muted-foreground hover:text-foreground transition p-1"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="size-4" />
                </button>
                <button
                  onClick={() => setSidebarMode("collapsed")}
                  className="sm:hidden inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary/80 transition"
                  aria-label="Show map"
                >
                  <MapPin className="size-3.5" />
                  Show map
                </button>
              </div>
            </div>
            <Button onClick={startPicking} className="btn-cta w-full mt-3 gap-2 h-11 rounded-md">
              <Plus className="size-4" />
              Submit a development
            </Button>
            {!user && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                <Link to="/auth" className="text-primary hover:underline font-semibold">
                  Sign in
                </Link>{" "}
                to contribute.
              </p>
            )}

            {/* View toggle: project list vs city-wide progress feed */}
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-md bg-secondary p-0.5">
              <button
                onClick={() => setSidebarView("projects")}
                aria-pressed={sidebarView === "projects"}
                className={`text-xs font-medium rounded px-2 py-1.5 transition ${
                  sidebarView === "projects" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Projects
              </button>
              <button
                onClick={() => setSidebarView("latest")}
                aria-pressed={sidebarView === "latest"}
                className={`text-xs font-medium rounded px-2 py-1.5 transition inline-flex items-center justify-center gap-1 ${
                  sidebarView === "latest" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingUp className="size-3.5" /> Latest
              </button>
              <button
                onClick={() => setSidebarView("ranks")}
                aria-pressed={sidebarView === "ranks"}
                className={`text-xs font-medium rounded px-2 py-1.5 transition inline-flex items-center justify-center gap-1 ${
                  sidebarView === "ranks" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Building2 className="size-3.5" /> Ranks
              </button>
            </div>

            {sidebarView === "projects" && (
              <>
            {/* Search + sort */}
            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search developments…"
                  className="pl-8 pr-8 h-9"
                  aria-label="Search developments in this city"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="h-9 w-[140px] gap-1 text-xs" aria-label="Sort developments">
                  <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[600]">
                  <SelectItem value="activity">Recent activity</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="discussed">Most discussed</SelectItem>
                  <SelectItem value="az">A–Z</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filters (collapsible) */}
            <div className="mt-3">
              <div className="w-full flex items-center justify-between py-1">
                <button
                  onClick={() => setFiltersOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
                  aria-expanded={filtersOpen}
                >
                  {filtersOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  Filters
                  {filtersActive && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold normal-case tracking-normal">
                      {categoryFilter.size + statusFilter.size}
                    </span>
                  )}
                </button>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter(new Set());
                      setStatusFilter(new Set());
                    }}
                    className="text-[11px] text-primary hover:underline normal-case tracking-normal"
                    aria-label="Clear all filters"
                  >
                    Clear
                  </button>
                )}
              </div>
              {filtersOpen && (
                <div className="space-y-2 mt-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Type</p>
                    <div className="flex flex-wrap gap-1">
                      {CATEGORIES.map((c) => {
                        const active = categoryFilter.has(c.value);
                        const color = CATEGORY_COLORS[c.value];
                        return (
                          <button
                            key={c.value}
                            onClick={() => setCategoryFilter((s) => toggleInSet(s, c.value))}
                            aria-pressed={active}
                            className={`text-[11px] px-2 py-1 rounded-full border transition ${
                              active
                                ? "text-white border-transparent"
                                : "bg-background hover:bg-secondary border-border text-foreground"
                            }`}
                            style={active ? { backgroundColor: color } : { borderColor: `${color}55` }}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                    <div className="flex flex-wrap gap-1">
                      {STATUSES.map((s) => {
                        const active = statusFilter.has(s.value);
                        return (
                          <button
                            key={s.value}
                            onClick={() => setStatusFilter((set) => toggleInSet(set, s.value))}
                            aria-pressed={active}
                            className={`text-[11px] px-2 py-1 rounded-full border transition ${
                              active
                                ? "bg-foreground text-background border-foreground"
                                : "bg-background hover:bg-secondary border-border text-foreground"
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto scroll-slim">
            {sidebarView === "latest" ? (
              <LatestProgressFeed
                developments={cityDevs}
                onOpen={(id) => {
                  const d = cityDevs.find((x) => x.id === id) ?? null;
                  openDevelopmentRoute(d);
                  if (sidebarMode === "full") setSidebarMode("side");
                }}
              />
            ) : sidebarView === "ranks" ? (
              <RankingsPanel
                developments={cityDevs}
                onOpen={(id) => {
                  const d = cityDevs.find((x) => x.id === id) ?? null;
                  openDevelopmentRoute(d);
                  if (sidebarMode === "full") setSidebarMode("side");
                }}
              />
            ) : (
              <>
            <h2 className="sr-only">Developments in {city.name}</h2>
            {cityDiscussion && (
              <button
                onClick={() => {
                  openDevelopmentRoute(cityDiscussion);
                  if (sidebarMode === "full") setSidebarMode("side");
                }}
                className={`w-full text-left px-5 py-4 border-b border-border transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                  selected?.id === cityDiscussion.id
                    ? "bg-primary/10 border-l-4 border-l-primary pl-4"
                    : "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary/60 pl-4"
                }`}
                aria-label={`Open ${city.name} general discussion`}
              >
                <div className="flex gap-3 items-center">
                  <div className="size-12 rounded-full shrink-0 bg-primary/15 flex items-center justify-center">
                    <MessageSquare className="size-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold text-foreground">
                        Talk about {city.name}
                      </h3>
                      <Badge className="bg-primary text-primary-foreground text-[10px] uppercase tracking-wider font-medium">
                        Pinned
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      General discussion · no specific development needed
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      {cityDiscussion.comments_count > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="size-3" />
                          {cityDiscussion.comments_count}
                        </span>
                      )}
                      {cityDiscussion.comments_count > 0 && <span>·</span>}
                      <span>{formatRelative(cityDiscussion.last_activity_at)}</span>
                    </div>
                  </div>
                </div>
              </button>
            )}
            {initialLoading ? (
              <div className="divide-y divide-border" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3 px-5 py-4">
                    <Skeleton className="size-20 rounded-md shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredDevs.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                {cityDevs.length === 0
                  ? `No developments here yet. Be the first to drop a pin in ${city.name}.`
                  : searchQuery.trim()
                    ? `No results for "${searchQuery.trim()}". Try a different search or clear filters.`
                    : "No developments match your filters."}
              </div>
            ) : (
              <ul
                role="listbox"
                aria-label={`Developments in ${city.name}`}
                aria-activedescendant={selected ? `dev-item-${selected.id}` : undefined}
                className="divide-y divide-border focus:outline-none"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (filteredDevs.length === 0) return;
                  const idx = selected ? filteredDevs.findIndex((d) => d.id === selected.id) : -1;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    openDevelopmentRoute(filteredDevs[Math.min(filteredDevs.length - 1, idx + 1)] ?? filteredDevs[0]);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    openDevelopmentRoute(filteredDevs[Math.max(0, idx - 1)] ?? filteredDevs[0]);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    openDevelopmentRoute(filteredDevs[0]);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    openDevelopmentRoute(filteredDevs[filteredDevs.length - 1]);
                  } else if (e.key === "Escape" && selected) {
                    e.preventDefault();
                    openDevelopmentRoute(null);
                  }
                }}
              >
                {filteredDevs.map((d) => {
                  const isSelected = selected?.id === d.id;
                  const unread = isUnread(d);
                  const catColor = CATEGORY_COLORS[d.category];
                  return (
                    <li key={d.id} role="presentation">
                      <button
                        id={`dev-item-${d.id}`}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          openDevelopmentRoute(d);
                          if (sidebarMode === "full") setSidebarMode("side");
                        }}
                        className={`w-full text-left px-5 py-4 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
                          isSelected
                            ? "bg-secondary border-l-4 pl-4"
                            : unread
                              ? "bg-primary/5 hover:bg-secondary/70 border-l-4 pl-4"
                              : "hover:bg-secondary/50 border-l-4 border-transparent"
                        }`}
                        style={isSelected || unread ? { borderLeftColor: catColor } : undefined}
                      >
                        <div className="flex gap-3">
                          {d.images[0] ? (
                            <img
                              src={d.images[0]}
                              alt=""
                              loading="lazy"
                              className="size-20 rounded-md object-cover shrink-0 border border-border"
                            />
                          ) : (
                            <div
                              className="size-20 rounded-md shrink-0 border border-border flex items-center justify-center"
                              style={{ backgroundColor: `${catColor}1a`, borderColor: `${catColor}55` }}
                            >
                              <MapPin className="size-6" style={{ color: catColor }} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className={`text-sm leading-tight transition-colors ${
                                unread && !isSelected ? "font-bold text-foreground" : "font-semibold"
                              } ${isSelected ? "text-primary" : "group-hover:text-primary"}`}>
                                {unread && !isSelected && (
                                  <span
                                    className="inline-block size-2 rounded-full mr-1.5 -translate-y-0.5"
                                    style={{ backgroundColor: catColor }}
                                    aria-label="unread"
                                  />
                                )}
                                {d.title}
                              </h3>
                              <Badge className={`${STATUS_COLORS[d.status]} text-[10px] uppercase tracking-wider shrink-0 font-medium`}>
                                {statusLabel(d.status)}
                              </Badge>
                            </div>
                            <p className={`text-xs line-clamp-2 ${unread && !isSelected ? "text-foreground/80" : "text-muted-foreground"}`}>
                              {d.description}
                            </p>
                            <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground flex-wrap">
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-foreground/80"
                                style={{ backgroundColor: `${catColor}1a` }}
                              >
                                <span
                                  className="size-1.5 rounded-full"
                                  style={{ backgroundColor: catColor }}
                                  aria-hidden="true"
                                />
                                {categoryLabel(d.category)}
                              </span>
                              <span>·</span>
                              <span>{d.profiles?.display_name ?? "anon"}</span>
                              {d.comments_count > 0 && (
                                <>
                                  <span>·</span>
                                  <span className={`flex items-center gap-1 ${unread ? "text-primary font-semibold" : ""}`}>
                                    <MessageSquare className="size-3" />
                                    {d.comments_count}
                                  </span>
                                </>
                              )}
                              <span>·</span>
                              <span>{formatRelative(d.last_activity_at)}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
              </>
            )}
          </div>
    </>
  );
}
