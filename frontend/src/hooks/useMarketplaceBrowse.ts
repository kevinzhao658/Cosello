import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "../lib/api";
import { useDebouncedValue } from "./useDebouncedValue";
import type { Listing, CategorySlug } from "../lib/types";

const SIDEBAR_STORAGE_KEY = "cosello.marketSidebar.collapsed";

type Page = "home" | "market" | "terms" | "signin" | "signup" | "account" | "help" | "mission" | "newlisting";
type MarketSort = "recommended" | "trending" | "newest";

export interface UseMarketplaceBrowseReturn {
  listings: Listing[];
  listingsLoaded: boolean;
  visibleCount: number;
  sentinelRef: React.RefObject<HTMLDivElement>;
  search: string;
  setSearch: (value: string) => void;
  selectedCommunities: number[];
  setSelectedCommunities: React.Dispatch<React.SetStateAction<number[]>>;
  sort: MarketSort;
  setSort: React.Dispatch<React.SetStateAction<MarketSort>>;
  distanceMiles: number;
  setDistanceMiles: React.Dispatch<React.SetStateAction<number>>;
  selectedCategories: CategorySlug[];
  setSelectedCategories: React.Dispatch<React.SetStateAction<CategorySlug[]>>;
  showMyListings: boolean;
  setShowMyListings: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  refetch: () => Promise<void>;
  reset: () => void;
}

interface UseMarketplaceBrowseDeps {
  page: Page;
  isAuthenticated: boolean;
  token: string | null;
  isDesktop: boolean;
  userNeighborhood: string | null | undefined;
}

export function useMarketplaceBrowse({
  page,
  isAuthenticated,
  token,
  isDesktop,
  userNeighborhood,
}: UseMarketplaceBrowseDeps): UseMarketplaceBrowseReturn {
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedCommunities, setSelectedCommunities] = useState<number[]>([]);
  // R-3.1: new tri-mode sort. `recommended` and `trending` both fall through
  // to backend `sort=newest` (FYP path kicks in when no community is selected
  // and no search is active) until dedicated backend sort modes ship.
  const [sort, setSort] = useState<MarketSort>("recommended");
  const [distanceMiles, setDistanceMiles] = useState<number>(5);
  // Client-side pagination: backend returns the full feed, we reveal in
  // chunks (24 initial, +18 per IO trigger).
  const [visibleCount, setVisibleCount] = useState<number>(24);
  const [selectedCategories, setSelectedCategories] = useState<CategorySlug[]>([]);
  const [showMyListings, setShowMyListings] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (!window.matchMedia("(min-width: 1024px)").matches) return true;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  });

  // Persist sidebar collapsed state to localStorage
  useEffect(() => {
    if (!isDesktop) return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed, isDesktop]);

  // Sync sidebar collapsed state when desktop breakpoint changes
  useEffect(() => {
    if (isDesktop) {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      setSidebarCollapsed(stored === "true");
    } else {
      setSidebarCollapsed(true);
    }
  }, [isDesktop]);

  const toggleSidebar = useCallback(() => setSidebarCollapsed((c) => !c), []);

  // Infinite-scroll sentinel for the marketplace grid.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (page !== "market") return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((v) => Math.min(v + 18, listings.length));
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [page, listings.length, visibleCount]);

  const fetchListings = useCallback(async () => {
    if (showMyListings && isAuthenticated && token) {
      try {
        const res = await apiFetch(`/api/listings/mine`);
        if (res.ok) setListings(await res.json());
      } catch (err) {
        console.error("Failed to fetch my listings:", err);
      } finally {
        setListingsLoaded(true);
      }
      return;
    }

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    // Map the new UI sort labels onto backend modes. `recommended` and
    // `trending` both ride the existing `sort=newest` request — when no
    // community is selected and no search is active, the backend falls into
    // its FYP scoring path, which is the current proxy for "recommended".
    // TODO: add a real `trending` sort backend-side (view count window).
    const backendSort = sort === "newest" ? "newest" : "newest";
    params.set("sort", backendSort);
    params.set("max_distance", String(distanceMiles));
    if (selectedCategories.length > 0) params.set("category", selectedCategories.join(","));

    if (isAuthenticated && token) {
      if (selectedCommunities.length > 0) {
        params.set("community", selectedCommunities.join(","));
      } else {
        // Default feed: no community filter → backend returns tier-ranked results
        if (userNeighborhood) params.set("neighborhood", userNeighborhood);
      }
      try {
        const res = await apiFetch(`/api/listings?${params}`);
        if (res.ok) setListings(await res.json());
      } catch (err) {
        console.error("Failed to fetch listings:", err);
      } finally {
        setListingsLoaded(true);
      }
    } else {
      try {
        const res = await apiFetch(`/api/listings/public?${params}`);
        if (res.ok) setListings(await res.json());
      } catch (err) {
        console.error("Failed to fetch public listings:", err);
      } finally {
        setListingsLoaded(true);
      }
    }
  }, [showMyListings, isAuthenticated, token, debouncedSearch, sort, distanceMiles, selectedCategories, selectedCommunities, userNeighborhood]);

  // Market fetch effect
  useEffect(() => {
    if (page === "market") fetchListings();
  }, [page, debouncedSearch, selectedCommunities, sort, distanceMiles, selectedCategories, isAuthenticated, showMyListings]);

  // Reset the visible window whenever the underlying feed changes so the user
  // doesn't land deep into a now-shorter list.
  useEffect(() => {
    setVisibleCount(24);
  }, [debouncedSearch, selectedCommunities, sort, selectedCategories, showMyListings]);

  const reset = useCallback(() => {
    setListings([]);
    setListingsLoaded(false);
  }, []);

  return {
    listings,
    listingsLoaded,
    visibleCount,
    sentinelRef,
    search,
    setSearch,
    selectedCommunities,
    setSelectedCommunities,
    sort,
    setSort,
    distanceMiles,
    setDistanceMiles,
    selectedCategories,
    setSelectedCategories,
    showMyListings,
    setShowMyListings,
    sidebarCollapsed,
    toggleSidebar,
    refetch: fetchListings,
    reset,
  };
}
