import { memo, useRef, useState, useMemo } from "react";
import { Search, Menu, X } from "lucide-react";
import { Tooltip } from "./ui/tooltip";
import { useClickOutside } from "../hooks/useClickOutside";

type CategorySlug = "clothing" | "furniture" | "electronics" | "sports" | "collectibles" | "other";

interface CategorySchema {
  label: string;
  fields: unknown[];
}

interface Community {
  id: number;
  name: string;
  neighborhood?: string;
  is_public?: boolean;
}

interface MarketplaceSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isMobile: boolean;
  marketSearch: string;
  onMarketSearchChange: (value: string) => void;
  isAuthenticated: boolean;
  filterCommunities: Community[];
  selectedMarketCommunities: number[];
  onToggleCommunity: (cid: number) => void;
  categorySchemas: Record<string, CategorySchema>;
  selectedCategories: CategorySlug[];
  onToggleCategory: (slug: CategorySlug) => void;
  distanceMiles: number;
  onDistanceChange: (miles: number) => void;
  showMyListings: boolean;
  onToggleMyListings: () => void;
}

function communityInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "··";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return trimmed.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const MarketplaceSidebar = memo(function MarketplaceSidebar({
  collapsed,
  onToggleCollapsed,
  isMobile,
  marketSearch,
  onMarketSearchChange,
  isAuthenticated,
  filterCommunities,
  selectedMarketCommunities,
  onToggleCommunity,
  categorySchemas,
  selectedCategories,
  onToggleCategory,
  distanceMiles,
  onDistanceChange,
  showMyListings,
  onToggleMyListings,
}: MarketplaceSidebarProps) {
  const [commMenuOpen, setCommMenuOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  useClickOutside(popoverRef, () => setCommMenuOpen(false), commMenuOpen);

  const visibleComms = useMemo(() => filterCommunities.slice(0, 4), [filterCommunities]);
  const extraComms = useMemo(() => filterCommunities.slice(4), [filterCommunities]);
  const sliderFill = `${((Math.min(Math.max(distanceMiles, 1), 25) - 1) / 24) * 100}%`;
  const distanceLabel = distanceMiles >= 25 ? "Any" : `${distanceMiles} mi`;

  const sidebarHidden = collapsed;
  const panel = (
    <aside
      className={`fixed top-16 bottom-0 left-0 z-40 w-[280px] bg-canvas border-r border-hairline overflow-y-auto transition-transform duration-300 ease-out ${
        sidebarHidden ? "-translate-x-full" : "translate-x-0"
      } lg:translate-x-0 lg:static lg:h-[calc(100vh-64px)] lg:sticky lg:top-16 lg:flex-shrink-0`}
      aria-label="Marketplace filters"
    >
      <div className="px-6 pt-7 pb-8 flex flex-col gap-5">
        {/* SEARCH */}
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold text-muted">Search</label>
          <div className="flex items-center gap-2 bg-surface-card border border-hairline rounded-md px-3 h-9">
            <Search className="size-4 text-muted shrink-0" />
            <input
              type="text"
              value={marketSearch}
              onChange={(e) => onMarketSearchChange(e.target.value)}
              placeholder="Search items…"
              className="flex-1 bg-transparent border-0 outline-none text-sm text-ink placeholder:text-muted-soft"
            />
          </div>
        </div>

        {/* CATEGORIES */}
        {Object.keys(categorySchemas).length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-muted">Categories</label>
            <div className="flex flex-wrap gap-1.5">
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={onToggleMyListings}
                  aria-pressed={showMyListings}
                  className={`rounded-full px-2.5 py-1 text-xs border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                    showMyListings
                      ? "bg-primary-tint text-primary border-primary"
                      : "bg-canvas border-hairline text-body hover:border-border-strong hover:text-ink"
                  }`}
                >
                  My listings
                </button>
              )}
              {Object.entries(categorySchemas).map(([slug, schema]) => {
                const isSelected = selectedCategories.includes(slug as CategorySlug);
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => onToggleCategory(slug as CategorySlug)}
                    aria-pressed={isSelected}
                    className={`rounded-full px-2.5 py-1 text-xs border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                      isSelected
                        ? "bg-primary-tint text-primary border-primary"
                        : "bg-canvas border-hairline text-body hover:border-border-strong hover:text-ink"
                    }`}
                  >
                    {schema.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* COMMUNITIES */}
        {isAuthenticated && filterCommunities.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <label className="text-[11px] font-semibold text-muted">Communities</label>
              {selectedMarketCommunities.length > 0 && (
                <span className="text-[11px] text-muted">{selectedMarketCommunities.length} active</span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              {visibleComms.map((community) => {
                const cid = community.id;
                const isSelected = selectedMarketCommunities.includes(cid);
                return (
                  <Tooltip key={cid} content={community.name}>
                    <button
                      type="button"
                      onClick={() => onToggleCommunity(cid)}
                      aria-pressed={isSelected}
                      aria-label={community.name}
                      className="flex flex-col items-center gap-1.5 w-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-md"
                    >
                      <span
                        className={`size-14 rounded-full flex items-center justify-center border bg-surface-card text-sm font-medium text-ink transition-colors ${
                          isSelected
                            ? "border-primary ring-2 ring-primary-soft"
                            : "border-hairline hover:border-border-strong"
                        }`}
                      >
                        {communityInitials(community.name)}
                      </span>
                      <span
                        className={`text-[11px] leading-tight text-center truncate w-full ${
                          isSelected ? "text-primary font-semibold" : "text-ink"
                        }`}
                      >
                        {community.name.split(" ").slice(0, 2).join(" ")}
                      </span>
                    </button>
                  </Tooltip>
                );
              })}
              {extraComms.length > 0 && (
                <div ref={popoverRef} className="relative inline-block">
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={commMenuOpen}
                    onClick={() => setCommMenuOpen((v) => !v)}
                    className="flex flex-col items-center gap-1.5 w-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-md"
                  >
                    <span className="size-14 rounded-full flex items-center justify-center border border-dashed border-hairline bg-surface-soft text-muted text-lg">
                      …
                    </span>
                    <span className="text-[11px] leading-tight text-center text-ink">More</span>
                  </button>
                  {commMenuOpen && (
                    <div
                      role="menu"
                      className="absolute top-full left-0 mt-2 z-30 min-w-[220px] bg-surface-card border border-hairline rounded-md p-1.5 shadow-overlay"
                    >
                      <div className="text-[11px] font-semibold text-muted px-2.5 pt-1.5 pb-1">
                        More communities
                      </div>
                      {extraComms.map((community) => {
                        const cid = community.id;
                        const isSelected = selectedMarketCommunities.includes(cid);
                        return (
                          <label
                            key={cid}
                            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-sm text-ink hover:bg-surface-soft cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onToggleCommunity(cid)}
                              className="accent-primary"
                            />
                            <span className="truncate">{community.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* DISTANCE */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <label className="text-[11px] font-semibold text-muted">Distance</label>
            <span className="text-[11px] text-muted">{distanceLabel}</span>
          </div>
          {/* Filters listings to within N miles of the user's ZIP centroid via
              the `max_distance` query param. Top stop (25 = "Any") sends no
              filter, so default browse shows everything. */}
          <input
            type="range"
            min={1}
            max={25}
            step={1}
            value={distanceMiles}
            onChange={(e) => onDistanceChange(Number(e.target.value))}
            className="mkt-range w-full"
            style={{ ["--mkt-range-fill" as string]: sliderFill }}
            aria-label="Distance in miles"
          />
          {/* Tick labels positioned at their true value on the 1–25 track
              (fill = (v-1)/24), so e.g. "10" sits at 37.5%, not the visual
              midpoint (which is value 13). */}
          <div className="relative h-3 text-[10px] text-muted">
            {[1, 5, 10, 15, 20, 25].map((v, i, arr) => {
              const transform =
                i === 0 ? "none" : i === arr.length - 1 ? "translateX(-100%)" : "translateX(-50%)";
              return (
                <span
                  key={v}
                  className="absolute top-0"
                  style={{ left: `${((v - 1) / 24) * 100}%`, transform }}
                >
                  {v === 25 ? "25+" : v}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );

  const mobileToggle = !isMobile ? null : (
    <button
      type="button"
      onClick={onToggleCollapsed}
      aria-label={collapsed ? "Open filters" : "Close filters"}
      className="fixed top-20 left-3 z-50 h-9 px-3 flex items-center gap-1.5 rounded-full bg-canvas border border-hairline shadow-card text-sm font-medium text-ink lg:hidden"
    >
      {collapsed ? <Menu className="size-4" /> : <X className="size-4" />}
      {collapsed ? "Filters" : "Close"}
    </button>
  );

  return (
    <>
      {panel}
      {isMobile && !collapsed && (
        <div
          aria-hidden="true"
          onClick={onToggleCollapsed}
          className="fixed inset-0 top-16 z-30 bg-ink/40 backdrop-blur-sm lg:hidden"
        />
      )}
      {mobileToggle}
    </>
  );
});
