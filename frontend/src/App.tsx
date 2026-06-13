import { Search, Menu, User, X, Settings, ExternalLink, FileText, Shield, AlertTriangle, Scale, Ban, CreditCard, MessageSquare, MessageCircle, RefreshCw, UserCheck, Eye, LogOut, HelpCircle, Sparkles, Leaf, Users, Recycle, Heart, Bell, Pencil, MapPin, ChevronRight, ImagePlus, ArrowRight } from "lucide-react";
import { Analytics } from "@vercel/analytics/react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ModalShell } from "./components/ui/ModalShell";
import { Tooltip } from "./components/ui/tooltip";

import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useAuth, type AuthUser } from "./contexts/AuthContext";
import { useOrderModals } from "./contexts/OrderModalsContext";
import { FOCUS_RING } from "./pages/MyAccount/constants";
const SignInPage = lazy(() => import("./pages/SignInPage"));
const SignUpPage = lazy(() => import("./pages/SignUpPage"));
const MyAccountPage = lazy(() => import("./pages/MyAccount/MyAccountPage"));
const UserProfileOverlay = lazy(() => import("./pages/UserProfilePage"));
const SellWizard = lazy(() =>
  import("./features/sell-wizard/SellWizard").then((m) => ({ default: m.SellWizard })),
);
import { EditListingModal } from "./components/EditListingModal";
import { ListingImage } from "./components/ui/ListingImage";
import { ListingCardSkeleton } from "./components/ListingCardSkeleton";
import { ListingCard } from "./components/ListingCard";
import { MobileNavMenu } from "./components/MobileNavMenu";
import { DraftsGallery } from "./components/DraftsGallery";
import * as draftStorage from "./lib/draftStorage";
import { MarketplaceSidebar } from "./components/MarketplaceSidebar";
import { NotificationsPanel } from "./features/notifications/NotificationsPanel";
import { BuyModal } from "./features/orders/BuyModal";
import { ListingDetailModal } from "./features/listings/ListingDetailModal";
import type { SellWizardHandle } from "./features/sell-wizard/SellWizard";
import type { ProductDetails, BulkPreview } from "./features/sell-wizard/useSellWizard";
import { TopSearches } from "./components/TopSearches";
import { ConfirmZipBanner } from "./components/ConfirmZipBanner";
import { BulkPreviewAside } from "./components/BulkPreviewAside";
import { ListingChecklist } from "./components/ListingChecklist";
import { LocationCombobox } from "./components/LocationCombobox";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { PLACEHOLDER_COMMUNITY, CONDITIONS, getChipClass } from "./lib/listings";
import { CategoryAttributeFields } from "./components/CategoryFields";
import { useClickOutside } from "./hooks/useClickOutside";
import { useChangeLocation } from "./hooks/useChangeLocation";
import { useNewListingForm } from "./hooks/useNewListingForm";
import { useWishlist } from "./hooks/useWishlist";
import { useMarketplaceBrowse } from "./hooks/useMarketplaceBrowse";
import { useListingDetail } from "./hooks/useListingDetail";
import { useNotifications } from "./hooks/useNotifications";
import { apiFetch } from "./lib/api";
import { setLocationOnProfile } from "./lib/setLocationOnProfile";
import { formatPriceDisplay, isPricePositive } from "./lib/price";
import { logSearch } from "./lib/events";
import { NYC_ZIPS, NYC_ZIP_SET, NEIGHBORHOOD_ZIP, ZIP_NEIGHBORHOOD } from "./lib/nycZips";
import { searchLocations } from "./lib/locationSearch";
import type { CategorySlug, CommunitySummary, CategorySchema, OrderData } from "./lib/types";

type Page = "home" | "market" | "terms" | "signin" | "signup" | "account" | "help" | "mission" | "newlisting";

