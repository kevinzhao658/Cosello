import { memo } from "react";
import { Search, Globe, Lock, X, ChevronLeft, ChevronRight, User } from "lucide-react";

type CategorySlug = "clothing" | "furniture" | "electronics" | "sports" | "collectibles" | "other";

interface CategorySchema {
  label: string;
  fields: unknown[];
}

interface Community {
  id: string | number;
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
  marketSort: string;
  onMarketSortChange: (value: string) => void;
  isAuthenticated: boolean;
  filterCommunities: Community[];
  selectedMarketCommunities: string[];
  onToggleCommunity: (cid: string) => void;
  onClearCommunities: () => void;
  categorySchemas: Record<string, CategorySchema>;
  selectedCategories: CategorySlug[];
  onToggleCategory: (slug: CategorySlug) => void;
  onClearCategories: () => void;
  showMyListings: boolean;
  onToggleMyListings: () => void;
}

export const MarketplaceSidebar = memo(function MarketplaceSidebar({
  collapsed,
  onToggleCollapsed,
  isMobile,
  marketSearch,
  onMarketSearchChange,
  marketSort,
  onMarketSortChange,
  isAuthenticated,
  filterCommunities,
  selectedMarketCommunities,
  onToggleCommunity,
  onClearCommunities,
  categorySchemas,
  selectedCategories,
  onToggleCategory,
  onClearCategories,
  showMyListings,
  onToggleMyListings,
}: MarketplaceSidebarProps) {
  const panel = (
    <aside
      className={`fixed top-16 bottom-0 left-0 z-40 w-72 bg-black/40 backdrop-blur-sm border-r border-white/10 overflow-y-auto transition-transform duration-300 ease-out ${
        collapsed ? "-translate-x-full" : "translate-x-0"
      }`}
    >
      <div className={`p-6 ${collapsed && !isMobile ? "opacity-0 pointer-events-none" : "opacity-100"} transition-opacity`}>
        <h2
          className="text-2xl font-light tracking-wider mb-6"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          Marketplace
        </h2>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 size-4" />
              <input
                type="text"
                value={marketSearch}
                onChange={(e) => onMarketSearchChange(e.target.value)}
                placeholder="Search items..."
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/20 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-400 transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Sort By</label>
            <select
              value={marketSort}
              onChange={(e) => onMarketSortChange(e.target.value)}
              className="px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors"
            >
              <option value="newest">Newest</option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
            </select>
          </div>

          {isAuthenticated && filterCommunities.length > 0 && (
            <div className="flex flex-col">
              <label className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Communities</label>
              <div className="flex flex-wrap gap-2">
                {filterCommunities.map((community) => {
                  const cid = String(community.id);
                  const isSelected = selectedMarketCommunities.includes(cid);
                  return (
                    <button
                      key={cid}
                      onClick={() => onToggleCommunity(cid)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all ${
                        isSelected
                          ? "bg-fuchsia-500/15 border-fuchsia-400/30 text-fuchsia-300"
                          : "bg-white/5 border-white/15 text-white/50 hover:bg-white/10"
                      }`}
                    >
                      {community.is_public !== false ? <Globe className="size-3" /> : <Lock className="size-3" />}
                      {community.name}
                    </button>
                  );
                })}
                {selectedMarketCommunities.length > 0 && (
                  <button
                    onClick={onClearCommunities}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border border-white/10 text-white/30 hover:text-white/50 hover:bg-white/5 transition-all"
                  >
                    <X className="size-3" />
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {(isAuthenticated || Object.keys(categorySchemas).length > 0) && (
            <div className="flex flex-col">
              <label className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Categories</label>
              <div className="flex flex-wrap gap-2">
                {isAuthenticated && (
                  <button
                    onClick={onToggleMyListings}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all ${
                      showMyListings
                        ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-300"
                        : "bg-white/5 border-white/15 text-white/50 hover:text-white/70 hover:border-white/30"
                    }`}
                  >
                    <User className="size-3" />
                    My Listings
                  </button>
                )}
                {Object.entries(categorySchemas).map(([slug, schema]) => {
                  const isSelected = selectedCategories.includes(slug as CategorySlug);
                  return (
                    <button
                      key={slug}
                      onClick={() => onToggleCategory(slug as CategorySlug)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                        isSelected
                          ? "bg-fuchsia-500/20 border-fuchsia-400/40 text-fuchsia-300"
                          : "bg-white/5 border-white/15 text-white/50 hover:text-white/70 hover:border-white/30"
                      }`}
                    >
                      {schema.label}
                    </button>
                  );
                })}
                {selectedCategories.length > 0 && (
                  <button
                    onClick={onClearCategories}
                    className="px-3 py-1.5 rounded-full text-xs border border-white/15 text-white/30 hover:text-white/50 transition-all"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  const toggleButton = (
    <button
      type="button"
      onClick={onToggleCollapsed}
      aria-label={collapsed ? "Open filters" : "Close filters"}
      className={`fixed top-1/2 -translate-y-1/2 z-50 h-14 w-4 flex items-center justify-center rounded-r-md bg-white/[0.08] hover:bg-white/15 border border-l-0 border-white/10 backdrop-blur-sm transition-[left] duration-300 ease-out ${
        collapsed ? "left-0" : "left-72"
      }`}
    >
      {collapsed ? <ChevronRight className="size-3 text-white/60" /> : <ChevronLeft className="size-3 text-white/60" />}
    </button>
  );

  return (
    <>
      {panel}
      {isMobile && !collapsed && (
        <div
          aria-hidden="true"
          onClick={onToggleCollapsed}
          className="fixed inset-0 top-16 z-30 bg-black/50 backdrop-blur-sm"
        />
      )}
      {toggleButton}
    </>
  );
});
