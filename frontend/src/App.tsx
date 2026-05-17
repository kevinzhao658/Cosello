import { TrendingUp, Search, Menu, User, DollarSign, ArrowRight, X, Globe, Settings, ExternalLink, FileText, Shield, AlertTriangle, Scale, Ban, CreditCard, MessageSquare, RefreshCw, UserCheck, Eye, EyeOff, LogOut, HelpCircle, Type, Contrast, Minimize2, Zap, Sparkles, Leaf, Users, Recycle, Heart, Bell, Check, Lock, Pencil, Clock, Package, ShoppingBag, MapPin, ChevronRight } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ModalShell } from "./components/ui/ModalShell";
import { useSettings } from "./contexts/SettingsContext";
import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useAuth, type AuthUser } from "./contexts/AuthContext";
const SignInPage = lazy(() => import("./pages/SignInPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
const MyAccountPage = lazy(() => import("./pages/MyAccount/MyAccountPage"));
const UserProfileOverlay = lazy(() => import("./pages/UserProfilePage"));
import { EditListingModal } from "./components/EditListingModal";
import { MarketplaceSidebar } from "./components/MarketplaceSidebar";
import { NotificationsPanel } from "./features/notifications/NotificationsPanel";
import { BuyModal, type EditingOrderSeed } from "./features/orders/BuyModal";
import { ListingDetailModal, type SellerProfile } from "./features/listings/ListingDetailModal";
import { SellWizard, type SellWizardHandle } from "./features/sell-wizard/SellWizard";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { useClickOutside } from "./hooks/useClickOutside";
import { apiFetch } from "./lib/api";
import { formatTitle } from "./lib/format";
import { logView, logSearch, logInteraction, type ViewSource } from "./lib/events";
import type { CategorySlug, Listing, ListingUpdatePatch, CategorySchema } from "./lib/types";
import type { Notification } from "./lib/notifications";

const SIDEBAR_STORAGE_KEY = "cosello.marketSidebar.collapsed";

type Page = "home" | "market" | "terms" | "settings" | "signin" | "signup" | "account" | "help" | "mission";

function ListingImageCarousel({ images, alt }: { images: string[]; alt: string }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % images.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [images.length]);

  if (images.length <= 1) {
    return (
      <img
        src={images[0]}
        alt={alt}
        className="w-28 h-28 object-cover rounded-lg border border-white/10 shrink-0"
      />
    );
  }

  return (
    <div className="relative w-28 h-28 rounded-lg border border-white/10 shrink-0 overflow-hidden">
      {images.map((url, i) => (
        <img
          key={url}
          src={url}
          alt={`${alt} ${i + 1}`}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ease-in-out"
          style={{ opacity: i === current ? 1 : 0 }}
        />
      ))}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
        {images.map((_, i) => (
          <span
            key={i}
            className={`block size-1.5 rounded-full transition-colors ${i === current ? "bg-white" : "bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, user, token, needsRegistration, login, logout } = useAuth();
  const { settings, updateSetting } = useSettings();

  // Temporary token for new users who haven't completed profile yet
  const [pendingSignupToken, setPendingSignupToken] = useState<string | null>(null);
  const [pendingSignupUser, setPendingSignupUser] = useState<AuthUser | null>(null);

  const [homeSearch, setHomeSearch] = useState("");
  const [displayText, setDisplayText] = useState("");
  const fullText = "COSELLO";
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [currentLetterIndex, setCurrentLetterIndex] = useState(-1);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");

  // Sell wizard — all of its state lives inside <SellWizard>. App.tsx holds a
  // ref so it can invoke the wizard's imperative handlers (post + reset), and
  // tracks the current phase so the home-page hero + nav logo can collapse
  // while the wizard is in a deep step.
  const sellWizardRef = useRef<SellWizardHandle | null>(null);
  const [wizardPhase, setWizardPhase] = useState<"review" | "reason" | "cards" | "pickup" | null>(null);

  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.replace("#", "");
    const validPages: Page[] = ["home", "market", "terms", "settings", "signin", "signup", "account", "help", "mission"];
    return validPages.includes(hash as Page) ? (hash as Page) : "home";
  });
  const [showPostConfirm, setShowPostConfirm] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [marketSearch, setMarketSearch] = useState("");
  const debouncedMarketSearch = useDebouncedValue(marketSearch, 300);
  const [selectedMarketCommunities, setSelectedMarketCommunities] = useState<string[]>([]);
  const [marketSort, setMarketSort] = useState("newest");
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
  const handleClearMarketCommunities = useCallback(() => setSelectedMarketCommunities([]), []);
  const handleToggleCategory = useCallback((slug: CategorySlug) => {
    setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug]
    );
  }, []);
  const handleClearCategories = useCallback(() => setSelectedCategories([]), []);
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
  const [unreadCount, setUnreadCount] = useState(0);

  // Pending listing ID for routing to order management from notification
  const [pendingListingId, setPendingListingId] = useState<string | null>(null);

  // History state
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const [historyItems, setHistoryItems] = useState<{ id: string; title: string; imageUrl: string; price: string; type: "viewed" | "purchased" | "listed" | "sold"; timestamp: number }[]>(() => {
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

  // Close history dropdown on outside click
  useClickOutside(historyRef, () => setHistoryOpen(false), historyOpen);

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
    } catch { /* ignore */ }
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
    setNotifications([]);
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
      }
      return;
    }

    const params = new URLSearchParams();
    if (debouncedMarketSearch) params.set("search", debouncedMarketSearch);
    params.set("sort", marketSort);
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
      }
    } else {
      try {
        const res = await apiFetch(`/api/listings/public?${params}`);
        if (res.ok) setListings(await res.json());
      } catch (err) {
        console.error("Failed to fetch public listings:", err);
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

  const handleNotForMe = (listingId: string) => {
    setListings((prev) => prev.filter((l) => l.id !== listingId));
    logInteraction({ listing_id: listingId, action: "not_interested" });
  };

  useEffect(() => {
    if (page === "market") fetchListings();
  }, [page, debouncedMarketSearch, selectedMarketCommunities, marketSort, selectedCategories, isAuthenticated, showMyListings]);

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

  useEffect(() => {
    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setDisplayText(fullText.slice(0, currentIndex));
        setCurrentLetterIndex(currentIndex - 1);
        currentIndex++;
      } else {
        clearInterval(typingInterval);
        setIsTypingComplete(true);
        setCurrentLetterIndex(-1);
      }
    }, 80);

    return () => clearInterval(typingInterval);
  }, []);

  // If user needs registration and we have a pending token, redirect to signup
  useEffect(() => {
    if (needsRegistration && pendingSignupToken && page !== "signup") {
      setPage("signup");
    }
  }, [needsRegistration, pendingSignupToken]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-950 via-zinc-950 to-cyan-950 text-white">
      {/* Navigation */}
      <nav className="sticky top-0 border-b border-white/10 bg-black/60 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-8">
              <button onClick={() => setPage("home")} className={`flex items-center gap-2 bg-transparent border-none cursor-pointer transition-opacity duration-500 ${(wizardPhase === "review" || wizardPhase === "reason") ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
                <div className="relative">
                  <DollarSign className="size-8 text-fuchsia-400 absolute top-0 left-0" />
                  <DollarSign className="size-8 text-cyan-400 relative" style={{ transform: 'translate(8px, 0)' }} />
                </div>
              </button>

              {/* Desktop Navigation */}
              <div className="hidden md:flex gap-6">
                <button onClick={() => setPage("home")} className={`hover:text-white transition-colors bg-transparent border-none cursor-pointer ${page === "home" ? "text-white" : "text-white/60"}`}>
                  Search
                </button>
                <button onClick={() => setPage("market")} className={`hover:text-white transition-colors bg-transparent border-none cursor-pointer ${page === "market" ? "text-white" : "text-white/60"}`}>
                  Market
                </button>
              </div>
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                {/* History */}
                <div className="relative" ref={historyRef}>
                  <button
                    onClick={() => setHistoryOpen((prev) => !prev)}
                    className="flex items-center justify-center size-9 rounded-full bg-white/5 hover:bg-white/15 transition-colors cursor-pointer border border-white/10"
                  >
                    <Clock className="size-4 text-white/80" />
                  </button>

                  {historyOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-80 rounded-md border border-white/15 shadow-xl overflow-hidden z-[100]" style={{ backgroundColor: '#18181b' }}>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                        <p className="text-xs font-medium">Recent Activity</p>
                        {historyItems.length > 0 && (
                          <button
                            onClick={() => { setHistoryItems([]); localStorage.removeItem("ge_history"); }}
                            className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="max-h-[8.5rem] overflow-y-auto">
                        {historyItems.length === 0 ? (
                          <div className="py-8 text-center">
                            <Clock className="size-5 text-white/15 mx-auto mb-2" />
                            <p className="text-xs text-white/30">No recent activity</p>
                          </div>
                        ) : (
                          historyItems.map((item, i) => (
                            <button
                              key={`${item.id}-${item.type}-${i}`}
                              onClick={() => {
                                setHistoryOpen(false);
                                const listing = listings.find((l) => l.id === item.id);
                                if (listing) openListingDetail(listing);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 border-b border-white/5 hover:bg-white/5 transition-colors text-left"
                            >
                              <img src={item.imageUrl} alt="" className="size-9 rounded-md object-cover border border-white/10 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-white/80 truncate">{item.title}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {item.type === "viewed" && <Eye className="size-2.5 text-white/25" />}
                                  {item.type === "purchased" && <ShoppingBag className="size-2.5 text-green-400/60" />}
                                  {item.type === "listed" && <Package className="size-2.5 text-fuchsia-400/60" />}
                                  {item.type === "sold" && <DollarSign className="size-2.5 text-cyan-400/60" />}
                                  <span className="text-[10px] text-white/25 capitalize">{item.type}</span>
                                  <span className="text-[10px] text-white/15">
                                    {(() => {
                                      const diff = Date.now() - item.timestamp;
                                      const mins = Math.floor(diff / 60000);
                                      if (mins < 1) return "just now";
                                      if (mins < 60) return `${mins}m ago`;
                                      const hrs = Math.floor(mins / 60);
                                      if (hrs < 24) return `${hrs}h ago`;
                                      return `${Math.floor(hrs / 24)}d ago`;
                                    })()}
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs text-fuchsia-400 shrink-0">${item.price}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Notifications Bell */}
                <div className="relative">
                  <button
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
                    className="flex items-center justify-center size-9 rounded-full bg-white/5 hover:bg-white/15 transition-colors cursor-pointer border border-white/10 relative"
                  >
                    <Bell className="size-4 text-white/80" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 size-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>

                  <NotificationsPanel
                    open={notificationsOpen}
                    onClose={() => {
                      setNotificationsOpen(false);
                      if (unreadCount > 0) handleMarkAllRead();
                    }}
                    notifications={notifications}
                    unreadCount={unreadCount}
                    onMarkAllRead={handleMarkAllRead}
                    onAction={handleNotificationAction}
                    onNotifClick={handleNotifClick}
                    onConfirmPickup={handleNotifConfirmPickup}
                    onOpenUserDashboard={openUserDashboard}
                  />
                </div>

                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen((prev) => !prev)}
                    className="flex items-center justify-center size-9 rounded-full bg-white/5 hover:bg-white/15 transition-colors cursor-pointer border border-white/10 overflow-hidden"
                  >
                    {user?.profile_picture ? (
                      <img src={user.profile_picture} alt="" className="size-full object-cover" />
                    ) : (
                      <User className="size-4 text-white/80" />
                    )}
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-44 rounded-md border border-white/15 shadow-xl overflow-hidden z-50" style={{ backgroundColor: '#18181b' }}>
                      {user?.display_name && (
                        <div className="px-3 py-2 border-b border-white/10">
                          <p className="text-xs font-medium truncate">{user.display_name}</p>
                          <p className="text-[11px] text-white/40 truncate">{user.neighborhood}</p>
                        </div>
                      )}

                      <div className="py-0.5">
                        <button
                          onClick={() => { setProfileOpen(false); setPage("account"); }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors text-left"
                        >
                          <User className="size-3.5" />
                          My Account
                        </button>
                        <button
                          onClick={() => { setProfileOpen(false); setPage("settings"); }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors text-left"
                        >
                          <Settings className="size-3.5" />
                          Settings
                        </button>
                        <button
                          onClick={() => { setProfileOpen(false); setPage("help"); }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors text-left"
                        >
                          <HelpCircle className="size-3.5" />
                          Help & Support
                        </button>
                      </div>

                      <div className="border-t border-white/10 py-0.5">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-white/10 hover:text-red-300 transition-colors text-left"
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
                  className="bg-white/5 border-white/20 text-white hover:bg-white/10 text-sm"
                >
                  Log In
                </Button>
              )}

              <Button variant="ghost" size="icon" className="md:hidden text-white/60 hover:text-white">
                <Menu className="size-5" />
              </Button>
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

      {page === "home" && (
        <>
      {/* Hero Section */}
      <section className="min-h-[calc(100vh-64px)] flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-7xl mx-auto w-full">
          <div className={`text-center transition-all duration-300 overflow-hidden ${(wizardPhase === "review" || wizardPhase === "reason" || wizardPhase === "cards" || wizardPhase === "pickup") ? "max-h-0 mb-0 opacity-0" : "max-h-64 mb-12 opacity-100"}`}>
            <h2 className="text-6xl sm:text-7xl mb-12 font-light tracking-widest inline-flex items-center justify-center" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {displayText.split('').map((letter, index) => (
                <span
                  key={index}
                  className={`${index === currentLetterIndex ? 'animate-letter-flash' : ''}${letter === ' ' ? ' inline-block w-4 sm:w-6' : ''}`}
                >
                  {letter === ' ' ? '\u00A0' : letter}
                </span>
              ))}
              <span className={`inline-block w-1 h-16 sm:h-20 ml-2 ${isTypingComplete ? 'animate-cursor' : 'opacity-100 bg-cyan-400'}`}></span>
            </h2>
          </div>

          {/* Search Bar / Sell Upload */}
          <div className="max-w-4xl mx-auto">
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
                    className="relative flex items-center gap-2 mb-2"
                  >
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/40 size-5" />
                      <Input
                        type="text"
                        value={homeSearch}
                        onChange={(e) => {
                          const next = e.target.value;
                          setHomeSearch(next);
                          // Mirror to marketSearch + jump to market so the debounced
                          // /api/listings?search=... fetch fires as the user types,
                          // matching the market sidebar's behavior.
                          setMarketSearch(next);
                          if (next.length > 0) setPage("market");
                        }}
                        placeholder="Search for items..."
                        className="w-full pl-12 pr-4 py-6 text-lg bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-cyan-400"
                      />
                    </div>

                    {/* Buy/Sell Toggle */}
                    <div className="flex bg-white/5 border border-white/20 rounded-lg overflow-hidden">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setTradeMode("buy")}
                        className="h-[52px] px-4 rounded-none text-sm bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                      >
                        Buy
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setTradeMode("sell")}
                        className="h-[52px] px-4 rounded-none text-sm text-white/60 hover:text-white hover:bg-white/5"
                      >
                        Sell
                      </Button>
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      size="icon"
                      className="h-[52px] w-[52px] bg-cyan-500 hover:bg-cyan-600 text-white border-0"
                    >
                      <ArrowRight className="size-5" />
                    </Button>
                  </form>

                  {/* Community Filter Chips — mirrors market page */}
                  {isAuthenticated && filterCommunities.length > 0 && (
                    <div className="flex items-center justify-center gap-2 flex-wrap mb-2">
                      {filterCommunities.map((community) => {
                        const cid = String(community.id);
                        const isSelected = selectedMarketCommunities.includes(cid);
                        return (
                          <button
                            key={cid}
                            onClick={() =>
                              setSelectedMarketCommunities((prev) =>
                                isSelected ? prev.filter((x) => x !== cid) : [...prev, cid]
                              )
                            }
                            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all ${
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
                          onClick={() => setSelectedMarketCommunities([])}
                          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border border-white/10 text-white/30 hover:text-white/50 hover:bg-white/5 transition-all"
                        >
                          <X className="size-3" />
                          Clear
                        </button>
                      )}
                    </div>
                  )}

                  <p className="text-sm text-white/60 text-center">
                    Buying • {selectedMarketCommunities.length === 0
                      ? "All"
                      : filterCommunities
                          .filter((c) => selectedMarketCommunities.includes(String(c.id)))
                          .map((c) => c.name)
                          .join(", ")}
                  </p>
                </>
              ) : null}
              {/*
                SellWizard is always mounted (not gated on tradeMode) so its
                internal state — uploadedImages, segmentation, etc. — survives
                a buy/sell toggle. The wizard returns null when isActive is
                false; on switch-back-to-sell its state is intact.
              */}
              <SellWizard
                ref={sellWizardRef}
                categorySchemas={categorySchemas}
                isActive={tradeMode === "sell"}
                onSwitchToBuy={() => setTradeMode("buy")}
                onRequestSignIn={() => setPage("signin")}
                onPosted={() => { setTradeMode("buy"); setPage("market"); fetchListings(); }}
                onRequestSinglePostConfirm={() => setShowPostConfirm(true)}
                onPhaseChange={setWizardPhase}
              />
            </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent mb-2">1.2M+</div>
              <div className="text-white/60">Active Traders</div>
            </div>
            <div className="text-center">
              <div className="text-4xl bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent mb-2">5.8M+</div>
              <div className="text-white/60">Items Listed</div>
            </div>
            <div className="text-center">
              <div className="text-4xl bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent mb-2">$2.4B+</div>
              <div className="text-white/60">Total Trading Volume</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-3xl text-center mb-12">Why Choose Cosello?</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white/5 p-8 rounded-lg border border-white/10 backdrop-blur-sm">
              <div className="size-12 bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="size-6 text-cyan-400" />
              </div>
              <h4 className="text-xl mb-3">Instant Trading</h4>
              <p className="text-white/60">
                Buy and sell items instantly with our automated matching system. No waiting required.
              </p>
            </div>

            <div className="bg-white/5 p-8 rounded-lg border border-white/10 backdrop-blur-sm">
              <div className="size-12 bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="size-6 text-fuchsia-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h4 className="text-xl mb-3">Secure Transactions</h4>
              <p className="text-white/60">
                Your items and payments are protected with bank-level security and escrow services.
              </p>
            </div>

            <div className="bg-white/5 p-8 rounded-lg border border-white/10 backdrop-blur-sm">
              <div className="size-12 bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="size-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h4 className="text-xl mb-3">Real-Time Prices</h4>
              <p className="text-white/60">
                Get accurate market data and price history to make informed trading decisions.
              </p>
            </div>
          </div>
        </div>
      </section>
        </>
      )}

      {page === "market" && (
        <section
          className={`relative min-h-[calc(100vh-64px)] transition-[padding] duration-300 ease-out ${
            isDesktop && !marketSidebarCollapsed ? "lg:pl-72" : ""
          }`}
        >
          <MarketplaceSidebar
            collapsed={marketSidebarCollapsed}
            onToggleCollapsed={toggleMarketSidebar}
            isMobile={!isDesktop}
            marketSearch={marketSearch}
            onMarketSearchChange={setMarketSearch}
            marketSort={marketSort}
            onMarketSortChange={setMarketSort}
            isAuthenticated={isAuthenticated}
            filterCommunities={filterCommunities}
            selectedMarketCommunities={selectedMarketCommunities}
            onToggleCommunity={handleToggleMarketCommunity}
            onClearCommunities={handleClearMarketCommunities}
            categorySchemas={categorySchemas}
            selectedCategories={selectedCategories}
            onToggleCategory={handleToggleCategory}
            onClearCategories={handleClearCategories}
            showMyListings={showMyListings}
            onToggleMyListings={handleToggleMyListings}
          />
          <div className="py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">

            {/* Listings */}
            {listings.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-white/40 text-lg">{marketSearch || selectedMarketCommunities.length > 0 ? "No matching listings" : "No listings yet"}</p>
                {!marketSearch && selectedMarketCommunities.length === 0 && (
                  <Button
                    onClick={() => { setPage("home"); setTradeMode("sell"); }}
                    className="mt-4 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0"
                  >
                    Create your first listing
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {listings.map((listing) => (
                  <div
                    key={listing.id}
                    className="relative flex gap-5 p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/[0.07] transition-colors cursor-pointer"
                    onClick={() => openListingDetail(listing, marketSearch ? "search" : "direct")}
                  >
                    {isAuthenticated && listing.userId !== user?.id && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleNotForMe(listing.id); }}
                          aria-label="Not for me"
                          title="Not for me"
                          className="absolute top-3 right-11 p-1.5 rounded-full hover:bg-white/10 transition-colors z-10"
                        >
                          <EyeOff className="size-4 text-white/30 hover:text-white/50" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleWishlist(listing.id); }}
                          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors z-10"
                        >
                          <Heart
                            className={`size-4 ${wishlist.has(listing.id) ? "text-red-400 fill-red-400" : "text-white/30 hover:text-white/50"}`}
                          />
                        </button>
                      </>
                    )}
                    <ListingImageCarousel
                      images={listing.imageUrls && listing.imageUrls.length > 0 ? listing.imageUrls : [listing.imageUrl]}
                      alt={formatTitle(listing.brand, listing.name)}
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium truncate pr-10">{formatTitle(listing.brand, listing.name)}</h3>
                      <div className="flex items-center gap-3 mt-1.5 text-sm text-white/50">
                        <span className="px-2 py-0.5 rounded bg-white/10 text-xs">{listing.condition}</span>
                        {listing.status === "sold" && <span className="px-2 py-0.5 rounded bg-white/10 text-xs text-white/40">Sold</span>}
                      </div>
                      {/* Key category attributes — brand is now top-level on the
                          listing, so for non-collectibles we show only the
                          remaining category-specific attribute. brand_or_creator
                          is still a category attribute on collectibles only. */}
                      {(() => {
                        const attrs = listing.categoryAttributes || {};
                        const cat = listing.category || "other";
                        const display: string[] = [];
                        if (cat === "clothing") {
                          if (attrs.size) display.push(attrs.size);
                        } else if (cat === "furniture") {
                          if (attrs.carry_difficulty) display.push(attrs.carry_difficulty);
                        } else if (cat === "collectibles") {
                          if (attrs.brand_or_creator) display.push(attrs.brand_or_creator);
                          if (attrs.year) display.push(attrs.year);
                        }
                        if (display.length === 0) return null;
                        return (
                          <div className="flex items-center gap-1.5 mt-1">
                            {display.map((d, i) => (
                              <span key={i} className="text-xs text-white/50">{d}{i < display.length - 1 ? " \u00b7 " : ""}</span>
                            ))}
                          </div>
                        );
                      })()}
                      {/* Seller */}
                      {listing.seller_name && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="size-5 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                            {listing.seller_picture ? (
                              <img src={listing.seller_picture} alt="" className="size-full object-cover" />
                            ) : (
                              <User className="size-2.5 text-white/50" />
                            )}
                          </div>
                          <span className="text-xs text-white/50">{listing.seller_name}</span>
                        </div>
                      )}
                      {/* Community tags */}
                      {listing.allCommunities && listing.allCommunities.length > 0 && (() => {
                        const neighborhood = listing.allCommunities!.find((c) => c.is_neighborhood);
                        const others = listing.allCommunities!.filter((c) => !c.is_neighborhood);
                        return (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {neighborhood && (
                              <span className={`px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1 border ${
                                neighborhood.is_mutual
                                  ? "bg-white/10 border-white/25 text-white"
                                  : "bg-white/5 border-white/10 text-white/30"
                              }`}>
                                <MapPin className="size-2.5" />{neighborhood.name}
                              </span>
                            )}
                            {neighborhood && others.length > 0 && (
                              <span className="text-white/15 text-xs">|</span>
                            )}
                            {others.map((c, i) => (
                              <span key={i} className={`px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1 border ${
                                c.is_mutual
                                  ? "bg-fuchsia-500/10 border-fuchsia-400/20 text-fuchsia-300"
                                  : "bg-white/5 border-white/10 text-white/30"
                              }`}>
                                {c.is_public ? <Globe className="size-2.5" /> : <Lock className="size-2.5" />}{c.name}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col items-center justify-center gap-1.5 shrink-0 mr-6">
                      <span className="text-lg font-semibold text-fuchsia-400">${listing.price}</span>
                      {((!isAuthenticated) || (isAuthenticated && listing.userId !== user?.id)) && listing.status !== "sold" && (() => {
                        const orderInfo = myOrderStatuses[listing.id];
                        if (orderInfo?.status === "pending") {
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Fetch existing slots then open edit modal
                                (async () => {
                                  try {
                                    const res = await apiFetch(`/api/orders/status/${listing.id}`);
                                    if (res.ok) {
                                      const data = await res.json();
                                      openEditPickupSlots(listing, data.order_id, data.selected_pickup_slots || []);
                                    }
                                  } catch { /* ignore */ }
                                })();
                              }}
                              className="text-xs text-amber-400 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/25 rounded-full px-5 py-1 transition-colors"
                            >
                              Pending
                            </button>
                          );
                        }
                        if (orderInfo?.status === "declined") {
                          return (
                            <span className="text-xs text-red-400/70 bg-red-500/10 border border-red-400/15 rounded-full px-5 py-1">
                              Declined
                            </span>
                          );
                        }
                        if (orderInfo?.status === "confirmed") {
                          return (
                            <span className="text-xs text-green-400 bg-green-500/10 border border-green-400/15 rounded-full px-5 py-1">
                              Confirmed
                            </span>
                          );
                        }
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isAuthenticated) { setPage("signin"); return; }
                              setListingDetailData(listing);
                              setBuyEditingOrder(null);
                              setShowBuyModal(true);
                            }}
                            className="text-xs text-cyan-300 hover:text-white bg-cyan-500/15 hover:bg-cyan-500/30 border border-cyan-400/25 rounded-full px-5 py-1 transition-colors"
                          >
                            Buy
                          </button>
                        );
                      })()}
                      {isAuthenticated && listing.userId === user?.id && listing.status !== "sold" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openListingDetail(listing); setTimeout(() => setShowEditListingModal(true), 100); }}
                          className="inline-flex items-center gap-1 text-xs text-fuchsia-300 hover:text-white bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border border-fuchsia-400/30 rounded-full px-4 py-1 transition-colors"
                        >
                          <Pencil className="size-2.5" />
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
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