export default function App() {
  const { isAuthenticated, user, token, needsRegistration, login, logout, updateUser, refreshUser } = useAuth();
  const { openOrderConfirmSummary, openOrderManagement, registerViewUserHandler } = useOrderModals();

  // Temporary token for new users who haven't completed profile yet
  const [pendingSignupToken, setPendingSignupToken] = useState<string | null>(null);
  const [pendingSignupUser, setPendingSignupUser] = useState<AuthUser | null>(null);

  // Return-intent: when a guest hits Publish in the sell wizard they're sent to
  // sign-in. This flag causes onSuccess/onComplete to route back to "newlisting"
  // (where wizard state is still intact) instead of "home"/"account".
  const [pendingSellPublish, setPendingSellPublish] = useState(false);

  const [homeSearch, setHomeSearch] = useState("");
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");

  // Sell wizard — all of its state lives inside <SellWizard>. App.tsx holds a
  // ref so it can invoke the wizard's imperative handlers (post + reset), and
  // tracks the current phase so the home-page hero + nav logo can collapse
  // while the wizard is in a deep step.
  const sellWizardRef = useRef<SellWizardHandle | null>(null);

  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.replace("#", "");
    const validPages: Page[] = ["home", "market", "terms", "signin", "signup", "account", "help", "mission", "newlisting"];
    return validPages.includes(hash as Page) ? (hash as Page) : "home";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Drafts: the Sell page shows the gallery first, then mounts the wizard
  // when the user starts new or taps an existing draft.
  // `pendingDraftId` is non-null when we want the wizard to load a specific
  // draft on mount; "new" means start fresh.
  const [draftRouteState, setDraftRouteState] = useState<
    | { kind: "gallery" }
    | { kind: "new" }
    | { kind: "load"; id: string }
  >({ kind: "gallery" });
  const [draftsRefreshNonce, setDraftsRefreshNonce] = useState(0);
  // Listing-name edit mode. The name reads as a heading by default (with a
  // pencil affordance); tapping it switches to an input. Enter/Escape/blur exit.
  const [isEditingName, setIsEditingName] = useState(false);

  // Bumped each time a nav element wants to land on a specific MyAccount tab.
  // MyAccountPage watches the [tab, nonce] pair so re-clicking the same nav
  // target (e.g. Settings → Settings) still re-applies the tab even when the
  // page is already mounted.
  const [requestedAccountTab, setRequestedAccountTab] = useState<{ tab: "overview" | "listings" | "saved" | "settings"; nonce: number } | null>(null);
  const goToAccountTab = useCallback((tab: "overview" | "listings" | "saved" | "settings") => {
    setRequestedAccountTab({ tab, nonce: Date.now() });
    setPage("account");
  }, []);
  const [showPostConfirm, setShowPostConfirm] = useState(false);

  // Shared handler: guest taps Publish → set return-intent + go to sign-in.
  // Both the manual-publish path (onRequireSignIn) and the AI/bulk publish path
  // (SellWizard's onRequestSignIn) use this so the intent is always set.
  const requestSignInForPublish = useCallback(() => {
    setPendingSellPublish(true);
    setPage("signin");
  }, []);

  const newListing = useNewListingForm({
    sellWizardRef,
    isAuthenticated,
    user,
    page,
    onRequireSignIn: requestSignInForPublish,
    onRequireAiConfirm: () => setShowPostConfirm(true),
  });

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [publicCommunities, setPublicCommunities] = useState<CommunitySummary[]>([]);
  const [privateCommunities, setPrivateCommunities] = useState<CommunitySummary[]>([]);
  const filterCommunities = useMemo(() => [...publicCommunities, ...privateCommunities], [publicCommunities, privateCommunities]);
  // Post To state
  const [postPickupLocation, setPostPickupLocation] = useState("");
  const [categorySchemas, setCategorySchemas] = useState<Record<string, CategorySchema>>({});

  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const market = useMarketplaceBrowse({ page, isAuthenticated, token, isDesktop, userNeighborhood: user?.neighborhood });

  const handleToggleMarketCommunity = useCallback((cid: number) => {
    market.setSelectedCommunities((prev) =>
      prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]
    );
  }, [market.setSelectedCommunities]);
  const handleToggleCategory = useCallback((slug: CategorySlug) => {
    market.setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((c) => c !== slug) : [...prev, slug]
    );
  }, [market.setSelectedCategories]);
  const handleToggleMyListings = useCallback(() => market.setShowMyListings((v) => !v), [market.setShowMyListings]);

  // Wishlist state
  const wishlist = useWishlist(token, page);

  // Profile dropdown state (custom, not Radix)
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Notifications data + server-sync
  const notif = useNotifications({ isAuthenticated, token });

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

  const detail = useListingDetail({
    token,
    user,
    isAuthenticated,
    page,
    addToHistory,
    refetchListings: market.refetch,
    registerViewUserHandler,
  });

  // Quick-change location modal — opened from the Settings icon next to the
  // marketplace location header. Edits zip + neighborhood only; full profile
  // edits still go through MyAccount → Edit Profile.
  const changeLocation = useChangeLocation(user, updateUser);

  // Delegates to setLocationOnProfile (lib/setLocationOnProfile.ts) — the
  // single source of truth for the derive-neighborhood → PUT sequence.
  // Used by the hero-search location suggestion row (authenticated users).
  const [heroLocSaving, setHeroLocSaving] = useState<string | null>(null); // ZIP being saved, or null
  const [heroLocError, setHeroLocError] = useState<string | null>(null);
  const setUserLocation = useCallback(
    async (zip: string): Promise<void> => {
      if (!user) return;
      setHeroLocSaving(zip);
      setHeroLocError(null);
      try {
        const updated = await setLocationOnProfile(zip);
        updateUser(updated);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not save location";
        setHeroLocError(msg);
        throw new Error(msg);
      } finally {
        setHeroLocSaving(null);
      }
    },
    [user, updateUser],
  );

  // marketSentinelRef and its IntersectionObserver live in useMarketplaceBrowse.

  // Close profile dropdown on outside click
  useClickOutside(profileRef, () => setProfileOpen(false), profileOpen);

  const handleNotifClick = useCallback((notificationId: number, type: string, listingId: string | null) => {
    const withListing = ["purchase","order_withdrawn","order_updated","order_confirmed","pickup_ready","review_submitted","address_released","order_completed"].includes(type);
    const noListing = ["order_declined","order_cancelled","order_expired"].includes(type);
    // Order-related notifs clear themselves on click — join_request still
    // requires explicit accept/reject action so we leave it unread.
    // request_accepted is terminal (informational) — clear it on click even
    // though it has no listing_id to route to.
    if (withListing || noListing || type === "request_accepted") {
      notif.markOneRead(notificationId);
    }
    // Confirmation-flow notifications open the OrderConfirmSummary modal in
    // place. The modal's "Confirm pickup" CTA leads into the attestation +
    // rating chain. pickup_ready fires to both buyer and seller after the
    // seller hits "Notify pickup ready", so both sides land in the same
    // summary view. No /account routing needed — the modal surfaces wherever
    // the user happened to be when the notification landed.
    const inPlaceTypes = ["order_confirmed", "pickup_ready", "address_released", "order_completed", "review_submitted"];
    if (inPlaceTypes.includes(type) && listingId) {
      notif.setOpen(false);
      openOrderConfirmSummary(listingId);
      return;
    }
    // Seller-side `purchase` (new pending order on one of your listings) —
    // R-5.7.3 lifts OrderManagementModal to App level, so the click opens
    // the picker IN PLACE. We synthesize a partial MyListing from the
    // /api/orders payload (which carries listing_title/_image/_price) so
    // the modal header has something to render before the order list
    // populates. After-action subscribers (MyAccountPage when mounted)
    // refetch on success; otherwise next mount picks up fresh state.
    if (type === "purchase" && listingId) {
      notif.setOpen(false);
      (async () => {
        try {
          const res = await apiFetch("/api/orders");
          if (!res.ok) return;
          const allOrders: OrderData[] = await res.json();
          const order = allOrders.find((o) => o.listing_id === listingId && o.role === "seller");
          if (!order) return;
          openOrderManagement({
            id: listingId,
            title: order.listing_title,
            description: "",
            price: order.listing_price,
            condition: "",
            location: "",
            tags: [],
            imageUrl: order.listing_image,
            postedAt: 0,
            status: "active",
            brand: "",
            name: order.listing_title,
          });
        } catch {
          // ignore — modal stays closed on failure
        }
      })();
      return;
    }
    // `order_updated` (buyer/seller mutual updates) and other listing-bearing
    // notifs keep their existing /account routing.
    if (withListing && listingId) {
      notif.setOpen(false);
      setPendingListingId(listingId);
      setPage("account");
    } else if (noListing) {
      notif.setOpen(false);
      setPage("account");
    }
  }, [notif.markOneRead, notif.setOpen, openOrderConfirmSummary, openOrderManagement]);

  const handleNotifConfirmPickup = useCallback((listingId: string | null) => {
    notif.setOpen(false);
    // The "Confirm pickup" inline CTA on the address_released notification —
    // route through the same in-place modal flow as a click on the body.
    if (listingId) openOrderConfirmSummary(listingId);
  }, [notif.setOpen, openOrderConfirmSummary]);

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
    market.reset();
    notif.reset();
    wishlist.reset();
    setHistoryItems([]);
    localStorage.removeItem("ge_history");
    setPublicCommunities([]);
    setPrivateCommunities([]);
    market.setSelectedCommunities([]);
    setHomeSearch("");
    market.setSearch("");
    setTradeMode("buy");
    market.setSort("newest");
    sellWizardRef.current?.resetForLogout();
    setPage("home");
  };

  const fetchFilterCommunities = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/communities/mine");
      if (res.ok) {
        const all: { id: number; name: string; neighborhood?: string; is_public: boolean }[] =
          await res.json();
        setPublicCommunities(all.filter((c) => c.is_public));
        setPrivateCommunities(all.filter((c) => !c.is_public));
      }
    } catch (err) {
      console.error("Failed to fetch communities:", err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchFilterCommunities();
    // user?.neighborhood is in deps so the marketplace filter sidebar refreshes
    // after a neighborhood swap (set_user_neighborhood adds/removes membership)
    // without needing an imperative callback from MyAccountPage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, page, user?.neighborhood]);

  useEffect(() => {
    apiFetch("/api/categories")
      .then((res) => res.json())
      .then((data) => setCategorySchemas(data))
      .catch((err) => console.error("Failed to fetch category schemas:", err));
  }, []);

  // fetchListings, infinite-scroll observer, market-fetch effect, and
  // visible-count-reset effect all live in useMarketplaceBrowse.

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

  // /newlisting routing:
  //   - Leaving the page: reset to gallery so the next entry re-evaluates.
  //   - Entering the page: if the user has zero drafts (or is logged out),
  //     skip the gallery and drop them directly into the wizard. Otherwise
  //     show the gallery first.
  //   - Also re-evaluates after a draft is added/deleted (draftsRefreshNonce).
  useEffect(() => {
    if (page !== "newlisting") {
      setDraftRouteState({ kind: "gallery" });
      return;
    }
    if (!user?.id) {
      setDraftRouteState({ kind: "new" });
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await draftStorage.listDrafts(user.id);
      if (cancelled) return;
      // Only override "gallery" — don't yank the user out of an active edit.
      setDraftRouteState((prev) =>
        prev.kind === "gallery" && list.length === 0 ? { kind: "new" } : prev,
      );
    })();
    return () => { cancelled = true; };
  }, [page, user?.id, draftsRefreshNonce]);

  // Redirect to home if user logs out while on a protected page
  useEffect(() => {
    if (!isAuthenticated && page === "account") {
      setPage("home");
    }
    if (!isAuthenticated && page === "signup" && !pendingSignupToken) {
      setPage("home");
    }
  }, [isAuthenticated, page, pendingSignupToken]);

  // If a live session still needs registration, backfill pendingSignupToken
  // from the session token (lost on reload since it only lives in App state)
  // and force the signup page. This prevents a half-registered user from
  // browsing the app as if they were fully signed in.
  useEffect(() => {
    if (!needsRegistration) return;
    if (!pendingSignupToken && token) {
      setPendingSignupToken(token);
    }
    if (page !== "signup") {
      setPage("signup");
    }
  }, [needsRegistration, pendingSignupToken, token, page]);

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

  // Preview card + "Listing checklist" for the New Listing page.
  // Rendered both inside the lg:+ sticky aside and inside the below-lg:
  // floating drawer so the two share a single source of truth.
  //
  // The checklist is ALWAYS the same 6 rows in the same order whenever
  // imageCount > 0. Only the check states change as the user progresses.
  // The preview card changes per mode/step but the checklist is static.
  //
  // Mode selection for the preview card:
  //   newListing.imageCount === 0     → TopSearches (no checklist)
  //   newListing.bulkPreview !== null → BulkPreviewAside card (AI bulk)
  //   else                            → single-item preview card (manual or AI single)
  const newListingPreviewContent = (() => {
    if (newListing.imageCount === 0) {
      return <TopSearches />;
    }

    // Build the static 5-row checklist, mode-aware for fields 2-4.
    const { pickupLocationSet } = newListing.checklistSignals;
    const checklistRows: ReadonlyArray<readonly [string, boolean]> = (() => {
      if (newListing.mode === "manual") {
        // Manual mode: drive rows 2-4 from the page-level form fields.
        const hasBrandOrName = newListing.brand.trim().length > 0 || newListing.name.trim().length > 0;
        const hasPrice = /^[0-9]+$/.test(newListing.price) && Number.parseInt(newListing.price, 10) > 0;
        const hasDescription = newListing.description.trim().length >= 20;
        return [
          ["Photo added", newListing.imageCount > 0],
          ["Brand or name", hasBrandOrName],
          ["Price set", hasPrice],
          ["Description (20+ chars)", hasDescription],
          ["Pickup location", pickupLocationSet],
        ] as const;
      }
      if (newListing.bulkPreview !== null) {
        // AI bulk mode: drive rows 2-4 from the focused bulk preview item.
        const it = newListing.bulkPreview.item;
        const hasBrandOrName = Boolean(it.brand.trim() || it.name.trim());
        const hasPrice = it.price !== null && isPricePositive(it.price);
        const hasDescription = it.description !== null && it.description.trim().length >= 20;
        return [
          ["Photo added", newListing.imageCount > 0],
          ["Brand or name", hasBrandOrName],
          ["Price set", hasPrice],
          ["Description (20+ chars)", hasDescription],
          ["Pickup location", pickupLocationSet],
        ] as const;
      }
      // AI single mode: drive rows 2-4 from aiProductDetails.
      const hasBrandOrName = Boolean(
        newListing.aiProductDetails?.brand?.trim() || newListing.aiProductDetails?.name?.trim(),
      );
      const hasPrice = isPricePositive(newListing.aiProductDetails?.price ?? "");
      const hasDescription = (newListing.aiProductDetails?.description?.trim().length ?? 0) >= 20;
      return [
        ["Photo added", newListing.imageCount > 0],
        ["Brand or name", hasBrandOrName],
        ["Price set", hasPrice],
        ["Description (20+ chars)", hasDescription],
        ["Pickup location", pickupLocationSet],
      ] as const;
    })();

    if (newListing.bulkPreview !== null) {
      return (
        <>
          <BulkPreviewAside
            preview={newListing.bulkPreview}
            onPrev={() => sellWizardRef.current?.setBulkCardIndex(newListing.bulkPreview!.index - 1)}
            onNext={() => sellWizardRef.current?.setBulkCardIndex(newListing.bulkPreview!.index + 1)}
          />
          <ListingChecklist heading="Listing checklist" rows={checklistRows} />
        </>
      );
    }

    // Single-item preview card (manual or AI single mode).
    return (
      <>
        <p className="text-xs font-semibold text-muted">Listing preview</p>
        <article>
          {/* Community byline — above the photo */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span
              aria-hidden="true"
              className="size-5 rounded-full bg-primary shrink-0 inline-flex items-center justify-center text-on-primary text-[9px] font-bold"
            >
              {PLACEHOLDER_COMMUNITY.name.charAt(0).toUpperCase()}
            </span>
            <span className="text-xs font-medium text-body line-clamp-1">{PLACEHOLDER_COMMUNITY.name}</span>
          </div>
          <div className="relative aspect-square bg-surface-soft rounded-lg overflow-hidden">
            {newListing.aiCoverImageUrl ? (
              <img
                src={newListing.aiCoverImageUrl}
                alt="Listing cover preview"
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-soft">
                <ImagePlus className="size-8" aria-hidden="true" />
                <span className="text-[11px]">Photo preview after publish</span>
              </div>
            )}
          </div>
          <div className="pt-2 space-y-0.5">
            <p className="text-sm font-medium text-ink line-clamp-1">
              {(() => {
                if (newListing.mode === "manual") {
                  const brand = newListing.brand.trim();
                  const name = newListing.name.trim();
                  if (brand && name) return `${brand} — ${name}`;
                  return brand || name || "Untitled";
                }
                const brand = newListing.aiProductDetails?.brand?.trim() ?? "";
                const name = newListing.aiProductDetails?.name?.trim() ?? "";
                if (brand && name) return `${brand} — ${name}`;
                return brand || name || "Untitled";
              })()}
            </p>
            <p className="text-xs text-muted line-clamp-1">
              {(() => {
                const location = newListing.mode === "manual"
                  ? (newListing.pickup.trim() || user?.neighborhood || "West Village")
                  : (newListing.aiProductDetails?.location?.trim() || user?.neighborhood || "West Village");
                const condition = newListing.mode === "manual"
                  ? newListing.condition
                  : (newListing.aiProductDetails?.condition?.trim() ?? "");
                return condition ? `${location} · ${condition}` : location;
              })()}
            </p>
            <p className="text-base font-semibold text-ink leading-none pt-0.5">
              {newListing.mode === "manual"
                ? (newListing.price ? `$${newListing.price}` : "$—")
                : formatPriceDisplay(newListing.aiProductDetails?.price ?? "")}
            </p>
          </div>
        </article>

        <ListingChecklist heading="Listing checklist" rows={checklistRows} />
      </>
    );
  })();

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
              <Tooltip content="Coming soon">
                <button
                  type="button"
                  disabled
                  className={`${navLinkClass(false)} opacity-50 cursor-not-allowed`}
                >
                  Communities
                </button>
              </Tooltip>
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

            {/* Right Side — `justify-self-end` keeps the cluster pinned to
                the right edge on mobile, where the hidden md-only center
                col is removed from grid auto-placement and would otherwise
                let the right cluster fall back into the 1fr middle cell. */}
            <div className="flex items-center gap-2 justify-self-end">
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
                      notif.setOpen((prev) => {
                        if (!prev) {
                          notif.fetchNotifications();
                        } else {
                          if (notif.unreadCount > 0) notif.markAllRead();
                        }
                        return !prev;
                      });
                    }}
                    className="relative inline-flex items-center justify-center size-9 rounded-full bg-transparent text-muted hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer"
                  >
                    <Bell className="size-[18px]" />
                    {notif.unreadCount > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1.5 right-2 size-2 rounded-full bg-primary ring-2 ring-canvas"
                      />
                    )}
                  </button>

                  <NotificationsPanel
                    open={notif.open}
                    onClose={() => {
                      notif.setOpen(false);
                      if (notif.unreadCount > 0) notif.markAllRead();
                    }}
                    notifications={notif.notifications}
                    notificationsLoaded={notif.notificationsLoaded}
                    unreadCount={notif.unreadCount}
                    onMarkAllRead={notif.markAllRead}
                    onAction={notif.act}
                    onNotifClick={handleNotifClick}
                    onConfirmPickup={handleNotifConfirmPickup}
                    onOpenUserDashboard={detail.openUserDashboard}
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
                          onClick={() => { setProfileOpen(false); goToAccountTab("settings"); }}
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

              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((prev) => !prev)}
              >
                {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </Button>
            </div>
          </div>
        </div>
      </nav>
      <MobileNavMenu
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        isAuthenticated={isAuthenticated}
        onNavigate={(target) => setPage(target)}
      />

      {/* Sign In Page */}
      {page === "signin" && (
        <Suspense fallback={null}>
          <SignInPage
            onSuccess={(newToken, userExists, newUser) => {
              if (!userExists || !newUser?.display_name || !newUser?.neighborhood) {
                // Don't log in yet — hold token until profile is completed.
                // pendingSellPublish stays set so the signup onComplete can pick
                // it up and route back to newlisting after registration.
                setPendingSignupToken(newToken);
                setPendingSignupUser(newUser);
                setPage("signup");
              } else {
                login(newToken, newUser);
                if (pendingSellPublish) {
                  setPendingSellPublish(false);
                  setPage("newlisting");
                } else {
                  setPage("home");
                }
              }
            }}
            onCancel={() => {
              setPendingSellPublish(false);
              setPage("home");
            }}
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
              if (pendingSellPublish) {
                setPendingSellPublish(false);
                setPage("newlisting");
              } else {
                setPage("account");
              }
            }}
            onCancel={() => {
              // Sign out the Supabase session so the half-registered user
              // does not remain "signed in" with an incomplete profile.
              void logout().then(() => {
                setPendingSignupToken(null);
                setPendingSignupUser(null);
                setPendingSellPublish(false);
                setPage("home");
              });
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
          {draftRouteState.kind === "gallery" ? (
            <DraftsGallery
              userId={user?.id ?? null}
              onSelectDraft={(id) => setDraftRouteState({ kind: "load", id })}
              onStartNew={() => { newListing.setDraftName(""); setDraftRouteState({ kind: "new" }); }}
              refreshNonce={draftsRefreshNonce}
            />
          ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {/* Breadcrumb + title + toolbar */}
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <div className="min-w-0">
                {isEditingName ? (
                  <input
                    type="text"
                    value={newListing.draftName}
                    onChange={(e) => newListing.setDraftName(e.target.value)}
                    onBlur={() => setIsEditingName(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") {
                        e.preventDefault();
                        setIsEditingName(false);
                      }
                    }}
                    placeholder="New listing"
                    maxLength={80}
                    aria-label="Listing name"
                    autoFocus
                    className="w-full bg-transparent border-0 border-b-2 border-primary p-0 pb-0.5 text-3xl font-extrabold tracking-display text-ink leading-[1.05] placeholder:text-muted-soft focus:outline-none focus:ring-0"
                  />
                ) : (
                  <div className="flex items-center gap-3 max-w-full">
                    <h1 className={`min-w-0 truncate text-3xl font-extrabold tracking-display leading-[1.05] ${newListing.draftName ? "text-ink" : "text-muted-soft"}`}>
                      {newListing.draftName || "New listing"}
                    </h1>
                    <button
                      type="button"
                      onClick={() => setIsEditingName(true)}
                      aria-label="Rename listing"
                      className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-border-strong text-muted text-[11.5px] font-bold hover:border-primary hover:text-primary hover:bg-primary-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      <Pencil className="size-3" aria-hidden />
                      Rename
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setDraftRouteState({ kind: "gallery" })}
                  className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border-strong text-sm font-semibold text-ink bg-canvas hover:bg-surface-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  Drafts
                </button>
              </div>
            </div>

            {/* Two-column body */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
              {/* Left — form column */}
              <div className="space-y-6 min-w-0">
                {/* The "Photos" label now lives inside SellWizard, directly above
                    the upload box (below the step progress bar), so the bar no
                    longer separates the label from the box. */}
                <section>
                  {/* SellWizard photo composer renders below via the app-shell
                      mount. In Manual mode it stays as the composer only; in
                      AI mode it expands into the full wizard flow. */}
                  <Suspense fallback={null}>
                  <SellWizard
                    ref={sellWizardRef}
                    categorySchemas={categorySchemas}
                    isActive={true}
                    mode={newListing.mode}
                    photosOnly={newListing.mode === "manual"}
                    publicCommunities={publicCommunities}
                    privateCommunities={privateCommunities}
                    onSwitchToBuy={() => { setTradeMode("buy"); setPage("home"); }}
                    onRequestSignIn={requestSignInForPublish}
                    onPosted={() => {
                      newListing.reset();
                      setPage("market");
                      market.refetch();
                      setDraftsRefreshNonce((n) => n + 1);
                    }}
                    onRequestSinglePostConfirm={() => setShowPostConfirm(true)}
                    onPhaseChange={newListing.setWizardPhase}
                    onImagesChange={newListing.setImageCount}
                    onProductDetailsChange={newListing.setAiProductDetails}
                    onCoverImageChange={newListing.setAiCoverImageUrl}
                    pendingDraftId={draftRouteState.kind === "load" ? draftRouteState.id : null}
                    onDraftLoaded={() => {
                      // Once the wizard loads the draft we don't want to keep
                      // re-triggering it. Park the routing in "new" so the wizard
                      // continues editing the loaded state without further loads.
                      setDraftRouteState({ kind: "new" });
                    }}
                    draftName={newListing.draftName}
                    onDraftNameLoaded={newListing.setDraftName}
                    onPublishedDraft={async (draftId) => {
                      if (draftId) {
                        await draftStorage.deleteDraft(draftId);
                        setDraftsRefreshNonce((n) => n + 1);
                      }
                    }}
                    onBackToDrafts={() => setDraftRouteState({ kind: "gallery" })}
                    onBulkPreviewChange={newListing.setBulkPreview}
                    onChecklistSignalsChange={newListing.setChecklistSignals}
                  />
                  </Suspense>
                </section>

                {/* AI / Manual toggle — only on the upload step (step 1). Hidden
                    once the wizard advances: bulk sets wizardPhase, and the
                    single-item flow sets aiProductDetails (which resets
                    wizardPhase to null), so we check both to hide it uniformly. */}
                {newListing.wizardPhase === null && newListing.aiProductDetails === null && (
                  <div className="bg-primary-soft border border-primary/20 rounded-md p-5">
                    <div role="tablist" aria-label="Listing creation mode" className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={newListing.mode === "ai"}
                        onClick={() => newListing.setMode("ai")}
                        className={`h-10 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                          newListing.mode === "ai"
                            ? "bg-primary text-on-primary"
                            : "bg-transparent text-primary hover:bg-primary/10"
                        }`}
                      >
                        AI Drafted
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={newListing.mode === "manual"}
                        onClick={() => newListing.setMode("manual")}
                        className={`h-10 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                          newListing.mode === "manual"
                            ? "bg-primary text-on-primary"
                            : "bg-transparent text-primary hover:bg-primary/10"
                        }`}
                      >
                        Manual
                      </button>
                    </div>
                    <p className="text-xs text-body mt-3 leading-relaxed">
                      {newListing.mode === "ai"
                        ? "Upload as many items and we'll take care of the rest."
                        : "Fill out the product details, description, and pricing below to publish your listing."}
                    </p>
                  </div>
                )}

                {/* Manual form sections */}
                {newListing.mode === "manual" && (
                  <>
                    <section className="bg-canvas border border-hairline rounded-md p-5 space-y-4">
                      <h3 className="text-xs font-semibold text-muted">Product details</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                          <span className="text-xs text-muted">Brand</span>
                          <Input
                            value={newListing.brand}
                            onChange={(e) => newListing.setBrand(e.target.value)}
                            placeholder="Olivetti, Eames, Le Creuset…"
                            className="mt-1"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-muted">Name / model</span>
                          <Input
                            value={newListing.name}
                            onChange={(e) => newListing.setName(e.target.value)}
                            placeholder="Lettera 32, LCW chair, 5.5qt dutch oven…"
                            className="mt-1"
                          />
                        </label>
                      </div>
                      <div>
                        <span className="text-xs text-muted">Category</span>
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
                            const active = newListing.category === c.slug;
                            return (
                              <button
                                key={c.slug}
                                type="button"
                                onClick={() => {
                                  newListing.setCategory(c.slug);
                                  // Different category → different schema. Drop
                                  // stale attribute values so they don't ship
                                  // alongside fields the new category doesn't have.
                                  newListing.setCategoryAttributes({});
                                }}
                                aria-pressed={active}
                                className={getChipClass(active)}
                              >
                                {c.label}
                              </button>
                            );
                          })}
                        </div>
                        {/* Per-category dynamic fields (size/gender for clothing,
                            carry_difficulty for furniture, etc.). Renders nothing
                            for "other" since its schema has no extra fields. */}
                        {Object.keys(categorySchemas).length > 0 && (
                          <div className="mt-3">
                            <CategoryAttributeFields
                              category={newListing.category}
                              schemas={categorySchemas}
                              attributes={newListing.categoryAttributes}
                              onChange={(key, value) => newListing.setCategoryAttributes((prev) => ({ ...prev, [key]: value }))}
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-xs text-muted">Condition</span>
                        <div role="radiogroup" aria-label="Condition" className="flex flex-wrap gap-2 mt-2">
                          {CONDITIONS.map((c) => {
                            const active = newListing.condition === c;
                            return (
                              <button
                                key={c}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => newListing.setCondition(c)}
                                className={getChipClass(active)}
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
                        <h3 className="text-xs font-semibold text-muted">Description</h3>
                        <span className={`text-xs ${newListing.description.length >= 20 ? "text-primary" : "text-muted"}`}>
                          {newListing.description.length} / 20+ chars
                        </span>
                      </header>
                      <textarea
                        value={newListing.description}
                        onChange={(e) => newListing.setDescription(e.target.value)}
                        rows={5}
                        placeholder="Tell the story. Where you got it, what you used it for, any flaws worth calling out."
                        className="w-full min-h-32 bg-surface-soft border border-hairline rounded-md p-3 text-sm text-ink placeholder:text-muted-soft resize-y focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                      />
                      <div>
                        <span className="text-xs text-muted">Tags</span>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {newListing.tags.map((t) => (
                            <span key={t} className={getChipClass(true)}>
                              {t}
                              <button
                                type="button"
                                aria-label={`Remove ${t}`}
                                onClick={() => newListing.setTags((prev) => prev.filter((x) => x !== t))}
                                className="text-on-primary/80 hover:text-on-primary transition-colors"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                          <input
                            value={newListing.tagInput}
                            onChange={(e) => newListing.setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              const trimmed = newListing.tagInput.trim();
                              if (!trimmed || newListing.tags.includes(trimmed)) return;
                              newListing.setTags((prev) => [...prev, trimmed]);
                              newListing.setTagInput("");
                            }}
                            placeholder={newListing.tags.length ? "Add another…" : "typewriter, 1960s…"}
                            className="flex-1 min-w-32 max-w-xs px-2.5 py-1 rounded-full text-xs bg-canvas border border-border-strong text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>
                      </div>
                    </section>

                    <section className="bg-canvas border border-hairline rounded-md p-5 space-y-4">
                      <header className="flex items-baseline justify-between gap-2">
                        <h3 className="text-xs font-semibold text-muted">Pricing &amp; pickup</h3>
                        {/* Price suggestion is faked for now; real suggestion logic
                            is queued in backlog.md (sell-flow pricing). */}
                        <span className="bg-primary-soft text-primary px-2 py-1 rounded-full text-xs font-medium">
                          Suggested $60 – $120
                        </span>
                      </header>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <span className="text-xs text-muted">Price</span>
                          <div className="flex items-center gap-1 mt-1 border border-border-strong rounded-md bg-canvas focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 px-3 h-12">
                            <span className="text-3xl font-extrabold tracking-display text-ink">$</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={newListing.price}
                              onChange={(e) => newListing.setPrice(e.target.value.replace(/\D/g, ""))}
                              placeholder="0"
                              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-3xl font-extrabold tracking-display text-ink placeholder:text-muted-soft"
                            />
                          </div>
                        </div>
                        <div>
                          <span className="text-xs text-muted">Pickup ZIP</span>
                          <div className="flex items-center gap-2 mt-1">
                            {/* City — read-only */}
                            <div className="flex items-center gap-2 border border-border-strong rounded-md bg-surface-soft px-3 h-12 flex-none">
                              <MapPin className="size-4 text-primary shrink-0" aria-hidden="true" />
                              <span className="text-sm text-muted select-none">New York</span>
                            </div>
                            {/* ZIP select */}
                            <select
                              value={
                                newListing.pickupZip !== ""
                                  ? newListing.pickupZip
                                  : user?.zip_code && NYC_ZIP_SET.has(user.zip_code)
                                    ? user.zip_code
                                    : ""
                              }
                              onChange={(e) => newListing.setPickupZip(e.target.value)}
                              required
                              aria-label="Pickup ZIP code"
                              className="flex-1 h-12 px-3 rounded-md border border-border-strong bg-canvas text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 appearance-none"
                            >
                              <option value="" disabled>Select ZIP</option>
                              {NYC_ZIPS.map(({ zip, neighborhood }) => (
                                <option key={zip} value={zip}>
                                  {zip} — {neighborhood}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-soft leading-relaxed">
                        Your address will not be shared until pickup is confirmed.
                      </p>
                    </section>
                    <button
                      type="button"
                      disabled={
                        newListing.isPublishing ||
                        newListing.imageCount === 0 ||
                        (newListing.pickupZip === "" &&
                          !(user?.zip_code && NYC_ZIP_SET.has(user.zip_code)))
                      }
                      onClick={newListing.publish}
                      className="w-full inline-flex items-center justify-center h-11 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      {newListing.isPublishing ? "Publishing…" : "Publish listing"}
                    </button>
                  </>
                )}
              </div>

              {/* Right — sticky preview column on lg:+ only. Below lg: this
                  block is hidden (the floating overlay drawer below holds
                  the same content). */}
              <aside className="hidden lg:block lg:sticky lg:top-20 self-start space-y-4" aria-label="Listing preview">
                {newListingPreviewContent}
              </aside>
            </div>
            {/* Floating preview toggle + slide-in drawer — below lg: only.
                Drawer slides in from the right with a backdrop; ESC closes
                via the effect above. lg:hidden on both keeps the desktop
                experience untouched. */}
            <button
              ref={newListing.toggleRef}
              type="button"
              onClick={() => newListing.setOverlayOpen(true)}
              aria-label="Show listing preview"
              aria-haspopup="dialog"
              aria-expanded={newListing.overlayOpen}
              className={`lg:hidden fixed bottom-5 right-5 z-30 size-12 rounded-full bg-primary text-on-primary shadow-card hover:bg-primary-hover transition-colors flex items-center justify-center ${FOCUS_RING} ${newListing.overlayOpen ? "hidden" : ""}`}
            >
              <Eye className="size-5" aria-hidden="true" />
            </button>
            {newListing.overlayOpen && (
              <div
                className="lg:hidden fixed inset-0 z-[60]"
                role="dialog"
                aria-modal="true"
                aria-label="Listing preview"
              >
                <button
                  type="button"
                  aria-label="Close preview"
                  tabIndex={-1}
                  onClick={() => newListing.setOverlayOpen(false)}
                  className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
                />
                <div
                  className="absolute inset-y-0 right-0 w-[min(380px,100vw)] bg-canvas border-l border-hairline shadow-overlay h-full overflow-y-auto motion-safe:transition-transform"
                >
                  <div className="sticky top-0 bg-canvas border-b border-hairline px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink">Preview</p>
                    <button
                      ref={newListing.closeRef}
                      type="button"
                      onClick={() => newListing.setOverlayOpen(false)}
                      aria-label="Close preview"
                      className={`inline-flex items-center justify-center size-10 rounded-full border border-hairline bg-canvas text-ink shadow-sm hover:bg-surface-soft active:bg-surface-soft transition-colors ${FOCUS_RING}`}
                    >
                      <X className="size-5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="p-5 space-y-4">
                    {newListingPreviewContent}
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </section>
      )}

      {page === "home" && (
        <section className="min-h-[calc(100vh-64px)] flex items-start justify-center px-4 sm:px-6 lg:px-8 pt-8 pb-16 sm:pt-12 sm:pb-16">
          <div className="w-full max-w-[760px]">
            <div className="mb-8">
              <p className="text-base sm:text-lg leading-relaxed text-muted mb-5">
                {(() => {
                  const d = new Date();
                  const wk = d.toLocaleDateString("en-US", { weekday: "long" });
                  const mo = d.toLocaleDateString("en-US", { month: "long" });
                  return `${wk}, ${d.getDate()} ${mo} ${d.getFullYear()}`;
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
                      market.setSearch(homeSearch);
                      setPage("market");
                      if (query) {
                        const filters: Record<string, unknown> = {};
                        if (market.selectedCategories.length > 0) filters.categories = market.selectedCategories;
                        if (market.selectedCommunities.length > 0) filters.communities = market.selectedCommunities;
                        if (market.sort && market.sort !== "newest") filters.sort = market.sort;
                        logSearch({ query, filters });
                      }
                    }}
                    className="flex items-center gap-2 h-12 sm:h-16 bg-canvas border border-hairline rounded-full pl-4 sm:pl-6 pr-1.5 sm:pr-2 shadow-card"
                  >
                    <Search className="size-[18px] text-muted shrink-0" />
                    <input
                      type="text"
                      value={homeSearch}
                      onChange={(e) => setHomeSearch(e.target.value)}
                      placeholder="Search anything…"
                      className="flex-1 bg-transparent border-0 outline-none text-base text-ink placeholder:text-muted-soft min-w-0"
                    />
                    <button
                      type="submit"
                      aria-label="Search"
                      className="h-9 sm:h-12 px-3 sm:px-6 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors shrink-0 inline-flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      <Search className="size-4 sm:hidden" aria-hidden />
                      <span className="hidden sm:inline">Search</span>
                    </button>
                  </form>

                  {(() => {
                    const locMatches = isAuthenticated && user ? searchLocations(homeSearch) : [];
                    if (locMatches.length > 0) {
                      return (
                        <div className="mt-3 bg-canvas border border-hairline rounded-md shadow-card overflow-hidden">
                          {heroLocError && (
                            <p className="px-3 py-2 text-sm text-error border-b border-hairline">{heroLocError}</p>
                          )}
                          {locMatches.map((entry) => {
                            const isSaving = heroLocSaving === entry.zip;
                            return (
                              <button
                                key={entry.zip}
                                type="button"
                                disabled={heroLocSaving !== null}
                                onClick={async () => {
                                  try {
                                    await setUserLocation(entry.zip);
                                    setHomeSearch("");
                                    setPage("market");
                                  } catch {
                                    // heroLocError is set by setUserLocation; stay on page.
                                  }
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-surface-soft transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                              >
                                <MapPin className="size-4 text-muted shrink-0" aria-hidden />
                                <span>
                                  {isSaving ? (
                                    <span className="text-muted">Saving…</span>
                                  ) : (
                                    <>
                                      <span className="text-muted mr-1">Set location:</span>
                                      <span className="font-semibold text-ink">{entry.zip}</span>
                                      <span className="text-muted"> — {entry.neighborhood}</span>
                                    </>
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    }
                    return (
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
                    );
                  })()}
                </>
              ) : (
                // Homepage Sell tab embeds the drafts gallery so users can
                // resume an in-progress draft directly from home — or start
                // fresh. Both paths route into /newlisting with the
                // appropriate draftRouteState pre-set; the page-change
                // effect respects "load"/"new" kinds and won't override.
                <DraftsGallery
                  userId={user?.id ?? null}
                  onSelectDraft={(id) => {
                    setDraftRouteState({ kind: "load", id });
                    setPage("newlisting");
                  }}
                  onStartNew={() => {
                    setDraftRouteState({ kind: "new" });
                    setPage("newlisting");
                  }}
                  refreshNonce={draftsRefreshNonce}
                />
              )}
            </div>
          </div>
        </section>
      )}


      {page === "market" && isAuthenticated && user && user.zip_confirmed === false && (
        <ConfirmZipBanner
          currentZip={user.zip_code}
          onConfirm={async (zip) => {
            // Keep the neighborhood label in sync with the chosen ZIP: if their
            // current neighborhood already maps to this ZIP, leave it; otherwise
            // adopt the canonical neighborhood that contains the ZIP.
            const keepsCurrent =
              !!user.neighborhood && NEIGHBORHOOD_ZIP[user.neighborhood] === zip;
            const neighborhood = keepsCurrent
              ? user.neighborhood
              : (ZIP_NEIGHBORHOOD[zip] ?? user.neighborhood);
            const res = await apiFetch("/api/auth/profile", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                display_name: user.display_name,
                neighborhood,
                zip_code: zip,
              }),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({ detail: "Could not confirm ZIP" }));
              throw new Error((body as { detail?: string }).detail ?? "Could not confirm ZIP");
            }
            await refreshUser();
          }}
        />
      )}

      {page === "market" && (
        <section className="relative min-h-[calc(100vh-64px)] flex">
          <MarketplaceSidebar
            collapsed={market.sidebarCollapsed}
            onToggleCollapsed={market.toggleSidebar}
            isMobile={!isDesktop}
            marketSearch={market.search}
            onMarketSearchChange={market.setSearch}
            isAuthenticated={isAuthenticated}
            filterCommunities={filterCommunities}
            selectedMarketCommunities={market.selectedCommunities}
            onToggleCommunity={handleToggleMarketCommunity}
            categorySchemas={categorySchemas}
            selectedCategories={market.selectedCategories}
            onToggleCategory={handleToggleCategory}
            distanceMiles={market.distanceMiles}
            onDistanceChange={market.setDistanceMiles}
            showMyListings={market.showMyListings}
            onToggleMyListings={handleToggleMyListings}
          />
          <main className="flex-1 min-w-0 px-6 lg:px-8 pt-14 lg:pt-8 pb-20">
            {/* Header: neighborhood + sort */}
            <header className="flex flex-wrap items-end justify-between gap-4 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-4xl font-extrabold text-ink tracking-display leading-[1.05] truncate">
                    {user?.neighborhood ?? "Marketplace"}
                  </h1>
                  <Tooltip content="Change location">
                    <button
                      type="button"
                      aria-label="Change location"
                      onClick={changeLocation.openModal}
                      className="size-9 rounded-full inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      <Settings className="size-4" />
                    </button>
                  </Tooltip>
                </div>
                <p className="text-sm text-muted mt-1">
                  {user?.zip_code ? `${user.zip_code} · ` : ""}
                  {market.listings.length} {market.listings.length === 1 ? "item" : "items"} near you
                </p>
              </div>
              <div role="tablist" aria-label="Sort by" className="inline-flex items-center p-1 bg-surface-soft border border-hairline rounded-full">
                {([
                  ["recommended", "Recommended"],
                  ["trending", "Trending"],
                  ["newest", "Newest"],
                ] as const).map(([id, label]) => {
                  const active = market.sort === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => market.setSort(id)}
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
            {!market.listingsLoaded && market.listings.length === 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-7">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ListingCardSkeleton key={i} />
                ))}
              </div>
            ) : market.listings.length === 0 ? (
              <div className="text-center text-muted py-12 mt-7">
                {market.search || market.selectedCommunities.length > 0 || market.selectedCategories.length > 0 || market.showMyListings
                  ? "No listings match your filters."
                  : "No listings yet."}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-7">
                  {market.listings.slice(0, market.visibleCount).map((listing, idx) => {
                    const heroCommunity = listing.allCommunities?.find((c) => c.is_mutual)
                      ?? listing.allCommunities?.[0]
                      ?? PLACEHOLDER_COMMUNITY;
                    return (
                      <ListingCard
                        key={listing.id}
                        listing={listing}
                        heroCommunity={heroCommunity}
                        isOwn={isAuthenticated && listing.userId === user?.id}
                        isAuthenticated={isAuthenticated}
                        isWishlisted={wishlist.ids.has(listing.id)}
                        isPulsing={wishlist.isPulsing(listing.id)}
                        priority={idx < 4}
                        animationDelayMs={Math.min(idx, 11) * 30}
                        onOpen={() => detail.openListingDetail(listing, market.search ? "search" : "direct")}
                        onToggleWishlist={() => wishlist.toggle(listing.id)}
                        onPulseEnd={() => wishlist.clearPulse(listing.id)}
                      />
                    );
                  })}
                </div>

                {/* End sentinel — also drives the IntersectionObserver. */}
                <div ref={market.sentinelRef} className="text-center py-8 text-sm text-muted italic">
                  {market.visibleCount < market.listings.length
                    ? "Loading more nearby…"
                    : `You've reached the end · ${market.listings.length} ${market.listings.length === 1 ? "item" : "items"}`}
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
              onClick={() => setPage("home")}
              className="text-sm text-white/40 hover:text-white/60 transition-colors mb-6 flex items-center gap-1"
            >
              <ChevronRight className="size-3 rotate-180" />
              Back
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
                  If you have questions about these terms, contact us at <span className="text-cyan-400">info@cosello.io</span>.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Help & Support Page */}
      {page === "help" && (
        <section className="max-w-3xl mx-auto px-6 py-12">
          <button
            onClick={() => setPage(isAuthenticated ? "account" : "home")}
            className="text-sm text-muted hover:text-ink transition-colors mb-6 inline-flex items-center gap-1"
          >
            <ChevronRight className="size-3 rotate-180" />
            Back
          </button>

          <div className="flex items-center gap-3 mb-8">
            <HelpCircle className="size-7 text-primary" />
            <h1 className="text-3xl font-extrabold tracking-display text-ink leading-[1.05]">Help & Support</h1>
          </div>

          {/* Contact */}
          <div className="bg-canvas border border-hairline rounded-md p-6 mb-6">
            <h2 className="text-lg font-bold text-ink tracking-tight mb-2">Contact us</h2>
            <p className="text-sm text-body leading-relaxed">
              Have a question, concern, or feedback? We'd love to hear from you. Reach out to our support team and we'll get back to you as soon as possible.
            </p>
            <a
              href="mailto:info@cosello.io"
              className="mt-4 inline-flex items-center gap-2 bg-surface-soft border border-hairline rounded-md px-4 py-3 text-sm font-semibold text-primary hover:bg-primary-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <MessageSquare className="size-4 text-primary shrink-0" />
              info@cosello.io
            </a>
          </div>

          {/* FAQ */}
          <div className="bg-canvas border border-hairline rounded-md p-6">
            <h2 className="text-lg font-bold text-ink tracking-tight mb-4">Frequently asked questions</h2>
            <div className="divide-y divide-hairline-soft">
              {[
                {
                  q: "What is Cosello?",
                  a: "Cosello is a community-driven second-hand marketplace designed to make buying and selling pre-owned goods safe, fast, and local. We connect neighbors and communities so you can trade with people you trust.",
                },
                {
                  q: "What is a community?",
                  a: "A community is a group of users who share a common bond — whether it's a neighborhood, a school, a workplace, or any other group. Communities let you browse and post listings exclusively within your trusted circles. Public communities are open for anyone to join, while private communities require an invite code. Every user also gets a virtual “My Neighborhood” community that automatically connects them with others in the same area.",
                },
                {
                  q: "How do I post a listing?",
                  a: "From the homepage, switch to “Sell” mode and upload a photo of your item. Our AI will automatically generate a title, description, price suggestion, and tags. You can edit any of these details, select which communities to post to, and hit “Post listing” when you're ready.",
                },
                {
                  q: "How do I join a community?",
                  a: "Go to your Account page and click the “Join or create” tile in the Communities section. You can join by entering an invite code shared by a friend, or search for public communities by name. You can also create your own community and invite others.",
                },
                {
                  q: "Who can see my listings?",
                  a: "When you post a listing, you choose which communities to post it to. Listings posted to public communities are visible to all users. Listings posted to private communities are only visible to members of those communities. This gives you full control over who sees your items.",
                },
                {
                  q: "Is it free to use?",
                  a: "Yes. Cosello is completely free for buyers and sellers. There are no listing fees, no transaction fees, and no hidden charges. Our goal is to make second-hand trading as accessible as possible.",
                },
                {
                  q: "How do I stay safe when meeting a buyer or seller?",
                  a: "Always meet in a public, well-lit location. We recommend using your community's designated pickup location when available. Let someone know where you're going, and trust your instincts — if something feels off, don't proceed with the transaction.",
                },
              ].map((item) => (
                <div key={item.q} className="py-4 first:pt-0 last:pb-0">
                  <h3 className="text-sm font-semibold text-ink tracking-tight mb-1.5">{item.q}</h3>
                  <p className="text-sm text-body leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Our Mission Page */}
      {page === "mission" && (
        <section className="py-12 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setPage("home")}
              className="text-sm text-white/40 hover:text-white/60 transition-colors mb-6 flex items-center gap-1"
            >
              <ChevronRight className="size-3 rotate-180" />
              Back
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
          <MyAccountPage onNavigate={(p) => setPage(p as Page)} onCommunitiesChanged={fetchFilterCommunities} wishlistItems={wishlist.items} wishlist={wishlist.ids} onToggleWishlist={(id) => { wishlist.toggle(id).then(() => wishlist.refetchItems()); }} pendingListingId={pendingListingId} onClearPendingListing={() => setPendingListingId(null)} onAddToHistory={addToHistory} openListingDetail={detail.openListingDetail} onViewUser={detail.openUserDashboard} categorySchemas={categorySchemas} requestedAccountTab={requestedAccountTab} onClearRequestedAccountTab={() => setRequestedAccountTab(null)} />
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
        open={detail.detailOpen}
        onClose={detail.closeDetail}
        listing={detail.listing}
        isAuthenticated={isAuthenticated}
        currentUserId={user?.id}
        sellerProfile={detail.sellerProfile}
        isLoadingSeller={detail.isLoadingSeller}
        buyerOrderStatus={detail.buyerOrderStatus}
        categorySchemas={categorySchemas}
        onOpenUserDashboard={detail.openUserDashboard}
        onOpenEdit={detail.openEdit}
        onOpenBuy={detail.openBuy}
        onEditPickupSlots={detail.editPickupSlots}
        onSignInPrompt={() => { detail.dismissDetail(); setPage("signin"); }}
      />

      {/* Buy Confirmation Modal */}
      <BuyModal
        open={detail.buyOpen}
        onClose={detail.closeBuy}
        listing={detail.listing}
        editingOrder={detail.buyEditingOrder}
        onConfirmed={detail.onBuyConfirmed}
        onUpdated={detail.onBuyUpdated}
        onNavigateToTerms={() => { detail.dismissBuy(); setPage("terms"); }}
      />

      {/* Edit Listing Modal (from marketplace detail) */}
      {detail.editOpen && detail.listing && (
        <EditListingModal
          open
          onClose={detail.closeEdit}
          listing={detail.listing}
          location={user?.neighborhood || detail.listing.location || ""}
          onSave={detail.saveListingEdit}
          categorySchemas={categorySchemas}
          z={260}
        />
      )}

      {/* User Profile Overlay */}
      {detail.viewingUserId && (
        <Suspense fallback={null}>
          <UserProfileOverlay
            userId={detail.viewingUserId}
            onClose={detail.closeUserDashboard}
            onViewUser={(id) => detail.setViewingUserId(id)}
            openListingDetail={detail.openListingDetail}
          />
        </Suspense>
      )}

      {/* Quick change-location modal — opened from the Settings icon next
          to the marketplace location header. Edits neighborhood + zip only;
          full profile edits live in MyAccount → Edit Profile. */}
      {changeLocation.open && (
        <ModalShell open onClose={changeLocation.close} z={210}>
          <div className="relative bg-canvas border border-hairline rounded-md w-full max-w-sm mx-4 p-6 shadow-overlay">
            <button
              type="button"
              onClick={changeLocation.close}
              aria-label="Close"
              className="absolute top-3 right-3 size-8 rounded-full text-muted hover:text-ink hover:bg-surface-soft inline-flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <X className="size-4" />
            </button>
            <h2 className="text-lg font-extrabold text-ink mb-1">Change location</h2>
            <p className="text-sm text-muted mb-4">
              Updates what you see in the marketplace.
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="cl-zip" className="block text-[11px] font-semibold text-muted mb-1.5">
                  Zip code
                </label>
                <LocationCombobox
                  id="cl-zip"
                  value={changeLocation.zip}
                  onChange={changeLocation.setZip}
                />
                {ZIP_NEIGHBORHOOD[changeLocation.zip] && (
                  <p className="text-[11px] text-muted mt-1.5">
                    Neighborhood: <span className="font-semibold text-ink">{ZIP_NEIGHBORHOOD[changeLocation.zip]}</span>
                  </p>
                )}
              </div>
              {changeLocation.error && (
                <p className="text-sm text-error">{changeLocation.error}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={changeLocation.close}
                className="h-9 px-4 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={changeLocation.submit}
                disabled={changeLocation.isSubmitting || !NYC_ZIP_SET.has(changeLocation.zip)}
                className="h-9 px-4 rounded-md bg-primary hover:bg-primary-hover text-on-primary text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                {changeLocation.isSubmitting ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
      <Analytics />
    </div>
  );
}
