import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { apiFetch } from "../lib/api";
import { useDebouncedValue } from "./useDebouncedValue";
import type { Listing, CategorySlug } from "../lib/types";

const SIDEBAR_STORAGE_KEY = "cosello.marketSidebar.collapsed";
const PAGE_LIMIT = 24;
const DEBOUNCE_MS = 300;

type Page = "home" | "market" | "terms" | "signin" | "signup" | "account" | "help" | "mission" | "newlisting";
type MarketSort = "recommended" | "trending" | "newest";

/** Paginated envelope returned by GET /api/listings and /api/listings/public. */
interface ListingsEnvelope {
  items: Listing[];
  nextCursor: string | null;
}

export interface UseMarketplaceBrowseReturn {
  listings: Listing[];
  listingsLoaded: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  fetchError: string | null;
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
  retryLoadMore: () => void;
}

interface UseMarketplaceBrowseDeps {
  page: Page;
  isAuthenticated: boolean;
  /** Mirrors AuthContext.authReady — true once the initial getSession() bootstrap has settled. The first market fetch is gated on this flag so it fires exactly once, with the correct auth state, on cold load. */
  authReady: boolean;
  token: string | null;
  isDesktop: boolean;
  userNeighborhood: string | null | undefined;
}

export function useMarketplaceBrowse({
  page,
  isAuthenticated,
  authReady,
  token,
  isDesktop,
  userNeighborhood,
}: UseMarketplaceBrowseDeps): UseMarketplaceBrowseReturn {
  // Accumulated pages of listings across all fetched pages.
  const [listings, setListings] = useState<Listing[]>([]);
  // True once the first page has settled (success or error).
  const [listingsLoaded, setListingsLoaded] = useState(false);
  // True while a subsequent page (not the first) is in flight.
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Opaque cursor from the last successful page; null = no more pages.
  const [cursor, setCursor] = useState<string | null>(null);
  // Non-null when a load-more attempt failed (first-page errors wipe the list).
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, DEBOUNCE_MS);

  const [selectedCommunities, setSelectedCommunities] = useState<number[]>([]);
  const debouncedCommunities = useDebouncedValue(selectedCommunities, DEBOUNCE_MS);

  // R-3.1: new tri-mode sort. `recommended` and `trending` both fall through
  // to backend `sort=newest` (FYP path kicks in when no community is selected
  // and no search is active) until dedicated backend sort modes ship.
  const [sort, setSort] = useState<MarketSort>("recommended");
  const debouncedSort = useDebouncedValue(sort, DEBOUNCE_MS);

  // Default to the slider's top (10 = "10+", i.e. any distance) so first-load
  // browse shows everything; the user narrows by dragging below 10.
  const [distanceMiles, setDistanceMiles] = useState<number>(10);

  const [selectedCategories, setSelectedCategories] = useState<CategorySlug[]>([]);
  const debouncedCategories = useDebouncedValue(selectedCategories, DEBOUNCE_MS);

  const [showMyListings, setShowMyListings] = useState(false);
  const debouncedShowMyListings = useDebouncedValue(showMyListings, DEBOUNCE_MS);

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

  // Ref guard: tracks the current "filter generation" so stale responses from
  // old filter sets are silently dropped when a new filter fires before the
  // previous request completes.
  const filterGenRef = useRef(0);

  // Guard for load-more: prevents double-fires while a page is in-flight.
  const loadingMoreRef = useRef(false);

  /** Build the shared URLSearchParams for a given cursor (undefined = first page). */
  const buildParams = useCallback(
    (pageCursor?: string | null): URLSearchParams => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      // Map the new UI sort labels onto backend modes. `recommended` and
      // `trending` both ride the existing `sort=newest` request — when no
      // community is selected and no search is active, the backend falls into
      // its FYP scoring path, which is the current proxy for "recommended".
      // TODO: add a real `trending` sort backend-side (view count window).
      const backendSort = debouncedSort === "newest" ? "newest" : "newest";
      params.set("sort", backendSort);
      // Distance is filtered client-side (see filteredListings) — the backend
      // returns distance_miles on every listing, so the slider needs no refetch.
      if (debouncedCategories.length > 0) params.set("category", debouncedCategories.join(","));
      params.set("limit", String(PAGE_LIMIT));
      if (pageCursor) params.set("cursor", pageCursor);
      return params;
    },
    [debouncedSearch, debouncedSort, debouncedCategories],
  );

  /**
   * Fetch one page and return its envelope.
   * Throws on network error or non-OK HTTP status.
   */
  const fetchPage = useCallback(
    async (pageCursor?: string | null): Promise<ListingsEnvelope> => {
      if (debouncedShowMyListings && isAuthenticated && token) {
        // "My Listings" uses a separate unpaginated endpoint — wrap it to
        // satisfy the envelope shape so the rest of the logic is uniform.
        const res = await apiFetch(`/api/listings/mine`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const items = (await res.json()) as Listing[];
        return { items, nextCursor: null };
      }

      const params = buildParams(pageCursor);

      if (isAuthenticated && token) {
        if (debouncedCommunities.length > 0) {
          params.set("community", debouncedCommunities.join(","));
        } else {
          // Default feed: no community filter → backend returns tier-ranked results
          if (userNeighborhood) params.set("neighborhood", userNeighborhood);
        }
        const res = await apiFetch(`/api/listings?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ListingsEnvelope;
      } else {
        const res = await apiFetch(`/api/listings/public?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ListingsEnvelope;
      }
    },
    [debouncedShowMyListings, isAuthenticated, token, buildParams, debouncedCommunities, userNeighborhood],
  );

  /**
   * Fetch the FIRST page for the current filter set.
   * Resets accumulated listings and cursor.
   */
  const fetchFirstPage = useCallback(async () => {
    const gen = ++filterGenRef.current;
    setListingsLoaded(false);
    setFetchError(null);
    // Reset the load-more guard so a fresh first-page clears any stale lock.
    loadingMoreRef.current = false;

    try {
      const envelope = await fetchPage(null);
      if (filterGenRef.current !== gen) return; // stale — newer filter fired
      setListings(envelope.items);
      setCursor(envelope.nextCursor);
    } catch (err) {
      if (filterGenRef.current !== gen) return;
      console.error("Failed to fetch listings:", err);
      setListings([]);
      setCursor(null);
      setFetchError("Failed to load listings. Please try again.");
    } finally {
      if (filterGenRef.current === gen) setListingsLoaded(true);
    }
  }, [fetchPage]);

  /**
   * Fetch the NEXT page and APPEND items.
   * No-op when already loading or no cursor available.
   * On error: preserves already-loaded items, sets fetchError for a retry affordance.
   */
  const fetchNextPage = useCallback(async () => {
    if (loadingMoreRef.current || cursor === null) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setFetchError(null);
    const gen = filterGenRef.current;

    try {
      const envelope = await fetchPage(cursor);
      if (filterGenRef.current !== gen) return; // filter changed mid-flight; discard
      setListings((prev) => [...prev, ...envelope.items]);
      setCursor(envelope.nextCursor);
    } catch (err) {
      if (filterGenRef.current !== gen) return;
      console.error("Failed to fetch next page:", err);
      // Keep already-loaded items intact; expose retry affordance.
      setFetchError("Could not load more listings. Tap to retry.");
    } finally {
      if (filterGenRef.current === gen) {
        setIsLoadingMore(false);
        loadingMoreRef.current = false;
      }
    }
  }, [cursor, fetchPage]);

  // Infinite-scroll sentinel.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (page !== "market") return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && cursor !== null && !loadingMoreRef.current) {
          void fetchNextPage();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // fetchNextPage identity is stable per cursor+filter change; cursor drives re-subscribe.
  }, [page, cursor, fetchNextPage]);

  // Market fetch effect — fires on debounced filter changes.
  // authReady gates the very first fire: on cold load isAuthenticated starts
  // false before getSession() resolves, which would cause a spurious anonymous
  // pre-auth fetch. We wait until authReady is true so there is exactly one
  // request per filter/sort/page change — authenticated or anonymous.
  // Note: distanceMiles is NOT a dep; the slider filters client-side without refetching.
  useEffect(() => {
    if (page === "market" && authReady) void fetchFirstPage();
  }, [page, authReady, debouncedSearch, debouncedCommunities, debouncedSort, debouncedCategories, isAuthenticated, debouncedShowMyListings]);
  // fetchFirstPage is intentionally omitted from deps — it is re-created when
  // the debounced values change (which are listed above), so including it would
  // double-fire. The debounced values are the true trigger.

  const reset = useCallback(() => {
    setListings([]);
    setListingsLoaded(false);
    setCursor(null);
    setFetchError(null);
    filterGenRef.current++;
    loadingMoreRef.current = false;
  }, []);

  /** Retry the last failed load-more without resetting the first page. */
  const retryLoadMore = useCallback(() => {
    loadingMoreRef.current = false;
    void fetchNextPage();
  }, [fetchNextPage]);

  // Distance filtering applied client-side on the already-fetched feed (every
  // listing carries distance_miles), so dragging the slider is instant — no
  // refetch. Listings with no distance (buyer has no zip, or no coords) are
  // never filtered out, so the slider gracefully no-ops for zip-less buyers.
  const filteredListings = useMemo(
    () =>
      distanceMiles >= 10
        ? listings
        : listings.filter((l) => l.distance_miles == null || l.distance_miles <= distanceMiles),
    [listings, distanceMiles],
  );

  return {
    listings: filteredListings,
    listingsLoaded,
    isLoadingMore,
    hasMore: cursor !== null,
    fetchError,
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
    refetch: fetchFirstPage,
    reset,
    retryLoadMore,
  };
}
