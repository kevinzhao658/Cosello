import { Search, Menu, User, X, Settings, ExternalLink, FileText, Shield, AlertTriangle, Scale, Ban, CreditCard, MessageSquare, MessageCircle, RefreshCw, UserCheck, Eye, LogOut, HelpCircle, Type, Contrast, Minimize2, Zap, Sparkles, Leaf, Users, Recycle, Heart, Bell, Pencil, MapPin, ChevronRight, Check, ImagePlus, ArrowRight } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ModalShell } from "./components/ui/ModalShell";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./components/ui/dropdown-menu";
import { useSettings } from "./contexts/SettingsContext";
import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useAuth, type AuthUser } from "./contexts/AuthContext";
const SignInPage = lazy(() => import("./pages/SignInPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
const MyAccountPage = lazy(() => import("./pages/MyAccount/MyAccountPage"));
const UserProfileOverlay = lazy(() => import("./pages/UserProfilePage"));
import { EditListingModal } from "./components/EditListingModal";
import { ListingCardSkeleton } from "./components/ListingCardSkeleton";
import { MarketplaceSidebar } from "./components/MarketplaceSidebar";
import { NotificationsPanel } from "./features/notifications/NotificationsPanel";
import { BuyModal, type EditingOrderSeed } from "./features/orders/BuyModal";
import { ListingDetailModal, type SellerProfile } from "./features/listings/ListingDetailModal";
import { SellWizard, type SellWizardHandle } from "./features/sell-wizard/SellWizard";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { PLACEHOLDER_COMMUNITY, CONDITIONS } from "./lib/listings";
import { useClickOutside } from "./hooks/useClickOutside";
import { apiFetch } from "./lib/api";
import { formatTitle } from "./lib/format";
import { logView, logSearch, type ViewSource } from "./lib/events";
import type { CategorySlug, Listing, ListingUpdatePatch, CategorySchema } from "./lib/types";
import type { Notification } from "./lib/notifications";

const SIDEBAR_STORAGE_KEY = "cosello.marketSidebar.collapsed";

type Page = "home" | "market" | "terms" | "settings" | "signin" | "signup" | "account" | "help" | "mission" | "newlisting";

export default function App() {
  const { isAuthenticated, user, token, needsRegistration, login, logout } = useAuth();
  const { settings, updateSetting } = useSettings();

  // Temporary token for new users who haven't completed profile yet
  const [pendingSignupToken, setPendingSignupToken] = useState<string | null>(null);
  const [pendingSignupUser, setPendingSignupUser] = useState<AuthUser | null>(null);

  const [homeSearch, setHomeSearch] = useState("");
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");

  // Sell wizard — all of its state lives inside <SellWizard>. App.tsx holds a
  // ref so it can invoke the wizard's imperative handlers (post + reset), and
  // tracks the current phase so the home-page hero + nav logo can collapse
  // while the wizard is in a deep step.
  const sellWizardRef = useRef<SellWizardHandle | null>(null);
  const [wizardPhase, setWizardPhase] = useState<"review" | "reason" | "cards" | "pickup" | null>(null);
  // Mirror of wizard.uploadedImages.length so the #newlisting page can react
  // (preview cover, checklist, photo counter). The wizard fires onImagesChange
  // on every state.uploadedImages change.
  const [wizardImageCount, setWizardImageCount] = useState(0);

  // New Listing page state (R-4.1). Mode toggles between the existing AI wizard
  // flow and a blank-form manual flow. Manual form fields live here so the page
  // owns the publish payload; the wizard owns the photo state and the publish
  // network call (called via the imperative handle after seeding productDetails).
  const [newListingMode, setNewListingMode] = useState<"ai" | "manual">("ai");
  const [manualBrand, setManualBrand] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualCondition, setManualCondition] = useState<string>("Good");
  const [manualCategory, setManualCategory] = useState<CategorySlug>("other");
  const [manualPickup, setManualPickup] = useState("");
  const [manualTags, setManualTags] = useState<string[]>([]);
  const [manualTagInput, setManualTagInput] = useState("");
  const [isPublishingManual, setIsPublishingManual] = useState(false);

  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.replace("#", "");
    const validPages: Page[] = ["home", "market", "terms", "settings", "signin", "signup", "account", "help", "mission", "newlisting"];
    return validPages.includes(hash as Page) ? (hash as Page) : "home";
  });
  const [showPostConfirm, setShowPostConfirm] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingsLoaded, setListingsLoaded] = useState(false);
  const [marketSearch, setMarketSearch] = useState("");
  const debouncedMarketSearch = useDebouncedValue(marketSearch, 300);
  const [selectedMarketCommunities, setSelectedMarketCommunities] = useState<string[]>([]);
  // R-3.1: new tri-mode sort. `recommended` and `trending` both fall through
  // to backend `sort=newest` (FYP path kicks in when no community is selected
  // and no search is active) until dedicated backend sort modes ship.
  type MarketSort = "recommended" | "trending" | "newest";
  const [marketSort, setMarketSort] = useState<MarketSort>("recommended");
  // Distance is purely a visual placeholder for now — no backend filter, no
  // distance data on the listing payload. Hooked to local state so the slider
  // is interactive; will start filtering once Listing carries lat/long.
  const [distanceMiles, setDistanceMiles] = useState<number>(5);
  // Client-side pagination: backend returns the full feed, we reveal in
  // chunks (24 initial, +18 per IO trigger).
  const [visibleCount, setVisibleCount] = useState<number>(24);
  const [publicCommunities, setPublicCommunities] = useState<{ id: string | number; name: string; neighborhood?: string; is_public?: boolean }[]>([]);
  const [privateCommunities, setPrivateCommunities] = useState<{ id: string | number; name: string; neighborhood?: string; is_public?: boolean }[]>([]);
  const filterCommunities = useMemo(() => [...publicCommunities, ...privateCommunities], [publicCommunities, privateCommunities]);
  // Post To state
  const [postPickupLocation, setPostPickupLocation] = useState("");
  const [categorySchemas, setCategorySchemas] = useState<Record<string, CategorySchema>>({});
  const [selectedCategories, setSelectedCategories] = useState<CategorySlug[]>([]);
  const [showMyListings, setShowMyListings] = useState(false);

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [marketSidebarCollapsed, setMarketSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (!window.matchMedia("(min-width: 1024px)").matches) return true;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  });
  useEffect(() => {
    if (!isDesktop) return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(marketSidebarCollapsed));
  }, [marketSidebarCollapsed, isDesktop]);
  useEffect(() => {
    if (isDesktop) {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      setMarketSidebarCollapsed(stored === "true");
    } else {
      setMarketSidebarCollapsed(true);
    }
  }, [isDesktop]);
  const toggleMarketSidebar = useCallback(() => setMarketSidebarCollapsed((c) => !c), []);
  const handleToggleMarketCommunity = useCallback((cid: string) => {
    setSelectedMarketCommunities((prev) =>
      prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]
    );
  }, []);
  const handleToggleCategory = useCallback((slug: CategorySlug) => {
    setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug]
    );
  }, []);
  const handleToggleMyListings = useCallback(() => setShowMyListings((v) => !v), []);

  // Wishlist state
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [wishlistItems, setWishlistItems] = useState<Listing[]>([]);

  // Profile dropdown state (custom, not Radix)
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Notifications state
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Pending listing ID for routing to order management from notification
  const [pendingListingId, setPendingListingId] = useState<string | null>(null);

  // Recent-activity log persisted to localStorage. Consumed by MyAccountPage
  // (via onAddToHistory) — the in-nav dropdown was retired in R-2.
  const [, setHistoryItems] = useState<{ id: string; title: string; imageUrl: string; price: string; type: "viewed" | "purchased" | "listed" | "sold"; timestamp: number }[]>(() => {
    try {
      const stored = localStorage.getItem("ge_history");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const addToHistory = (item: { id: string; title: string; imageUrl: string; price: string; type: "viewed" | "purchased" | "listed" | "sold" }) => {
    setHistoryItems((prev) => {
      const filtered = prev.filter((h) => !(h.id === item.id && h.type === item.type));
      const updated = [{ ...item, timestamp: Date.now() }, ...filtered].slice(0, 10);
      localStorage.setItem("ge_history", JSON.stringify(updated));
      return updated;
    });
  };

  // User profile overlay state
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  // Listing detail modal state
  const [showListingDetailModal, setShowListingDetailModal] = useState(false);
  const [listingDetailData, setListingDetailData] = useState<Listing | null>(null);
  const [listingDetailSellerProfile, setListingDetailSellerProfile] = useState<SellerProfile | null>(null);
  const [isLoadingListingDetail, setIsLoadingListingDetail] = useState(false);

  // Buy confirmation modal state
  const [buyerOrderStatus, setBuyerOrderStatus] = useState<{ status: string | null; order_id?: number } | null>(null);
  const [myOrderStatuses, setMyOrderStatuses] = useState<Record<string, { status: string; orderId: number }>>({});
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyEditingOrder, setBuyEditingOrder] = useState<EditingOrderSeed | null>(null);

  // Edit listing modal trigger. All field state lives inside EditListingModal;
  // App.tsx only owns the open flag and the save handler.
  const [showEditListingModal, setShowEditListingModal] = useState(false);

  // Reset the New Listing form back to defaults — called after a successful
  // publish so a follow-up listing starts blank.
  const resetNewListingForm = useCallback(() => {
    setNewListingMode("ai");
    setManualBrand("");
    setManualName("");
    setManualDescription("");
    setManualPrice("");
    setManualCondition("Good");
    setManualCategory("other");
    setManualPickup("");
    setManualTags([]);
    setManualTagInput("");
    setWizardImageCount(0);
  }, []);

  // Manual-mode publish. Seeds the wizard's productDetails from the page-level
  // form fields, then calls the wizard's existing single-publish handler (which
  // already wires images + categories + pickup + auth gates correctly).
  const handlePublishNewListing = useCallback(async () => {
    if (!isAuthenticated) {
      setPage("signin");
      return;
    }
    if (newListingMode === "ai") {
      // AI mode publish happens via the wizard's own flow — Publish in the
      // page toolbar is disabled until the wizard has produced a productDetails
      // (single) or bulkItems (multi). For single, we route through the same
      // confirm modal the home flow uses.
      setShowPostConfirm(true);
      return;
    }
    if (wizardImageCount === 0) {
      alert("Add at least one photo before publishing.");
      return;
    }
    const priceNumber = Number.parseInt(manualPrice, 10);
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      alert("Enter a valid price before publishing.");
      return;
    }
    if (!manualBrand.trim() && !manualName.trim()) {
      alert("Add a brand or item name before publishing.");
      return;
    }
    const wizard = sellWizardRef.current;
    if (!wizard) return;

    setIsPublishingManual(true);
    try {
      const details = {
        brand: manualBrand.trim(),
        name: manualName.trim(),
        description: manualDescription.trim(),
        price: manualPrice,
        condition: manualCondition,
        location: user?.neighborhood || "",
        tags: manualTags,
        category: manualCategory,
        categoryAttributes: {},
        identifierConfidence: "high" as const,
        retrieval_fallback: false,
      };
      const pickup = manualPickup.trim() || user?.pickup_address || "";
      await wizard.postSingleListing({ details, pickupLocation: pickup });
      resetNewListingForm();
    } finally {
      setIsPublishingManual(false);
    }
  }, [isAuthenticated, newListingMode, wizardImageCount, manualBrand, manualName, manualDescription, manualPrice, manualCondition, manualCategory, manualPickup, manualTags, user, resetNewListingForm]);

  const handleSaveListingFromMarket = async (patch: ListingUpdatePatch) => {
    if (!listingDetailData || !token) return;
    const formData = new FormData();
    formData.append("data", JSON.stringify(patch));
    const res = await apiFetch(`/api/listings/${listingDetailData.id}`, {
      method: "PUT",
      body: formData,
    });
    if (res.ok) {
      setShowEditListingModal(false);
      setShowListingDetailModal(false);
      setListingDetailData(null);
      fetchListings();
    }
  };

  const openUserDashboard = (userId: string) => {
    if (!token || userId === user?.id) return;
    setViewingUserId(userId);
  };

  const listingViewSourceRef = useRef<ViewSource>("direct");

  // Infinite-scroll sentinel for the marketplace grid.
  const marketSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (page !== "market") return;
    const el = marketSentinelRef.current;
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

  const openListingDetail = async (listing: Listing, source: ViewSource = "direct") => {
    listingViewSourceRef.current = source;
    setShowListingDetailModal(true);
    setListingDetailData(listing);
    setListingDetailSellerProfile(null);
    setBuyerOrderStatus(null);
    addToHistory({ id: listing.id, title: formatTitle(listing.brand, listing.name), imageUrl: listing.imageUrls?.[0] || listing.imageUrl, price: listing.price, type: "viewed" });
    if (token && listing.userId) {
      setIsLoadingListingDetail(true);
      try {
        const [profileRes, orderStatusRes] = await Promise.all([
          apiFetch(`/api/friends/profile/${listing.userId}`),
          listing.userId !== user?.id
            ? apiFetch(`/api/orders/status/${listing.id}`)
            : Promise.resolve(null),
        ]);
        if (profileRes.ok) setListingDetailSellerProfile(await profileRes.json());
        if (orderStatusRes && orderStatusRes.ok) setBuyerOrderStatus(await orderStatusRes.json());
      } catch { /* ignore */ }
      finally { setIsLoadingListingDetail(false); }
    }
  };

  // Dwell-time tracking for the listing detail view.
  //
  // Fires logView exactly once per "view session" — the period from when the
  // detail modal opens to when it closes (cleanup), the listing changes
  // (cleanup with a new id), the route changes (cleanup because page in deps
  // forces re-run), or the tab is hidden (visibilitychange).
  //
  // The fired guard prevents double-firing: visibilitychange may flush first,
  // then cleanup runs on unmount and is a no-op.
  useEffect(() => {
    if (!showListingDetailModal || !listingDetailData) return;
    const listingId = listingDetailData.id;
    const source = listingViewSourceRef.current;
    const startTs = performance.now();
    let fired = false;

    const flush = () => {
      if (fired) return;
      fired = true;
      logView({
        listing_id: listingId,
        source,
        dwell_ms: Math.max(0, Math.round(performance.now() - startTs)),
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [showListingDetailModal, listingDetailData?.id, page]);

  const openEditPickupSlots = (listing: Listing, orderId: number, existingSlots: { date: string; time: string }[]) => {
    setListingDetailData(listing);
    setBuyEditingOrder({ id: orderId, existingSlots });
    setShowBuyModal(true);
  };

  const handleBuyConfirmed = (orderId: number, listing: Listing) => {
    addToHistory({ id: listing.id, title: formatTitle(listing.brand, listing.name), imageUrl: listing.imageUrls?.[0] || listing.imageUrl, price: listing.price, type: "purchased" });
    setBuyerOrderStatus({ status: "pending", order_id: orderId });
    setMyOrderStatuses((prev) => ({ ...prev, [listing.id]: { status: "pending", orderId } }));
    setShowBuyModal(false);
    setShowListingDetailModal(false);
    setListingDetailData(null);
    setListingDetailSellerProfile(null);
    fetchListings();
  };

  const handleBuyUpdated = () => {
    setShowBuyModal(false);
    setBuyEditingOrder(null);
  };

  // Close profile dropdown on outside click
  useClickOutside(profileRef, () => setProfileOpen(false), profileOpen);

  // Fetch unread notification count periodically
  const fetchUnreadCount = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch { /* ignore */ }
  };

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/notifications");
      if (res.ok) {
        setNotifications(await res.json());
      }
    } catch { /* ignore */ } finally {
      setNotificationsLoaded(true);
    }
  };

  const handleMarkAllRead = async () => {
    if (!token) return;
    try {
      await apiFetch("/api/notifications/mark-read", {
        method: "POST",
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const handleNotificationAction = async (notificationId: number, action: "accept" | "reject") => {
    if (!token) return;
    try {
      const res = await apiFetch(`/api/notifications/${notificationId}/${action}`, {
        method: "POST",
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId
              ? { ...n, join_request_status: action === "accept" ? "accepted" : "rejected" }
              : n
          )
        );
      }
    } catch (err) {
      console.error(`Failed to ${action} request:`, err);
    }
  };

  const notificationsRef = useRef(notifications);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);

  const markNotificationRead = useCallback((notificationId: number) => {
    const target = notificationsRef.current.find((n) => n.id === notificationId);
    if (!target || target.is_read) return;
    setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)));
    setUnreadCount((u) => Math.max(0, u - 1));
    // Server endpoint is idempotent — fire-and-forget; UI is already optimistic.
    apiFetch(`/api/notifications/${notificationId}/read`, { method: "POST" }).catch(() => {});
  }, []);

  const handleNotifClick = useCallback((notificationId: number, type: string, listingId: string | null) => {
    const withListing = ["purchase","order_withdrawn","order_updated","order_confirmed","review_submitted","address_released","order_completed"].includes(type);
    const noListing = ["order_declined","order_cancelled","order_expired"].includes(type);
    // Order-related notifs clear themselves on click — join_request/etc. require
    // explicit accept/reject action so we leave them unread.
    if (withListing || noListing) {
      markNotificationRead(notificationId);
    }
    if (withListing && listingId) {
      setNotificationsOpen(false);
      setPendingListingId(listingId);
      setPage("account");
    } else if (noListing) {
      setNotificationsOpen(false);
      setPage("account");
    }
  }, [markNotificationRead]);

  const handleNotifConfirmPickup = useCallback((listingId: string | null) => {
    setNotificationsOpen(false);
    if (listingId) setPendingListingId(listingId);
    setPage("account");
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, token]);


  const handleLogout = async () => {
    setProfileOpen(false);
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // ignore
    }
    await logout();
    setListings([]);
    setListingsLoaded(false);
    setNotifications([]);
    setNotificationsLoaded(false);
    setUnreadCount(0);
    setWishlist(new Set());
    setWishlistItems([]);
    setHistoryItems([]);
    localStorage.removeItem("ge_history");
    setPublicCommunities([]);
    setPrivateCommunities([]);
    setSelectedMarketCommunities([]);
    setHomeSearch("");
    setMarketSearch("");
    setTradeMode("buy");
    setMarketSort("newest");
    setMyOrderStatuses({});
    sellWizardRef.current?.resetForLogout();
    setPage("home");
  };

  const fetchFilterCommunities = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/communities/mine-with-neighborhood");
      if (res.ok) {
        const data = await res.json();
        setPublicCommunities(data.public || []);
        setPrivateCommunities(data.private || []);
      }
    } catch (err) {
      console.error("Failed to fetch communities:", err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchFilterCommunities();
  }, [isAuthenticated, page]);

  useEffect(() => {
    apiFetch("/api/categories")
      .then((res) => res.json())
      .then((data) => setCategorySchemas(data))
      .catch((err) => console.error("Failed to fetch category schemas:", err));
  }, []);

  const fetchListings = async () => {
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
    if (debouncedMarketSearch) params.set("search", debouncedMarketSearch);
    // Map the new UI sort labels onto backend modes. `recommended` and
    // `trending` both ride the existing `sort=newest` request — when no
    // community is selected and no search is active, the backend falls into
    // its FYP scoring path, which is the current proxy for "recommended".
    // TODO: add a real `trending` sort backend-side (view count window).
    const backendSort = marketSort === "newest" ? "newest" : "newest";
    params.set("sort", backendSort);
    if (selectedCategories.length > 0) params.set("category", selectedCategories.join(","));

    if (isAuthenticated && token) {
      if (selectedMarketCommunities.length > 0) {
        params.set("community", selectedMarketCommunities.join(","));
        if (selectedMarketCommunities.includes("neighborhood") && user?.neighborhood) {
          params.set("neighborhood", user.neighborhood);
        }
      } else {
        // Default feed: no community filter → backend returns tier-ranked results
        if (user?.neighborhood) params.set("neighborhood", user.neighborhood);
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
  };

  const fetchWishlist = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/wishlist");
      if (res.ok) {
        const ids: string[] = await res.json();
        setWishlist(new Set(ids));
      }
    } catch (err) {
      console.error("Failed to fetch wishlist:", err);
    }
  };

  const fetchWishlistItems = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/wishlist/listings");
      if (res.ok) {
        const data: Listing[] = await res.json();
        setWishlistItems(data);
      }
    } catch (err) {
      console.error("Failed to fetch wishlist listings:", err);
    }
  };

  const toggleWishlist = async (listingId: string) => {
    if (!token) return;
    try {
      const res = await apiFetch(`/api/wishlist/${listingId}`, {
        method: "POST",
      });
      if (res.ok) {
        const { wishlisted } = await res.json();
        setWishlist((prev) => {
          const next = new Set(prev);
          wishlisted ? next.add(listingId) : next.delete(listingId);
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to toggle wishlist:", err);
    }
  };

  useEffect(() => {
    if (page === "market") fetchListings();
  }, [page, debouncedMarketSearch, selectedMarketCommunities, marketSort, selectedCategories, isAuthenticated, showMyListings]);

  // Reset the visible window whenever the underlying feed changes so the user
  // doesn't land deep into a now-shorter list.
  useEffect(() => {
    setVisibleCount(24);
  }, [debouncedMarketSearch, selectedMarketCommunities, marketSort, selectedCategories, showMyListings]);

  // Keep the URL hash in sync with the current page so a browser refresh
  // preserves where the user was. The initializer above reads from the hash
  // on load; this effect closes the loop on every setPage(...) transition.
  // replaceState (not pushState) so we don't pollute back-button history —
  // back still exits the app, matching prior behavior.
  useEffect(() => {
    const current = window.location.hash.replace("#", "");
    if (current !== page) {
      window.history.replaceState(null, "", `#${page}`);
    }
  }, [page]);

  useEffect(() => {
    if (token) fetchWishlist();
  }, [token]);

  useEffect(() => {
    if (page === "account" && token) fetchWishlistItems();
  }, [page, token]);

  const fetchMyOrderStatuses = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/orders");
      if (res.ok) {
        const orders: { id: number; listing_id: string; status: string; role: string; selected_pickup_slots: { date: string; time: string }[] }[] = await res.json();
        const statuses: Record<string, { status: string; orderId: number }> = {};
        for (const o of orders) {
          if (o.role === "buyer") statuses[o.listing_id] = { status: o.status, orderId: o.id };
        }
        setMyOrderStatuses(statuses);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (token) fetchMyOrderStatuses();
  }, [token]);

  // Redirect to home if user logs out while on a protected page
  useEffect(() => {
    if (!isAuthenticated && page === "account") {
      setPage("home");
    }
    if (!isAuthenticated && page === "signup" && !pendingSignupToken) {
      setPage("home");
    }
  }, [isAuthenticated, page, pendingSignupToken]);

  // If user needs registration and we have a pending token, redirect to signup
  useEffect(() => {
    if (needsRegistration && pendingSignupToken && page !== "signup") {
      setPage("signup");
    }
  }, [needsRegistration, pendingSignupToken]);

  const userInitials = (() => {
    const name = user?.display_name?.trim();
    if (!name) return "";
    const parts = name.split(/\s+/);
    const letters = parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase());
    return letters.join("");
  })();

  const navLinkClass = (active: boolean) =>
    `relative bg-transparent border-none cursor-pointer text-sm transition-colors px-1 ${
      active ? "text-primary font-semibold" : "text-muted hover:text-ink"
    }`;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Navigation */}
      <nav className="sticky top-0 border-b border-hairline bg-canvas z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-6 h-16">
            {/* Left: Wordmark */}
            <button
              onClick={() => setPage("home")}
              className="bg-transparent border-none cursor-pointer text-primary text-2xl font-extrabold tracking-wordmark"
            >
              Cosello
            </button>

            {/* Center: Route-aware nav */}
            <div className="hidden md:flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => setPage("home")}
                aria-current={page === "home" ? "page" : undefined}
                className={navLinkClass(page === "home")}
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => setPage("market")}
                aria-current={page === "market" ? "page" : undefined}
                className={navLinkClass(page === "market")}
              >
                Marketplace
              </button>
              <button
                type="button"
                disabled
                title="Coming soon"
                className={`${navLinkClass(false)} opacity-50 cursor-not-allowed`}
              >
                Communities
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated) { setPage("signin"); return; }
                  setPage("account");
                }}
                aria-current={page === "account" ? "page" : undefined}
                className={navLinkClass(page === "account")}
              >
                My account
              </button>
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <>
                {/* Message (placeholder — no route) */}
                <button
                  type="button"
                  aria-label="Messages"
                  className="inline-flex items-center justify-center size-9 rounded-full bg-transparent text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
                >
                  <MessageCircle className="size-[18px]" />
                </button>

                {/* Notifications Bell */}
                <div className="relative">
                  <button
                    aria-label="Notifications"
                    onClick={() => {
                      setNotificationsOpen((prev) => {
                        if (!prev) {
                          fetchNotifications();
                        } else {
                          if (unreadCount > 0) handleMarkAllRead();
                        }
                        return !prev;
                      });
                    }}
                    className="relative inline-flex items-center justify-center size-9 rounded-full bg-transparent text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
                  >
                    <Bell className="size-[18px]" />
                    {unreadCount > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1.5 right-2 size-2 rounded-full bg-primary ring-2 ring-canvas"
                      />
                    )}
                  </button>

                  <NotificationsPanel
                    open={notificationsOpen}
                    onClose={() => {
                      setNotificationsOpen(false);
                      if (unreadCount > 0) handleMarkAllRead();
                    }}
                    notifications={notifications}
                    notificationsLoaded={notificationsLoaded}
                    unreadCount={unreadCount}
                    onMarkAllRead={handleMarkAllRead}
                    onAction={handleNotificationAction}
                    onNotifClick={handleNotifClick}
                    onConfirmPickup={handleNotifConfirmPickup}
                    onOpenUserDashboard={openUserDashboard}
                  />
                </div>

                {/* Sell pill — routes to the dedicated New Listing surface. */}
                <button
                  type="button"
                  onClick={() => { setPage("newlisting"); }}
                  className="inline-flex items-center justify-center bg-primary text-on-primary rounded-full px-4 h-9 text-sm font-semibold hover:bg-primary-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  Sell
                </button>

                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen((prev) => !prev)}
                    aria-label="Account menu"
                    className="inline-flex items-center justify-center size-9 rounded-full bg-canvas border border-primary text-ink text-xs font-semibold hover:bg-primary-soft transition-colors cursor-pointer overflow-hidden"
                  >
                    {user?.profile_picture ? (
                      <img src={user.profile_picture} alt="" className="size-full object-cover" />
                    ) : userInitials ? (
                      <span>{userInitials}</span>
                    ) : (
                      <User className="size-4 text-muted" />
                    )}
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-48 rounded-md border border-hairline bg-canvas shadow-overlay overflow-hidden z-50">
                      {user?.display_name && (
                        <div className="px-3 py-2 border-b border-hairline">
                          <p className="text-xs font-semibold text-ink truncate">{user.display_name}</p>
                          <p className="text-[11px] text-muted truncate">{user.neighborhood}</p>
                        </div>
                      )}

                      <div className="py-1">
                        <button
                          onClick={() => { setProfileOpen(false); setPage("account"); }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-body hover:bg-surface-soft hover:text-ink transition-colors text-left"
                        >
                          <User className="size-3.5" />
                          My Account
                        </button>
                        <button
                          onClick={() => { setProfileOpen(false); setPage("settings"); }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-body hover:bg-surface-soft hover:text-ink transition-colors text-left"
                        >
                          <Settings className="size-3.5" />
                          Settings
                        </button>
                        <button
                          onClick={() => { setProfileOpen(false); setPage("help"); }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-body hover:bg-surface-soft hover:text-ink transition-colors text-left"
                        >
                          <HelpCircle className="size-3.5" />
                          Help & Support
                        </button>
                      </div>

                      <div className="border-t border-hairline py-1">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-error hover:bg-surface-soft transition-colors text-left"
                        >
                          <LogOut className="size-3.5" />
                          Log Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </>
              ) : (
                <Button
                  onClick={() => setPage("signin")}
                  variant="outline"
                  size="sm"
                >
                  Log In
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    aria-label="Open menu"
                  >
                    <Menu className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-56 bg-canvas border border-hairline shadow-overlay rounded-md p-1"
                >
                  <DropdownMenuItem
                    onSelect={() => setPage("home")}
                    className="text-ink hover:bg-surface-soft focus:bg-surface-soft focus:text-ink"
                  >
                    Home
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setPage("market")}
                    className="text-ink hover:bg-surface-soft focus:bg-surface-soft focus:text-ink"
                  >
                    Marketplace
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled
                    title="Coming soon"
                    className="text-ink opacity-50 cursor-not-allowed focus:bg-transparent focus:text-ink"
                  >
                    Communities
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      if (!isAuthenticated) { setPage("signin"); return; }
                      setPage("account");
                    }}
                    className="text-ink hover:bg-surface-soft focus:bg-surface-soft focus:text-ink"
                  >
                    My account
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => { setPage("newlisting"); }}
                    className="text-primary font-semibold hover:bg-surface-soft focus:bg-surface-soft focus:text-primary"
                  >
                    Sell
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {isAuthenticated ? (
                    <>
                      <DropdownMenuItem
                        onSelect={() => setPage("account")}
                        className="text-ink hover:bg-surface-soft focus:bg-surface-soft focus:text-ink"
                      >
                        <User className="size-3.5" />
                        Profile
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setPage("settings")}
                        className="text-ink hover:bg-surface-soft focus:bg-surface-soft focus:text-ink"
                      >
                        <Settings className="size-3.5" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setPage("help")}
                        className="text-ink hover:bg-surface-soft focus:bg-surface-soft focus:text-ink"
                      >
                        <HelpCircle className="size-3.5" />
                        Help & Support
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => { void handleLogout(); }}
                        className="text-error hover:bg-surface-soft focus:bg-surface-soft focus:text-error"
                      >
                        <LogOut className="size-3.5" />
                        Log Out
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem
                      onSelect={() => setPage("signin")}
                      className="text-ink hover:bg-surface-soft focus:bg-surface-soft focus:text-ink"
                    >
                      Sign in
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </nav>

      {/* Sign In Page */}
      {page === "signin" && (
        <Suspense fallback={null}>
          <SignInPage
            onSuccess={(newToken, userExists, newUser) => {
              if (!userExists || !newUser?.display_name || !newUser?.neighborhood) {
                // Don't log in yet — hold token until profile is completed
                setPendingSignupToken(newToken);
                setPendingSignupUser(newUser);
                setPage("signup");
              } else {
                login(newToken, newUser);
                setPage("home");
              }
            }}
            onCancel={() => setPage("home")}
          />
        </Suspense>
      )}

      {/* Sign Up Page */}
      {page === "signup" && pendingSignupToken && (
        <Suspense fallback={null}>
          <SignUpPage
            pendingToken={pendingSignupToken}
            onComplete={(completedUser) => {
              login(pendingSignupToken, completedUser);
              setPendingSignupToken(null);
              setPendingSignupUser(null);
              setPage("account");
            }}
            onCancel={() => {
              setPendingSignupToken(null);
              setPendingSignupUser(null);
              setPage("home");
            }}
          />
        </Suspense>
      )}

      {/*
        SellWizard is mounted at the app shell so its internal state
        (uploadedImages, segmentation, bulkItems, etc.) survives navigation
        between pages. It only renders content when isActive is true.
      */}
      {page === "newlisting" && (
        <section className="min-h-[calc(100vh-64px)] bg-canvas">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {/* Breadcrumb + title + toolbar */}
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <div className="min-w-0">
                <nav aria-label="Breadcrumb" className="text-xs text-muted flex items-center gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => { if (!isAuthenticated) { setPage("signin"); return; } setPage("account"); }}
                    className="hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded"
                  >
                    My account
                  </button>
                  <span aria-hidden="true">·</span>
                  <span>Drafts</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-ink font-medium">New listing</span>
                </nav>
                <h1 className="text-3xl font-extrabold tracking-display text-ink leading-[1.05]">
                  New listing
                </h1>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    // Drafts API isn't wired yet — flagged in backlog.md.
                    alert("Drafts are coming soon. For now, finish the listing and publish it.");
                  }}
                  className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border-strong text-sm font-semibold text-ink bg-canvas hover:bg-surface-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  Save draft
                </button>
                {newListingMode === "manual" && (
                  <button
                    type="button"
                    disabled={isPublishingManual || wizardImageCount === 0}
                    onClick={handlePublishNewListing}
                    className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    {isPublishingManual ? "Publishing…" : "Publish listing"}
                  </button>
                )}
              </div>
            </div>

            {/* Two-column body */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
              {/* Left — form column */}
              <div className="space-y-6 min-w-0">
                {/* Photos section eyebrow */}
                <section>
                  <header className="flex items-baseline justify-between mb-3">
                    <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">Photos</h2>
                    <span className={`text-xs ${wizardImageCount > 0 ? "text-primary" : "text-muted"}`}>
                      {wizardImageCount}/20 — first photo becomes the cover
                    </span>
                  </header>
                  {/* SellWizard photo composer renders below via the app-shell
                      mount. In Manual mode it stays as the composer only; in
                      AI mode it expands into the full wizard flow. */}
                  <SellWizard
                    ref={sellWizardRef}
                    categorySchemas={categorySchemas}
                    isActive={true}
                    mode={newListingMode}
                    photosOnly={newListingMode === "manual"}
                    onSwitchToBuy={() => { setTradeMode("buy"); setPage("home"); }}
                    onRequestSignIn={() => setPage("signin")}
                    onPosted={() => {
                      resetNewListingForm();
                      setPage("market");
                      fetchListings();
                    }}
                    onRequestSinglePostConfirm={() => setShowPostConfirm(true)}
                    onPhaseChange={setWizardPhase}
                    onImagesChange={setWizardImageCount}
                  />
                </section>

                {/* AI / Manual toggle — green callout */}
                <div className="bg-primary-soft border border-primary/20 rounded-md p-5">
                  <div role="tablist" aria-label="Listing creation mode" className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={newListingMode === "ai"}
                      onClick={() => setNewListingMode("ai")}
                      className={`h-10 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                        newListingMode === "ai"
                          ? "bg-primary text-on-primary"
                          : "bg-transparent text-primary hover:bg-primary/10"
                      }`}
                    >
                      AI Drafted
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={newListingMode === "manual"}
                      onClick={() => setNewListingMode("manual")}
                      className={`h-10 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                        newListingMode === "manual"
                          ? "bg-primary text-on-primary"
                          : "bg-transparent text-primary hover:bg-primary/10"
                      }`}
                    >
                      Manual
                    </button>
                  </div>
                  <p className="text-xs text-body mt-3 leading-relaxed">
                    {newListingMode === "ai"
                      ? "Upload as many items and we'll take care of the rest."
                      : "Fill out the product details, description, and pricing below to publish your listing."}
                  </p>
                </div>

                {/* Manual form sections */}
                {newListingMode === "manual" && (
                  <>
                    <section className="bg-canvas border border-hairline rounded-md p-5 space-y-4">
                      <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Product details</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                          <span className="text-xs text-muted uppercase tracking-wider">Brand</span>
                          <Input
                            value={manualBrand}
                            onChange={(e) => setManualBrand(e.target.value)}
                            placeholder="Olivetti, Eames, Le Creuset…"
                            className="mt-1"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-muted uppercase tracking-wider">Name / model</span>
                          <Input
                            value={manualName}
                            onChange={(e) => setManualName(e.target.value)}
                            placeholder="Lettera 32, LCW chair, 5.5qt dutch oven…"
                            className="mt-1"
                          />
                        </label>
                      </div>
                      <div>
                        <span className="text-xs text-muted uppercase tracking-wider">Category</span>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {(Object.entries(categorySchemas).length > 0
                            ? Object.entries(categorySchemas).map(([slug, schema]) => ({ slug: slug as CategorySlug, label: schema.label }))
                            : ([
                                { slug: "clothing", label: "Clothing" },
                                { slug: "furniture", label: "Furniture" },
                                { slug: "electronics", label: "Electronics" },
                                { slug: "sports", label: "Sports" },
                                { slug: "collectibles", label: "Collectibles" },
                                { slug: "other", label: "Other" },
                              ] as { slug: CategorySlug; label: string }[])
                          ).map((c) => {
                            const active = manualCategory === c.slug;
                            return (
                              <button
                                key={c.slug}
                                type="button"
                                onClick={() => setManualCategory(c.slug)}
                                aria-pressed={active}
                                className={`h-8 px-3 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                                  active
                                    ? "bg-primary text-on-primary"
                                    : "bg-surface-soft text-body border border-hairline hover:border-border-strong hover:text-ink"
                                }`}
                              >
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-muted uppercase tracking-wider">Condition</span>
                        <div role="radiogroup" aria-label="Condition" className="flex flex-wrap gap-2 mt-2">
                          {CONDITIONS.map((c) => {
                            const active = manualCondition === c;
                            return (
                              <button
                                key={c}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => setManualCondition(c)}
                                className={`h-8 px-3 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                                  active
                                    ? "bg-primary text-on-primary"
                                    : "bg-surface-soft text-body border border-hairline hover:border-border-strong hover:text-ink"
                                }`}
                              >
                                {c}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </section>

                    <section className="bg-canvas border border-hairline rounded-md p-5 space-y-3">
                      <header className="flex items-baseline justify-between">
                        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Description</h3>
                        <span className="text-xs text-muted">{manualDescription.length} characters</span>
                      </header>
                      <textarea
                        value={manualDescription}
                        onChange={(e) => setManualDescription(e.target.value)}
                        rows={5}
                        placeholder="Tell the story. Where you got it, what you used it for, any flaws worth calling out."
                        className="w-full min-h-32 bg-surface-soft border border-hairline rounded-md p-3 text-sm text-ink placeholder:text-muted-soft resize-y focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                      />
                      <div>
                        <span className="text-xs text-muted uppercase tracking-wider">Tags</span>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {manualTags.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-primary-soft border border-primary/20 text-primary-active"
                            >
                              {t}
                              <button
                                type="button"
                                aria-label={`Remove ${t}`}
                                onClick={() => setManualTags((prev) => prev.filter((x) => x !== t))}
                                className="hover:text-ink transition-colors"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                          <input
                            value={manualTagInput}
                            onChange={(e) => setManualTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              const trimmed = manualTagInput.trim();
                              if (!trimmed || manualTags.includes(trimmed)) return;
                              setManualTags((prev) => [...prev, trimmed]);
                              setManualTagInput("");
                            }}
                            placeholder={manualTags.length ? "Add another…" : "typewriter, 1960s…"}
                            className="w-32 px-2.5 py-1 rounded-full text-xs bg-canvas border border-border-strong text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>
                      </div>
                    </section>

                    <section className="bg-canvas border border-hairline rounded-md p-5 space-y-4">
                      <header className="flex items-baseline justify-between gap-2">
                        <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">Pricing &amp; pickup</h3>
                        {/* Price suggestion is faked for now; real suggestion logic
                            is queued in backlog.md (sell-flow pricing). */}
                        <span className="bg-primary-soft text-primary px-2 py-1 rounded-full text-xs font-medium">
                          Suggested $60 – $120
                        </span>
                      </header>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <span className="text-xs text-muted uppercase tracking-wider">Price</span>
                          <div className="flex items-center gap-1 mt-1 border border-border-strong rounded-md bg-canvas focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 px-3 h-12">
                            <span className="text-3xl font-extrabold tracking-display text-ink">$</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={manualPrice}
                              onChange={(e) => setManualPrice(e.target.value.replace(/\D/g, ""))}
                              placeholder="0"
                              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-3xl font-extrabold tracking-display text-ink placeholder:text-muted-soft"
                            />
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-muted uppercase tracking-wider">Pickup neighborhood</span>
                          <div className="flex items-center gap-2 mt-1 border border-border-strong rounded-md bg-canvas focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 px-3 h-12">
                            <MapPin className="size-4 text-primary shrink-0" aria-hidden="true" />
                            <input
                              type="text"
                              value={manualPickup}
                              onChange={(e) => setManualPickup(e.target.value)}
                              placeholder={user?.neighborhood || "West Village"}
                              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-ink placeholder:text-muted-soft"
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-soft leading-relaxed">
                        Your address will not be shared until pickup is confirmed.
                      </p>
                    </section>
                  </>
                )}
              </div>

              {/* Right — sticky preview column */}
              <aside className="lg:sticky lg:top-20 self-start space-y-4">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Listing preview</p>
                <article className="bg-canvas border border-hairline rounded-md overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary-soft/60 border-b border-hairline text-xs">
                    <span className="size-3 rounded-full bg-primary shrink-0" aria-hidden="true" />
                    <span className="text-ink font-medium truncate">{PLACEHOLDER_COMMUNITY.name}</span>
                  </div>
                  <div className="relative aspect-square bg-surface-soft">
                    {/* Cover image — first uploaded photo. Wizard owns the
                        blob URLs; we read the count above and only show the
                        cover when at least one exists. The actual cover URL
                        isn't exposed via the imperative handle yet (intentional —
                        keeps the contract minimal); the preview shows a tinted
                        placeholder until publish. */}
                    {wizardImageCount > 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary-soft text-primary">
                        <ImagePlus className="size-8" aria-hidden="true" />
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-muted-soft">
                        <ImagePlus className="size-8" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-medium text-ink line-clamp-1">
                      {(() => {
                        if (newListingMode !== "manual") {
                          return wizardImageCount > 0 ? "Your listing title" : "Untitled";
                        }
                        const brand = manualBrand.trim();
                        const name = manualName.trim();
                        if (brand && name) return `${brand} — ${name}`;
                        return brand || name || "Untitled";
                      })()}
                    </p>
                    <p className="text-xs text-muted line-clamp-1">
                      {(newListingMode === "manual" ? manualPickup.trim() : "") || user?.neighborhood || "West Village"}
                      {newListingMode === "manual" ? ` · ${manualCondition}` : ""}
                    </p>
                    <p className="text-2xl font-extrabold text-primary tracking-display leading-none pt-1">
                      {newListingMode === "manual" && manualPrice ? `$${manualPrice}` : "$—"}
                    </p>
                  </div>
                </article>

                <div className="bg-canvas border border-hairline rounded-md p-4">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Before you publish</p>
                  <ul className="space-y-2">
                    {([
                      ["At least one photo", wizardImageCount > 0],
                      ["Brand or name", newListingMode === "manual" ? (manualBrand.trim().length > 0 || manualName.trim().length > 0) : false],
                      ["Price set", newListingMode === "manual" ? /^[0-9]+$/.test(manualPrice) && Number.parseInt(manualPrice, 10) > 0 : false],
                      ["Description 20+ chars", newListingMode === "manual" ? manualDescription.trim().length >= 20 : false],
                    ] as const).map(([label, done]) => (
                      <li key={label} className="flex items-center gap-2.5 text-sm">
                        <span
                          aria-hidden="true"
                          className={`inline-flex items-center justify-center size-4 rounded-full border ${
                            done ? "bg-primary border-primary text-on-primary" : "bg-canvas border-hairline text-transparent"
                          }`}
                        >
                          <Check className="size-3" />
                        </span>
                        <span className={done ? "text-muted line-through" : "text-body"}>{label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        </section>
      )}

      {page === "home" && (
        <section className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 sm:px-6 lg:px-8 py-16">
          <div className="w-full max-w-[760px]">
            <div className="mb-8">
              <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-muted mb-5">
                {(() => {
                  const d = new Date();
                  const wk = d.toLocaleDateString("en-US", { weekday: "long" });
                  const mo = d.toLocaleDateString("en-US", { month: "long" });
                  return `${wk}, ${d.getDate()} ${mo} ${d.getFullYear()}`.toUpperCase();
                })()}
              </p>
              <h1 className="text-5xl sm:text-6xl font-extrabold tracking-display text-ink leading-[1.05] mb-5">
                Hey, {user?.display_name?.split(" ")[0] ?? "there"}.
              </h1>
              <p className="text-body text-base sm:text-lg leading-relaxed max-w-[56ch] mb-8">
                Tell us what you're looking for, or drop a few photos and we'll write the listing for you.
              </p>

              <div role="tablist" aria-label="Buy or sell" className="inline-flex items-center p-1 bg-surface-soft border border-hairline rounded-full mb-6">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tradeMode === "buy"}
                  onClick={() => setTradeMode("buy")}
                  className={`px-5 h-8 text-sm font-semibold rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${tradeMode === "buy" ? "bg-primary-soft text-primary" : "text-muted hover:text-ink bg-transparent"}`}
                >
                  Buy
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tradeMode === "sell"}
                  onClick={() => setTradeMode("sell")}
                  className={`px-5 h-8 text-sm font-semibold rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${tradeMode === "sell" ? "bg-primary-soft text-primary" : "text-muted hover:text-ink bg-transparent"}`}
                >
                  Sell
                </button>
              </div>
            </div>

            <div className="w-full max-w-[720px]">
              {tradeMode === "buy" ? (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const query = homeSearch.trim();
                      setMarketSearch(homeSearch);
                      setPage("market");
                      if (query) {
                        const filters: Record<string, unknown> = {};
                        if (selectedCategories.length > 0) filters.categories = selectedCategories;
                        if (selectedMarketCommunities.length > 0) filters.communities = selectedMarketCommunities;
                        if (marketSort && marketSort !== "newest") filters.sort = marketSort;
                        logSearch({ query, filters });
                      }
                    }}
                    className="flex items-center gap-2 h-16 bg-canvas border border-hairline rounded-full pl-6 pr-2 shadow-card"
                  >
                    <Search className="size-[18px] text-muted shrink-0" />
                    <input
                      type="text"
                      value={homeSearch}
                      onChange={(e) => setHomeSearch(e.target.value)}
                      placeholder="Search for vintage furniture, books, anything..."
                      className="flex-1 bg-transparent border-0 outline-none text-base text-ink placeholder:text-muted-soft min-w-0"
                    />
                    <button
                      type="submit"
                      className="h-12 px-6 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      Search
                    </button>
                  </form>

                  <div className="flex flex-wrap gap-2 mt-5 items-center">
                    <span className="text-sm text-muted mr-1">Try</span>
                    {["Walnut sideboard", "Le Creuset", "Mid-century lamp", "Wool rug", "Vintage Levi's"].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setHomeSearch(q)}
                        className="text-sm font-medium text-body bg-transparent border border-hairline rounded-full px-3 py-1.5 hover:border-border-strong hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                // R-4.1: Home Sell composer is a thin entry point — photos
                // drop only on the dedicated #newlisting surface to keep the
                // wizard state plumbing simple (Option B). Click submit →
                // navigate to the New Listing page.
                <button
                  type="button"
                  onClick={() => setPage("newlisting")}
                  className="group w-full flex items-center gap-3 h-16 bg-canvas border border-hairline rounded-full pl-6 pr-2 shadow-card text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  <ImagePlus className="size-[18px] text-primary shrink-0" />
                  <span className="flex-1 text-base text-muted">Tell us what you're selling…</span>
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary text-on-primary group-hover:bg-primary-hover transition-colors shrink-0"
                  >
                    <ArrowRight className="size-[18px]" />
                  </span>
                </button>
              )}
            </div>
          </div>
        </section>
      )}


      {page === "market" && (
        <section className="relative min-h-[calc(100vh-64px)] flex">
          <MarketplaceSidebar
            collapsed={marketSidebarCollapsed}
            onToggleCollapsed={toggleMarketSidebar}
            isMobile={!isDesktop}
            marketSearch={marketSearch}
            onMarketSearchChange={setMarketSearch}
            isAuthenticated={isAuthenticated}
            filterCommunities={filterCommunities}
            selectedMarketCommunities={selectedMarketCommunities}
            onToggleCommunity={handleToggleMarketCommunity}
            categorySchemas={categorySchemas}
            selectedCategories={selectedCategories}
            onToggleCategory={handleToggleCategory}
            distanceMiles={distanceMiles}
            onDistanceChange={setDistanceMiles}
            showMyListings={showMyListings}
            onToggleMyListings={handleToggleMyListings}
          />
          <main className="flex-1 min-w-0 px-6 lg:px-8 pt-8 pb-20">
            {/* Header: neighborhood + sort */}
            <header className="flex flex-wrap items-end justify-between gap-4 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-4xl font-extrabold text-ink tracking-display leading-[1.05] truncate">
                    {user?.neighborhood ?? "Marketplace"}
                  </h1>
                  <button
                    type="button"
                    aria-label="Change location"
                    title="Change location"
                    className="size-9 rounded-full inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    <Settings className="size-4" />
                  </button>
                </div>
                <p className="text-sm text-muted mt-1">
                  {user?.zip_code ? `${user.zip_code} · ` : ""}
                  {listings.length} {listings.length === 1 ? "item" : "items"} near you
                </p>
              </div>
              <div role="tablist" aria-label="Sort by" className="inline-flex items-center p-1 bg-surface-soft border border-hairline rounded-full">
                {([
                  ["recommended", "Recommended"],
                  ["trending", "Trending"],
                  ["newest", "Newest"],
                ] as const).map(([id, label]) => {
                  const active = marketSort === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setMarketSort(id)}
                      className={`h-8 px-4 text-sm font-semibold rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                        active
                          ? "bg-canvas text-ink shadow-card"
                          : "text-muted hover:text-ink bg-transparent"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </header>

            {/* Grid */}
            {!listingsLoaded && listings.length === 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-7">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ListingCardSkeleton key={i} />
                ))}
              </div>
            ) : listings.length === 0 ? (
              <div className="text-center text-muted py-12 mt-7">
                {marketSearch || selectedMarketCommunities.length > 0 || selectedCategories.length > 0 || showMyListings
                  ? "No listings match your filters."
                  : "No listings yet."}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-7">
                  {listings.slice(0, visibleCount).map((listing, idx) => {
                    const images = listing.imageUrls && listing.imageUrls.length > 0
                      ? listing.imageUrls
                      : [listing.imageUrl];
                    const heroCommunity = listing.allCommunities?.find((c) => c.is_mutual)
                      ?? listing.allCommunities?.[0]
                      ?? PLACEHOLDER_COMMUNITY;
                    const isOwn = isAuthenticated && listing.userId === user?.id;
                    const isWishlisted = wishlist.has(listing.id);
                    return (
                      <article
                        key={listing.id}
                        onClick={() => openListingDetail(listing, marketSearch ? "search" : "direct")}
                        className="group bg-canvas border border-hairline rounded-md overflow-hidden cursor-pointer hover:shadow-hover transition-shadow motion-safe:animate-mkt-card-in"
                        style={{ animationDelay: `${Math.min(idx, 11) * 30}ms` }}
                      >
                        {/* Trust band — always renders community shape.
                            Falls back to PLACEHOLDER_COMMUNITY until the
                            sell-flow community selector lands (backlog.md). */}
                        <div className="flex items-center gap-2 px-3 py-2 bg-primary-soft/60 border-b border-hairline text-xs">
                          <span className="size-3 rounded-full bg-primary shrink-0" aria-hidden="true" />
                          <span className="text-ink font-medium truncate">{heroCommunity.name}</span>
                          {listing.seller_name && (
                            <>
                              <span className="text-muted">·</span>
                              <span className="text-muted truncate">@{listing.seller_name}</span>
                            </>
                          )}
                        </div>

                        {/* Photo */}
                        <div className="relative aspect-square bg-surface-soft">
                          <img
                            src={images[0]}
                            alt={formatTitle(listing.brand, listing.name)}
                            className="absolute inset-0 size-full object-cover"
                            loading="lazy"
                          />
                          {!isOwn && isAuthenticated && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleWishlist(listing.id); }}
                              aria-label={isWishlisted ? "Remove from saves" : "Save"}
                              aria-pressed={isWishlisted}
                              className="absolute top-2 right-2 size-8 rounded-full bg-canvas/90 backdrop-blur-sm border border-hairline inline-flex items-center justify-center text-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                            >
                              <Heart className={`size-4 ${isWishlisted ? "text-primary fill-primary" : ""}`} />
                            </button>
                          )}
                          {listing.status === "sold" && (
                            <span className="absolute top-2 left-2 text-[10px] uppercase tracking-widest font-semibold text-on-primary bg-ink px-2 py-1 rounded-sm">
                              Sold
                            </span>
                          )}
                        </div>

                        {/* Body */}
                        <div className="p-3 space-y-1">
                          <p className="text-sm font-medium text-ink line-clamp-1">{formatTitle(listing.brand, listing.name)}</p>
                          <p className="text-xs text-muted line-clamp-1">{listing.location}</p>
                          <p className="text-2xl font-extrabold text-primary tracking-display leading-none pt-1">${listing.price}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* End sentinel — also drives the IntersectionObserver. */}
                <div ref={marketSentinelRef} className="text-center py-8 text-sm text-muted italic">
                  {visibleCount < listings.length
                    ? "Loading more nearby…"
                    : `You've reached the end · ${listings.length} ${listings.length === 1 ? "item" : "items"}`}
                </div>
              </>
            )}
          </main>
        </section>
      )}

      {/* Terms & Conditions Page */}
      {page === "terms" && (
        <section className="py-12 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setPage("settings")}
              className="text-sm text-white/40 hover:text-white/60 transition-colors mb-6 flex items-center gap-1"
            >
              <ChevronRight className="size-3 rotate-180" />
              Back to Settings
            </button>

            <div className="flex items-center gap-3 mb-8">
              <Scale className="size-7 text-fuchsia-400" />
              <h2 className="text-3xl font-light tracking-wider" style={{ fontFamily: "'Courier Prime', monospace" }}>
                Terms & Conditions
              </h2>
            </div>

            <div className="space-y-8 text-sm text-white/70 leading-relaxed">
              <p className="text-white/40 text-xs">Last updated: February 27, 2026</p>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <FileText className="size-4 text-cyan-400" />
                  1. Acceptance of Terms
                </h3>
                <p>
                  By accessing or using Cosello ("the Platform"), you agree to be bound by these Terms & Conditions.
                  If you do not agree, you may not use the Platform. Cosello reserves the right to modify these terms
                  at any time, and continued use constitutes acceptance of any changes.
                </p>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <UserCheck className="size-4 text-cyan-400" />
                  2. Eligibility
                </h3>
                <p>
                  You must be at least 18 years old to use Cosello. By creating an account, you represent that you are
                  of legal age and have the legal capacity to enter into a binding agreement. Accounts are limited to one per
                  individual and are non-transferable.
                </p>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <Shield className="size-4 text-cyan-400" />
                  3. User Accounts & Responsibilities
                </h3>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                  <li>All activity under your account is your responsibility.</li>
                  <li>You must provide accurate, current, and complete information during registration and in all listings.</li>
                  <li>You agree to promptly update your account information if it changes.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <CreditCard className="size-4 text-cyan-400" />
                  4. Listings & Transactions
                </h3>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li>Sellers must accurately describe items including condition, defects, and any relevant details.</li>
                  <li>Prices listed must be in US Dollars and reflect the actual asking price.</li>
                  <li>By posting a listing, you confirm that you legally own the item or are authorized to sell it.</li>
                  <li>Sellers agree to make items available for pickup within <strong className="text-white">7 days</strong> of posting.</li>
                  <li>Cosello is a platform connecting buyers and sellers — it is not a party to any transaction between users.</li>
                  <li>All sales are final unless both parties mutually agree to a return or exchange.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <MapPin className="size-4 text-cyan-400" />
                  5. Pickup & Delivery
                </h3>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li>All transactions default to local pickup at the seller's designated pickup location.</li>
                  <li>Sellers and buyers must agree on a mutually convenient and safe meeting location.</li>
                  <li>Cosello recommends meeting in well-lit, public spaces during daytime hours.</li>
                  <li>Cosello is not responsible for any incidents during pickup or delivery.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <Eye className="size-4 text-cyan-400" />
                  6. Community Guidelines
                </h3>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li>Treat all users with respect. Harassment, threats, or abusive behavior will result in account suspension.</li>
                  <li>Do not post misleading, fraudulent, or deceptive listings.</li>
                  <li>Respect community-specific rules and norms when posting to private communities.</li>
                  <li>Spam, duplicate listings, or manipulative behavior (fake reviews, price manipulation) is prohibited.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <Ban className="size-4 text-cyan-400" />
                  7. Prohibited Items
                </h3>
                <p className="mb-2">The following may not be listed or sold on Cosello:</p>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li>Illegal substances, drugs, or drug paraphernalia</li>
                  <li>Weapons, firearms, ammunition, or explosives</li>
                  <li>Stolen property or items you do not have the right to sell</li>
                  <li>Counterfeit, replica, or knockoff goods</li>
                  <li>Hazardous materials or recalled products</li>
                  <li>Living animals (pet adoption services excluded)</li>
                  <li>Any item prohibited by local, state, or federal law</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <MessageSquare className="size-4 text-cyan-400" />
                  8. Dispute Resolution
                </h3>
                <p>
                  Cosello encourages buyers and sellers to resolve disputes directly. If a resolution cannot be reached,
                  users may submit a dispute through our support channel. Cosello may mediate but is not obligated to
                  resolve disputes and shall not be held liable for the outcome of any transaction. Any unresolved legal disputes
                  shall be governed by the laws of the State of New York.
                </p>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <AlertTriangle className="size-4 text-cyan-400" />
                  9. Limitation of Liability
                </h3>
                <p>
                  Cosello is provided "as is" without warranties of any kind. To the fullest extent permitted by law,
                  Cosello shall not be liable for any indirect, incidental, special, consequential, or punitive damages
                  arising from your use of the Platform, including but not limited to loss of profits, data, or goodwill.
                  Our total liability for any claim shall not exceed the amount you paid to Cosello (if any) in the
                  12 months preceding the claim.
                </p>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <RefreshCw className="size-4 text-cyan-400" />
                  10. Modifications & Termination
                </h3>
                <p>
                  Cosello reserves the right to modify, suspend, or discontinue any part of the Platform at any time.
                  We may terminate or suspend your account at our discretion if you violate these terms. Upon termination,
                  your right to use the Platform ceases immediately, but sections regarding liability, disputes, and
                  intellectual property survive termination.
                </p>
              </div>

              <div className="pt-4 border-t border-white/10">
                <p className="text-white/40">
                  If you have questions about these terms, contact us at <span className="text-cyan-400">support@cosello.app</span>.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Settings Page */}
      {page === "settings" && (
        <section className="py-12 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-light tracking-wider mb-8" style={{ fontFamily: "'Courier Prime', monospace" }}>
              Settings
            </h2>

            {/* Display */}
            <div className="mb-8">
              <h3 className="text-xs text-white/40 uppercase tracking-wider mb-3">Display</h3>
              <div className="space-y-1">
                {/* Font Size */}
                <div className="flex items-center justify-between px-4 py-3.5 bg-white/5 border border-white/10 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Type className="size-5 text-cyan-400" />
                    <div>
                      <span className="text-sm">Font Size</span>
                      <p className="text-[10px] text-white/30 mt-0.5">Adjust text size across the app</p>
                    </div>
                  </div>
                  <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
                    {([
                      { value: "default" as const, label: "A", title: "Default" },
                      { value: "large" as const, label: "A", title: "Large" },
                      { value: "extra-large" as const, label: "A", title: "Extra Large" },
                    ]).map((opt, i) => (
                      <button
                        key={opt.value}
                        onClick={() => updateSetting("fontSize", opt.value)}
                        title={opt.title}
                        className={`px-2.5 py-1 rounded-md transition-colors ${
                          settings.fontSize === opt.value
                            ? "bg-cyan-500/20 text-cyan-400"
                            : "text-white/40 hover:text-white/60"
                        }`}
                        style={{ fontSize: `${12 + i * 3}px` }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* High Contrast */}
                <div className="flex items-center justify-between px-4 py-3.5 bg-white/5 border border-white/10 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Contrast className="size-5 text-cyan-400" />
                    <div>
                      <span className="text-sm">High Contrast</span>
                      <p className="text-[10px] text-white/30 mt-0.5">Increase text and border visibility</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSetting("highContrast", !settings.highContrast)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      settings.highContrast ? "bg-cyan-500/30" : "bg-white/10"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                        settings.highContrast ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                {/* Compact Mode */}
                <div className="flex items-center justify-between px-4 py-3.5 bg-white/5 border border-white/10 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Minimize2 className="size-5 text-cyan-400" />
                    <div>
                      <span className="text-sm">Compact Mode</span>
                      <p className="text-[10px] text-white/30 mt-0.5">Reduce spacing for denser layout</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSetting("compactMode", !settings.compactMode)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      settings.compactMode ? "bg-cyan-500/30" : "bg-white/10"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                        settings.compactMode ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Accessibility */}
            <div className="mb-8">
              <h3 className="text-xs text-white/40 uppercase tracking-wider mb-3">Accessibility</h3>
              <div className="space-y-1">
                {/* Reduce Motion */}
                <div className="flex items-center justify-between px-4 py-3.5 bg-white/5 border border-white/10 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Zap className="size-5 text-fuchsia-400" />
                    <div>
                      <span className="text-sm">Reduce Motion</span>
                      <p className="text-[10px] text-white/30 mt-0.5">Disable animations and transitions</p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateSetting("reduceMotion", !settings.reduceMotion)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      settings.reduceMotion ? "bg-fuchsia-500/30" : "bg-white/10"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                        settings.reduceMotion ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* About */}
            <div className="mb-8">
              <h3 className="text-xs text-white/40 uppercase tracking-wider mb-3">About</h3>
              <div className="space-y-1">
                <button
                  onClick={() => setPage("terms")}
                  className="w-full flex items-center justify-between px-4 py-3.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/[0.07] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Scale className="size-5 text-fuchsia-400" />
                    <span className="text-sm">Terms & Conditions</span>
                  </div>
                  <ChevronRight className="size-4 text-white/30" />
                </button>
                <button
                  onClick={() => setPage("mission")}
                  className="w-full flex items-center justify-between px-4 py-3.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/[0.07] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Sparkles className="size-5 text-fuchsia-400" />
                    <span className="text-sm">Our Mission</span>
                  </div>
                  <ChevronRight className="size-4 text-white/30" />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Help & Support Page */}
      {page === "help" && (
        <section className="py-12 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setPage("settings")}
              className="text-sm text-white/40 hover:text-white/60 transition-colors mb-6 flex items-center gap-1"
            >
              <ChevronRight className="size-3 rotate-180" />
              Back to Settings
            </button>

            <div className="flex items-center gap-3 mb-8">
              <HelpCircle className="size-7 text-cyan-400" />
              <h2 className="text-3xl font-light tracking-wider" style={{ fontFamily: "'Courier Prime', monospace" }}>
                Help & Support
              </h2>
            </div>

            {/* Contact */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8">
              <h3 className="text-lg font-medium mb-2">Contact Us</h3>
              <p className="text-sm text-white/60 leading-relaxed">
                Have a question, concern, or feedback? We'd love to hear from you. Reach out to our support team and we'll get back to you as soon as possible.
              </p>
              <div className="mt-4 flex items-center gap-2 bg-white/5 rounded-lg px-4 py-3">
                <MessageSquare className="size-4 text-cyan-400 shrink-0" />
                <span className="text-sm text-cyan-400">support@cosello.app</span>
              </div>
            </div>

            {/* FAQ */}
            <div>
              <h3 className="text-lg font-medium mb-4">Frequently Asked Questions</h3>
              <div className="space-y-3">
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <h4 className="text-sm font-medium text-white/90 mb-2">What is Cosello?</h4>
                  <p className="text-sm text-white/50 leading-relaxed">
                    Cosello is a community-driven second-hand marketplace designed to make buying and selling pre-owned goods safe, fast, and local. We connect neighbors and communities so you can trade with people you trust.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <h4 className="text-sm font-medium text-white/90 mb-2">What is a community?</h4>
                  <p className="text-sm text-white/50 leading-relaxed">
                    A community is a group of users who share a common bond — whether it's a neighborhood, a school, a workplace, or any other group. Communities let you browse and post listings exclusively within your trusted circles. Public communities are open for anyone to join, while private communities require an invite code. Every user also gets a virtual "My Neighborhood" community that automatically connects them with others in the same area.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <h4 className="text-sm font-medium text-white/90 mb-2">How do I post a listing?</h4>
                  <p className="text-sm text-white/50 leading-relaxed">
                    From the homepage, switch to "Sell" mode and upload a photo of your item. Our AI will automatically generate a title, description, price suggestion, and tags. You can edit any of these details, select which communities to post to, and hit "Post Listing" when you're ready.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <h4 className="text-sm font-medium text-white/90 mb-2">How do I join a community?</h4>
                  <p className="text-sm text-white/50 leading-relaxed">
                    Go to your Account page and click the "Join or Create" tile in the Communities section. You can join by entering an invite code shared by a friend, or search for public communities by name. You can also create your own community and invite others.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <h4 className="text-sm font-medium text-white/90 mb-2">Who can see my listings?</h4>
                  <p className="text-sm text-white/50 leading-relaxed">
                    When you post a listing, you choose which communities to post it to. Listings posted to public communities are visible to all users. Listings posted to private communities are only visible to members of those communities. This gives you full control over who sees your items.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <h4 className="text-sm font-medium text-white/90 mb-2">Is it free to use?</h4>
                  <p className="text-sm text-white/50 leading-relaxed">
                    Yes! Cosello is completely free for buyers and sellers. There are no listing fees, no transaction fees, and no hidden charges. Our goal is to make second-hand trading as accessible as possible.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <h4 className="text-sm font-medium text-white/90 mb-2">How do I stay safe when meeting a buyer or seller?</h4>
                  <p className="text-sm text-white/50 leading-relaxed">
                    Always meet in a public, well-lit location. We recommend using your community's designated pickup location when available. Let someone know where you're going, and trust your instincts — if something feels off, don't proceed with the transaction.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Our Mission Page */}
      {page === "mission" && (
        <section className="py-12 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setPage("settings")}
              className="text-sm text-white/40 hover:text-white/60 transition-colors mb-6 flex items-center gap-1"
            >
              <ChevronRight className="size-3 rotate-180" />
              Back to Settings
            </button>

            <div className="flex items-center gap-3 mb-8">
              <Sparkles className="size-7 text-fuchsia-400" />
              <h2 className="text-3xl font-light tracking-wider" style={{ fontFamily: "'Courier Prime', monospace" }}>
                Our Mission
              </h2>
            </div>

            {/* Hero Statement */}
            <div className="bg-gradient-to-br from-fuchsia-500/10 to-cyan-500/10 border border-white/10 rounded-2xl p-8 mb-8 text-center">
              <p className="text-xl font-light leading-relaxed text-white/90" style={{ fontFamily: "'Courier Prime', monospace" }}>
                "To become the safest and fastest second-hand marketplace in the world."
              </p>
            </div>

            <p className="text-sm text-white/60 leading-relaxed mb-8">
              At Cosello, we believe that every item deserves a second life and every community deserves a marketplace it can trust. We're building more than an app — we're building a movement toward more sustainable, connected, and responsible consumption.
            </p>

            {/* Pillars */}
            <h3 className="text-lg font-medium mb-5">What Drives Us</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="size-10 rounded-full bg-green-500/15 flex items-center justify-center mb-3">
                  <Leaf className="size-5 text-green-400" />
                </div>
                <h4 className="text-sm font-medium mb-1.5">Reducing Waste on Our Streets</h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  Every year, millions of perfectly good items end up in landfills or left on sidewalks. We give these items a new home by making it effortless to list, discover, and trade within your neighborhood. Less waste on the streets means cleaner, healthier communities for everyone.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="size-10 rounded-full bg-cyan-500/15 flex items-center justify-center mb-3">
                  <Recycle className="size-5 text-cyan-400" />
                </div>
                <h4 className="text-sm font-medium mb-1.5">Maximizing the Utility of Every Good</h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  A jacket sitting unused in your closet could be keeping someone warm. A textbook you've finished could help another student succeed. We believe every item has unrealized value, and our platform ensures goods are used to their fullest potential before being discarded.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="size-10 rounded-full bg-fuchsia-500/15 flex items-center justify-center mb-3">
                  <Users className="size-5 text-fuchsia-400" />
                </div>
                <h4 className="text-sm font-medium mb-1.5">Bringing Communities Closer</h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  Trading with your neighbors builds trust, sparks conversation, and strengthens the social fabric of your community. Cosello is designed around communities — not algorithms — so every transaction feels personal, local, and meaningful.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="size-10 rounded-full bg-amber-500/15 flex items-center justify-center mb-3">
                  <Heart className="size-5 text-amber-400" />
                </div>
                <h4 className="text-sm font-medium mb-1.5">Reducing Our Carbon Footprint</h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  Every second-hand purchase is one less item manufactured and shipped across the globe. By keeping trade hyper-local — within neighborhoods and communities — we cut down on transportation emissions too. Small trades, big impact.
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center">
              <p className="text-sm text-white/50 leading-relaxed">
                We're just getting started. Every listing posted, every community created, and every item that finds a new home brings us one step closer to a world where nothing goes to waste.
              </p>
              <p className="text-sm text-white/70 mt-3 font-medium">
                Join us in building a better marketplace.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* My Account Page */}
      {page === "account" && isAuthenticated && (
        <Suspense fallback={null}>
          <MyAccountPage onNavigate={(p) => setPage(p as Page)} onCommunitiesChanged={fetchFilterCommunities} wishlistItems={wishlistItems} wishlist={wishlist} onToggleWishlist={(id) => { toggleWishlist(id).then(() => fetchWishlistItems()); }} pendingListingId={pendingListingId} onClearPendingListing={() => setPendingListingId(null)} onAddToHistory={addToHistory} openListingDetail={openListingDetail} onViewUser={openUserDashboard} categorySchemas={categorySchemas} />
        </Suspense>
      )}

      {/* Post Listing Confirmation Modal */}
      <ModalShell
        open={showPostConfirm}
        onClose={() => { setShowPostConfirm(false); setAcceptedTerms(false); }}
        z={50}
      >
          <div className="relative bg-zinc-900 border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <button
              onClick={() => { setShowPostConfirm(false); setAcceptedTerms(false); }}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
                <AlertTriangle className="size-5 text-fuchsia-400" />
              </div>
              <h3 className="text-lg font-medium">Confirm Listing</h3>
            </div>

            <div className="space-y-4 mb-6">
              <p className="text-sm text-white/90 font-semibold">
                By confirming, you agree to make this item available for pickup within 7 days.
              </p>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-white/30 bg-white/5 accent-fuchsia-500 cursor-pointer"
                />
                <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors">
                  I agree to the{" "}
                  <a
                    href="#terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors inline-flex items-center gap-1"
                  >
                    Terms & Conditions
                    <ExternalLink className="size-3" />
                  </a>
                </span>
              </label>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => { setShowPostConfirm(false); setAcceptedTerms(false); }}
                variant="outline"
                className="flex-1 border-white/20 text-white/60 hover:text-white hover:bg-white/5"
              >
                Cancel
              </Button>
              <Button
                disabled={!acceptedTerms}
                onClick={() => {
                  setShowPostConfirm(false);
                  setAcceptedTerms(false);
                  sellWizardRef.current?.postSingleListing();
                }}
                className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm & Post
              </Button>
            </div>
          </div>
      </ModalShell>

      {/* Listing Detail Modal */}
      <ListingDetailModal
        open={showListingDetailModal}
        onClose={() => { setShowListingDetailModal(false); setListingDetailData(null); setListingDetailSellerProfile(null); }}
        listing={listingDetailData}
        isAuthenticated={isAuthenticated}
        currentUserId={user?.id}
        sellerProfile={listingDetailSellerProfile}
        isLoadingSeller={isLoadingListingDetail}
        buyerOrderStatus={buyerOrderStatus}
        categorySchemas={categorySchemas}
        onOpenUserDashboard={openUserDashboard}
        onOpenEdit={() => setShowEditListingModal(true)}
        onOpenBuy={() => { setBuyEditingOrder(null); setShowBuyModal(true); }}
        onEditPickupSlots={() => {
          if (buyerOrderStatus?.order_id && listingDetailData) {
            (async () => {
              try {
                const res = await apiFetch(`/api/orders/status/${listingDetailData.id}`);
                if (res.ok) {
                  const data = await res.json();
                  openEditPickupSlots(listingDetailData, data.order_id, data.selected_pickup_slots || []);
                }
              } catch { /* ignore */ }
            })();
          }
        }}
        onSignInPrompt={() => { setShowListingDetailModal(false); setPage("signin"); }}
      />

      {/* Buy Confirmation Modal */}
      <BuyModal
        open={showBuyModal}
        onClose={() => { setShowBuyModal(false); setBuyEditingOrder(null); }}
        listing={listingDetailData}
        editingOrder={buyEditingOrder}
        onConfirmed={handleBuyConfirmed}
        onUpdated={handleBuyUpdated}
        onNavigateToTerms={() => { setShowBuyModal(false); setPage("terms"); }}
      />

      {/* Edit Listing Modal (from marketplace detail) */}
      {showEditListingModal && listingDetailData && (
        <EditListingModal
          open
          onClose={() => setShowEditListingModal(false)}
          listing={listingDetailData}
          location={user?.neighborhood || listingDetailData.location || ""}
          onSave={handleSaveListingFromMarket}
          categorySchemas={categorySchemas}
          z={260}
        />
      )}

      {/* User Profile Overlay */}
      {viewingUserId && (
        <Suspense fallback={null}>
          <UserProfileOverlay
            userId={viewingUserId}
            onClose={() => setViewingUserId(null)}
            onViewUser={(id) => setViewingUserId(id)}
            openListingDetail={openListingDetail}
          />
        </Suspense>
      )}
    </div>
  );
}
