import { useState, useRef, useEffect, useCallback, useMemo, type ComponentType } from "react";
import { Input } from "../../components/ui/input";
import { ModalShell } from "../../components/ui/ModalShell";
import { Tooltip } from "../../components/ui/tooltip";
import {
  User,
  Plus,
  MapPin,
  X,
  Loader2,
  Copy,
  Check,
  Lock,
  Unlock,
  Send,
  MessageSquare,
  CalendarCheck,
  Coins,
  Pencil,
  LogOut,
  AlertTriangle,
  Users,
  UserPlus,
  RotateCcw,
  Star,
  ChevronDown,
  Trash2,
  Globe,
  ChevronRight,
  ImagePlus,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSettings, type Settings } from "../../contexts/SettingsContext";
import { formatTitle } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { useClickOutside } from "../../hooks/useClickOutside";
import { buildSlotTarget, parseSlotEndHour } from "../../lib/pickupTime";
import { apiFetch } from "../../lib/api";
import type { CategorySchema, Listing, ListingUpdatePatch, MyListing, OrderData } from "../../lib/types";
import { getChipClass, PLACEHOLDER_COMMUNITY } from "../../lib/listings";
import { FOCUS_RING, SEG_BTN_BASE, PANEL_TITLE, MODAL_TITLE } from "./constants";
import { EditListingModal } from "../../components/EditListingModal";
import { ListingImage } from "../../components/ui/ListingImage";
import { useNeighborhoods } from "../../lib/useNeighborhoods";
import {
  getBuyerOrderViewState,
  getPickupCountdown,
  getSellerListingCtaState,
} from "../../lib/orderStatus";
import { useOrderModals } from "../../contexts/OrderModalsContext";
import { FriendsListModal } from "./modals/FriendsListModal";
import { JoinCommunityModal } from "./modals/JoinCommunityModal";
import { CreateCommunityModal } from "./modals/CreateCommunityModal";
import { ShareCommunityModal } from "./modals/ShareCommunityModal";
import { EditProfileModal } from "./modals/EditProfileModal";
import { AddFriendsModal } from "./modals/AddFriendsModal";
import { RemoveListingConfirmModal } from "./modals/RemoveListingConfirmModal";
import { CircleSettings } from "./CircleSettings";
import { Skeleton } from "../../components/ui/Skeleton";
import { ListingRowSkeleton } from "../../components/ListingRowSkeleton";
import { ListingCardSkeleton } from "../../components/ListingCardSkeleton";
import { KpiCardSkeleton } from "../../components/KpiCardSkeleton";
import { PunchlistRowSkeleton } from "../../components/PunchlistRowSkeleton";

interface CommunityData {
  id: number;
  name: string;
  description: string | null;
  neighborhood: string | null;
  pickup_address: string | null;
  zip_code: string | null;
  image: string | null;
  is_public: boolean;
  invite_code: string;
  created_by: string;
  member_count: number;
  role: string | null;
}

interface SearchUser {
  id: string;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
}

interface FriendSearchUser {
  id: string;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
  is_friend: boolean;
  mutual_friends_count: number;
  shared_communities_count: number;
}

interface ProfileStats {
  total_listings: number;
  purchases: number;
  friends_count: number;
  avg_seller_rating: number;
  avg_buyer_rating: number;
}

interface WishlistFolder {
  id: number;
  name: string;
  item_count: number;
}

interface WishlistListingWithFolder extends Listing {
  folder_id?: number | null;
}

interface PunchlistPickup {
  order_id: number;
  listing_id: string;
  listing_title: string;
  listing_image: string | null;
  slot: string | null;
  role: "seller" | "buyer";
  pickup_expired: boolean;
  countdown_label: string;
}

interface PunchlistResponse {
  pickups_to_confirm: PunchlistPickup[];
  offers_to_review: MyListing[];
  unread_messages: unknown[];
  draft_listings: MyListing[];
}

type AccountTab = "overview" | "listings" | "saved" | "settings";

const ACCOUNT_TAB_STORAGE_KEY = "myaccount_tab";

interface MyAccountPageProps {
  onNavigate: (page: string) => void;
  onCommunitiesChanged?: () => void;
  wishlistItems?: Listing[];
  wishlist?: Set<string>;
  onToggleWishlist?: (listingId: string) => void;
  pendingListingId?: string | null;
  onClearPendingListing?: () => void;
  onAddToHistory?: (item: { id: string; title: string; imageUrl: string; price: string; type: "viewed" | "purchased" | "listed" | "sold" }) => void;
  openListingDetail?: (listing: Listing) => void;
  onViewUser?: (userId: string) => void;
  categorySchemas?: Record<string, CategorySchema>;
  // Cross-page tab requests (e.g. Settings dropdown from global nav). The nonce
  // forces re-application even when the page is already mounted and the
  // requested tab matches the current tab.
  requestedAccountTab?: { tab: AccountTab; nonce: number } | null;
  onClearRequestedAccountTab?: () => void;
}

export default function MyAccountPage({ onNavigate, onCommunitiesChanged, wishlistItems = [], onToggleWishlist, pendingListingId, onClearPendingListing, onAddToHistory, openListingDetail, onViewUser, categorySchemas, requestedAccountTab, onClearRequestedAccountTab }: MyAccountPageProps) {
  const { user, token, updateUser, logout } = useAuth();
  const { settings, updateSetting, resetSettings } = useSettings();

  const { list: neighborhoodsList, isLoading: isLoadingNeighborhoodsList, error: neighborhoodsListError } = useNeighborhoods();
  const neighborhoods = neighborhoodsList ?? [];

  // ── Tab state (persisted) ──────────────────────────────
  const [accountTab, setAccountTab] = useState<AccountTab>(() => {
    try {
      const stored = localStorage.getItem(ACCOUNT_TAB_STORAGE_KEY);
      if (stored === "overview" || stored === "listings" || stored === "saved" || stored === "settings") {
        return stored;
      }
    } catch {
      // ignore
    }
    return "overview";
  });
  useEffect(() => {
    try {
      localStorage.setItem(ACCOUNT_TAB_STORAGE_KEY, accountTab);
    } catch {
      // ignore
    }
  }, [accountTab]);
  // Honor cross-page tab requests (e.g. Settings dropdown). Depend on the
  // nonce so the same tab can be re-requested when the page is already mounted.
  useEffect(() => {
    if (!requestedAccountTab) return;
    setAccountTab(requestedAccountTab.tab);
    onClearRequestedAccountTab?.();
  }, [requestedAccountTab, onClearRequestedAccountTab]);

  // ── Community / friend modals ──────────────────────────
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [communitiesLoaded, setCommunitiesLoaded] = useState(false);
  const [copiedConfirm, setCopiedConfirm] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createNeighborhood, setCreateNeighborhood] = useState("");
  const [createPickupAddress, setCreatePickupAddress] = useState("");
  const [createZipCode, setCreateZipCode] = useState("");
  const [createShowLocationSuggestions, setCreateShowLocationSuggestions] = useState(false);
  const [createIsPublic, setCreateIsPublic] = useState(true);
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [createImagePreview, setCreateImagePreview] = useState<string | null>(null);
  const createImageRef = useRef<HTMLInputElement>(null);
  const createLocationRef = useRef<HTMLInputElement>(null);
  const createLocationSuggestionsRef = useRef<HTMLDivElement>(null);

  const [createdCommunity, setCreatedCommunity] = useState<CommunityData | null>(null);

  const [friendSearch, setFriendSearch] = useState("");
  const [friendResults, setFriendResults] = useState<SearchUser[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<SearchUser[]>([]);
  const [isSearching] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  // Edit Profile modal
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPickupAddress, setEditPickupAddress] = useState("");
  const [editNeighborhood, setEditNeighborhood] = useState("");
  const [editZipCode, setEditZipCode] = useState("");
  const [editShowSuggestions, setEditShowSuggestions] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [editProfileError, setEditProfileError] = useState("");
  const [showNeighborhoodChangeConfirm, setShowNeighborhoodChangeConfirm] = useState(false);
  const editSuggestionsRef = useRef<HTMLDivElement>(null);
  const editNeighborhoodRef = useRef<HTMLInputElement>(null);

  // Add Friends modal
  const [showAddFriendsModal, setShowAddFriendsModal] = useState(false);
  const [addFriendsTab, setAddFriendsTab] = useState<"recommended" | "contacts" | "qr">("recommended");
  const [addFriendsSearch, setAddFriendsSearch] = useState("");
  const [addFriendsResults, setAddFriendsResults] = useState<FriendSearchUser[]>([]);
  const [recommendedFriends, setRecommendedFriends] = useState<FriendSearchUser[]>([]);
  const [isAddFriendsSearching, setIsAddFriendsSearching] = useState(false);
  const [isLoadingRecommended, setIsLoadingRecommended] = useState(false);
  const [addingFriendId, setAddingFriendId] = useState<string | null>(null);
  const addFriendsSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Community search state
  const [communitySearch, setCommunitySearch] = useState("");
  const [communitySearchResults, setCommunitySearchResults] = useState<{
    id: number;
    name: string;
    description: string | null;
    neighborhood: string | null;
    image: string | null;
    invite_code: string;
    member_count: number;
    is_member: boolean;
    is_public: boolean;
    has_requested: boolean;
  }[]>([]);
  const [requestingCommunityId, setRequestingCommunityId] = useState<number | null>(null);
  const [isSearchingCommunities, setIsSearchingCommunities] = useState(false);
  const [joiningCommunityId, setJoiningCommunityId] = useState<number | null>(null);
  const communitySearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsList, setFriendsList] = useState<FriendSearchUser[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);

  // Community detail
  const [showCommunityDetail, setShowCommunityDetail] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<CommunityData | null>(null);
  const [communityMembers, setCommunityMembers] = useState<{ id: string; display_name: string | null; neighborhood: string | null; profile_picture: string | null; role: string }[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isEditingCommunity, setIsEditingCommunity] = useState(false);
  const [editCommunityName, setEditCommunityName] = useState("");
  const [editCommunityDescription, setEditCommunityDescription] = useState("");
  const [editCommunityNeighborhood, setEditCommunityNeighborhood] = useState("");
  const [editCommunityPickupAddress, setEditCommunityPickupAddress] = useState("");
  const [editCommunityZipCode, setEditCommunityZipCode] = useState("");
  const [editCommunityIsPublic, setEditCommunityIsPublic] = useState(true);
  const [isSavingCommunity, setIsSavingCommunity] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingCommunity, setIsDeletingCommunity] = useState(false);
  const [isLeavingCommunity, setIsLeavingCommunity] = useState(false);
  const [editCommunityShowSuggestions, setEditCommunityShowSuggestions] = useState(false);
  const editCommunityNeighborhoodRef = useRef<HTMLInputElement>(null);
  const editCommunitySuggestionsRef = useRef<HTMLDivElement>(null);
  // Pending photo file held until the user clicks Save; preview is a blob URL
  // that the modal cleanup revokes.
  const [editCommunityImageFile, setEditCommunityImageFile] = useState<File | null>(null);
  const [editCommunityImagePreview, setEditCommunityImagePreview] = useState<string | null>(null);
  const editCommunityImageInputRef = useRef<HTMLInputElement>(null);

  const [pendingRequests, setPendingRequests] = useState<{ id: number; user_id: string; display_name: string | null; neighborhood: string | null; profile_picture: string | null }[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [acceptingRequestId, setAcceptingRequestId] = useState<number | null>(null);
  const [rejectingRequestId, setRejectingRequestId] = useState<number | null>(null);
  const [kickingMemberId, setKickingMemberId] = useState<string | null>(null);

  // Profile + listings
  const [stats, setStats] = useState<ProfileStats>({ total_listings: 0, purchases: 0, friends_count: 0, avg_seller_rating: 5.0, avg_buyer_rating: 5.0 });
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [_myListingsLoaded, setMyListingsLoaded] = useState(false);
  // Used by the Overview "Your listings" panel toggle AND the Listings tab default
  const [listingsTab, setListingsTab] = useState<"selling" | "buying">("selling");

  // Edit listing modal
  const [editListing, setEditListing] = useState<MyListing | null>(null);
  const openEditListing = (listing: MyListing) => setEditListing(listing);
  const handleSaveListing = async (patch: ListingUpdatePatch) => {
    if (!token || !editListing) return;
    const formData = new FormData();
    formData.append("data", JSON.stringify(patch));
    const res = await apiFetch(`/api/listings/${editListing.id}`, {
      method: "PUT",
      body: formData,
    });
    if (res.ok) {
      setEditListing(null);
      fetchMyListings();
    }
  };

  // Remove listing modal
  const [removingListing, setRemovingListing] = useState<MyListing | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const openRemoveListing = (listing: MyListing) => setRemovingListing(listing);
  const closeRemoveListing = () => {
    if (isRemoving) return;
    setRemovingListing(null);
  };

  // Order management — modal itself lives at App level via OrderModalsProvider
  // (R-5.7.3 lift). MyAccountPage only retains the withdraw-confirmation
  // dialog state, since withdraw lives on the buyer's purchases card, not
  // inside the seller-side order picker.
  const [withdrawingOrderId, setWithdrawingOrderId] = useState<number | null>(null);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState<number | null>(null);

  // Purchases / seller orders
  const [myPurchases, setMyPurchases] = useState<OrderData[]>([]);
  const [mySellerOrders, setMySellerOrders] = useState<OrderData[]>([]);
  // Becomes true after first /api/orders fetch. The "open modal from
  // notification" effect waits on this to avoid clearing pendingListingId
  // before purchases load. Preserved from PR-A/migration.
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  // Wishlist folders (R-5.3)
  const [wishlistFolders, setWishlistFolders] = useState<WishlistFolder[]>([]);
  const [_wishlistFoldersLoaded, setWishlistFoldersLoaded] = useState(false);
  const [wishlistFoldersAvailable, setWishlistFoldersAvailable] = useState(true);
  const [wishlistItemsWithFolder, setWishlistItemsWithFolder] = useState<WishlistListingWithFolder[]>([]);

  // Initial-load gates for skeleton rendering. Each defaults to `true`
  // so the very first render of MyAccount shows skeletons rather than
  // "Nothing here yet" empty copy. Flipped to `false` in the `finally`
  // block of the corresponding fetch* function.
  const [isLoadingMyListings, setIsLoadingMyListings] = useState(true);
  const [isLoadingMyOrders, setIsLoadingMyOrders] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);

  // Listings tab state (R-5.2)
  const [listingsFilter, setListingsFilter] = useState<string>("all");
  const [relistingId, setRelistingId] = useState<string | null>(null);

  // Saved tab state (R-5.3)
  const [selectedFolderId, setSelectedFolderId] = useState<number | "all">("all");
  const [selectedSavedIds, setSelectedSavedIds] = useState<Set<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<number | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState("");
  const [savingFolderId, setSavingFolderId] = useState<number | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  // Countdown tick for live countdowns
  const [countdownTick, setCountdownTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCountdownTick((p) => p + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const isSlotExpired = (slot: { date: string; time: string }): boolean => {
    const endHour = parseSlotEndHour(slot.time) ?? 18;
    const slotEnd = buildSlotTarget(slot.date, endHour);
    return new Date() > slotEnd;
  };

  // Auto-release address ≤ 1 hour before pickup (neighborhood orders)
  useEffect(() => {
    if (!token) return;
    const allOrders = [...myPurchases, ...mySellerOrders];
    for (const order of allOrders) {
      if (order.status === "confirmed" && order.is_neighborhood && !order.address_released) {
        const countdown = getPickupCountdown(order);
        if (countdown.diff <= 3600000) {
          apiFetch(`/api/orders/${order.id}/release-address`, { method: "POST" })
            .then((res) => { if (res.ok) fetchAllOrders(); })
            .catch(() => {});
        }
      }
    }
  }, [countdownTick, token, myPurchases, mySellerOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expire pending orders when all slots have passed
  useEffect(() => {
    if (!token) return;
    const allOrders = [...myPurchases, ...mySellerOrders];
    for (const order of allOrders) {
      if (order.status === "pending" && order.selected_pickup_slots.length > 0) {
        const allExpired = order.selected_pickup_slots.every((slot) => isSlotExpired(slot));
        if (allExpired) {
          apiFetch(`/api/orders/${order.id}/expire`, { method: "POST" })
            .then((res) => { if (res.ok) fetchAllOrders(); })
            .catch(() => {});
        }
      }
    }
  }, [countdownTick, token, myPurchases, mySellerOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rating + confirmation modals are owned by OrderModalsContext (App-level).
  // MyAccountPage opens them via the hooked openers; on rating success the
  // provider fires the subscribeAfterAction subscribers — we wire ours below
  // to keep myPurchases/mySellerOrders/myListings/punchlist fresh.
  const { openOrderConfirmSummary: ctxOpenOrderConfirmSummary, showOrderConfirmSummary, openRatingModal, openOrderManagement, subscribeAfterAction, subscribeListingSold } = useOrderModals();

  const fetchAllOrders = useCallback(async () => {
    if (!token) return;
    setIsLoadingMyOrders(true);
    try {
      const res = await apiFetch("/api/orders");
      if (res.ok) {
        const allOrders: OrderData[] = await res.json();
        setMyPurchases(allOrders.filter((o) => o.role === "buyer"));
        setMySellerOrders(allOrders.filter((o) => o.role === "seller"));
      }
    } catch {
      // ignore
    } finally {
      setOrdersLoaded(true);
      setIsLoadingMyOrders(false);
    }
  }, [token]);

  const openConfirmedOrderSummary = ctxOpenOrderConfirmSummary;

  const handleWithdrawOrder = async (orderId: number) => {
    if (!token) return;
    setWithdrawingOrderId(orderId);
    try {
      const res = await apiFetch(`/api/orders/${orderId}/withdraw`, { method: "POST" });
      if (res.ok) {
        setShowWithdrawConfirm(null);
        fetchAllOrders();
      }
    } catch {
      // ignore
    } finally {
      setWithdrawingOrderId(null);
    }
  };

  const fetchStats = useCallback(async () => {
    if (!token) return;
    setIsLoadingStats(true);
    try {
      const res = await apiFetch("/api/friends/stats");
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setIsLoadingStats(false);
    }
  }, [token]);

  const fetchMyListings = useCallback(async () => {
    if (!token) return;
    setIsLoadingMyListings(true);
    try {
      const res = await apiFetch("/api/listings/mine");
      if (res.ok) setMyListings(await res.json());
    } catch (err) {
      console.error("Failed to fetch my listings:", err);
    } finally {
      setMyListingsLoaded(true);
      setIsLoadingMyListings(false);
    }
  }, [token]);

  const handleRelist = async (listingId: string) => {
    if (!token) return;
    setRelistingId(listingId);
    try {
      const res = await apiFetch(`/api/listings/${listingId}/relist`, { method: "POST" });
      if (res.ok) fetchMyListings();
    } catch {
      // ignore
    } finally {
      setRelistingId(null);
    }
  };

  const handleConfirmRemoveListing = async () => {
    if (!token || !removingListing) return;
    setIsRemoving(true);
    try {
      const res = await apiFetch(`/api/listings/${removingListing.id}`, { method: "DELETE" });
      if (res.ok) {
        setRemovingListing(null);
        fetchMyListings();
        fetchAllOrders();
      } else {
        let message = "Failed to remove listing.";
        try {
          const data = (await res.json()) as { detail?: string };
          if (data?.detail) message = data.detail;
        } catch {
          // ignore
        }
        if (res.status === 400) message = "Sold listings cannot be removed.";
        else if (res.status === 403) message = "You can only remove your own listings.";
        else if (res.status === 404) message = "Listing no longer exists.";
        alert(message);
      }
    } catch {
      alert("Network error — listing was not removed.");
    } finally {
      setIsRemoving(false);
    }
  };

  const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
  const getListingTimeInfo = (postedAt: number) => {
    const elapsed = Date.now() - postedAt * 1000;
    const remaining = EXPIRY_MS - elapsed;
    if (remaining <= 0) return { expired: true, label: "Expired" };
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return { expired: false, label: `${days}d ${hours}h left` };
    const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return { expired: false, label: `${hours}h ${mins}m left` };
    return { expired: false, label: `${mins}m left` };
  };

  const fetchRecommended = useCallback(async () => {
    if (!token) return;
    setIsLoadingRecommended(true);
    try {
      const res = await apiFetch("/api/friends/recommended");
      if (res.ok) setRecommendedFriends(await res.json());
    } catch (err) {
      console.error("Failed to fetch recommended:", err);
    } finally {
      setIsLoadingRecommended(false);
    }
  }, [token]);

  const fetchFriendsList = useCallback(async () => {
    if (!token) return;
    setIsLoadingFriends(true);
    try {
      const res = await apiFetch("/api/friends");
      if (res.ok) setFriendsList(await res.json());
    } catch (err) {
      console.error("Failed to fetch friends:", err);
    } finally {
      setIsLoadingFriends(false);
    }
  }, [token]);

  const handleRemoveFriend = async (friendId: string) => {
    if (!token) return;
    setRemovingFriendId(friendId);
    try {
      const res = await apiFetch(`/api/friends/${friendId}`, { method: "DELETE" });
      if (res.ok) {
        setFriendsList((prev) => prev.filter((f) => f.id !== friendId));
        fetchStats();
      }
    } catch {
      // ignore
    } finally {
      setRemovingFriendId(null);
    }
  };

  const openFriendsModal = () => {
    setShowFriendsModal(true);
    fetchFriendsList();
  };

  const fetchCommunities = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/communities/mine");
      if (res.ok) setCommunities(await res.json());
    } catch (err) {
      console.error("Failed to fetch communities:", err);
    } finally {
      setCommunitiesLoaded(true);
    }
  }, [token]);

  // ── Wishlist folders (R-5.3) ───────────────────────────
  const fetchWishlistFolders = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/wishlist/folders");
      if (res.ok) {
        setWishlistFolders(await res.json());
        setWishlistFoldersAvailable(true);
      } else if (res.status === 404) {
        // Backend hasn't shipped folder endpoints — fall back to "All saved" only
        setWishlistFoldersAvailable(false);
      }
    } catch (err) {
      console.error("Failed to fetch wishlist folders:", err);
      setWishlistFoldersAvailable(false);
    } finally {
      setWishlistFoldersLoaded(true);
    }
  }, [token]);

  const fetchWishlistWithFolders = useCallback(async () => {
    if (!token) return;
    setIsLoadingSaved(true);
    try {
      const res = await apiFetch("/api/wishlist/listings");
      if (res.ok) {
        const data: WishlistListingWithFolder[] = await res.json();
        setWishlistItemsWithFolder(data);
      }
    } catch (err) {
      console.error("Failed to fetch wishlist listings with folders:", err);
    } finally {
      setIsLoadingSaved(false);
    }
  }, [token]);

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !token) return;
    setCreatingFolder(true);
    try {
      const res = await apiFetch("/api/wishlist/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const folder: WishlistFolder = await res.json();
        setWishlistFolders((prev) => [...prev, { ...folder, item_count: 0 }]);
        setNewFolderName("");
        setNewFolderOpen(false);
      }
    } catch (err) {
      console.error("Failed to create folder:", err);
    } finally {
      setCreatingFolder(false);
    }
  };

  const renameFolder = async (folderId: number) => {
    const name = renamingFolderName.trim();
    if (!name || !token) return;
    setSavingFolderId(folderId);
    try {
      const res = await apiFetch(`/api/wishlist/folders/${folderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setWishlistFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)));
        setRenamingFolderId(null);
        setRenamingFolderName("");
      }
    } catch (err) {
      console.error("Failed to rename folder:", err);
    } finally {
      setSavingFolderId(null);
    }
  };

  const deleteFolder = async (folderId: number) => {
    if (!token) return;
    if (!window.confirm("Delete this folder? Items will move to All saved.")) return;
    try {
      const res = await apiFetch(`/api/wishlist/folders/${folderId}`, { method: "DELETE" });
      if (res.ok) {
        setWishlistFolders((prev) => prev.filter((f) => f.id !== folderId));
        if (selectedFolderId === folderId) setSelectedFolderId("all");
        fetchWishlistWithFolders();
      }
    } catch (err) {
      console.error("Failed to delete folder:", err);
    }
  };

  const moveSelectedToFolder = async (folderId: number | null) => {
    if (!token || selectedSavedIds.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedSavedIds).map((listingId) =>
          apiFetch(`/api/wishlist/${listingId}/folder`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder_id: folderId }),
          }),
        ),
      );
      setSelectedSavedIds(new Set());
      setMoveOpen(false);
      fetchWishlistFolders();
      fetchWishlistWithFolders();
    } catch (err) {
      console.error("Failed to move items:", err);
    }
  };

  const unsaveSelected = async () => {
    if (!token || selectedSavedIds.size === 0) return;
    for (const id of Array.from(selectedSavedIds)) {
      onToggleWishlist?.(id);
    }
    setSelectedSavedIds(new Set());
  };

  useEffect(() => {
    fetchCommunities();
    fetchStats();
    fetchMyListings();
    fetchAllOrders();
    fetchWishlistFolders();
    fetchWishlistWithFolders();
  }, [fetchCommunities, fetchStats, fetchMyListings, fetchAllOrders, fetchWishlistFolders, fetchWishlistWithFolders]);

  // Refetch local communities list whenever the user's neighborhood changes
  // (set_user_neighborhood swap on the server adds/removes membership).
  // Reactive — not called imperatively in doUpdateProfile — to avoid races
  // with the AuthContext re-render triggered by updateUser(). App.tsx has its
  // own neighborhood-watching effect for its publicCommunities state — keep
  // those decoupled so the `onCommunitiesChanged` callback prop (which is
  // recreated every App render) can't pull this effect into a render loop.
  useEffect(() => {
    if (!user?.neighborhood) return;
    fetchCommunities();
  }, [user?.neighborhood, fetchCommunities]);

  // Refetch when an OrderModalsProvider action settles (rating submit, slot
  // confirm, decline). The Supabase realtime channel below also catches the
  // underlying purchase_orders row update, but the explicit subscription is
  // the deterministic path — realtime is best-effort.
  useEffect(() => {
    return subscribeAfterAction(() => {
      fetchAllOrders();
      fetchMyListings();
    });
  }, [subscribeAfterAction, fetchAllOrders, fetchMyListings]);

  // History entries for confirmed sales fire through the same provider so
  // App-level openers (the `purchase` notification path) land in history
  // even when MyAccountPage was already mounted somewhere else first.
  useEffect(() => {
    if (!onAddToHistory) return;
    return subscribeListingSold((listing) => {
      onAddToHistory({
        id: listing.id,
        title: formatTitle(listing.brand, listing.name),
        imageUrl: listing.imageUrl,
        price: listing.price,
        type: "sold",
      });
    });
  }, [subscribeListingSold, onAddToHistory]);

  // Realtime: refresh orders on purchase_orders changes
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("purchase_orders_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_orders" },
        () => {
          fetchAllOrders();
          fetchMyListings();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchAllOrders, fetchMyListings]);

  // When a notification routes the user here, force a fresh fetch of
  // orders/listings so the auto-open watcher below has up-to-date
  // state. Without this, a buyer's just-created pending order may not be in
  // mySellerOrders/myListings yet (the Supabase realtime channel covers the
  // already-mounted case but not the navigate-from-elsewhere case where
  // initial mount may have fetched before the order was committed).
  useEffect(() => {
    if (!pendingListingId) return;
    fetchAllOrders();
    fetchMyListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingListingId]);

  // Punchlist: derived client-side from loaded state — no server round-trip.
  // Punchlist is derived client-side from already-loaded data; the unused backend /api/me/punchlist route was removed (see cleanup/hygiene-sweep).
  const punchlist = useMemo<PunchlistResponse>(() => {
    const mapOrderToPickup = (o: OrderData, role: "seller" | "buyer"): PunchlistPickup => {
      const countdown = getPickupCountdown(o);
      return {
        order_id: o.id,
        listing_id: o.listing_id,
        listing_title: o.listing_title,
        listing_image: o.listing_image ?? null,
        slot: o.confirmed_time ?? null,
        role,
        pickup_expired: countdown.expired,
        countdown_label: countdown.label,
      };
    };

    // Seller and buyer both surface within 1 hour of pickup OR already expired.
    // CTA stays muted ("Pickup in {label}") until expired; activates to
    // "Confirm pickup" → openRatingModal post-expiry.
    const sellerPickups = mySellerOrders
      .filter((o) => o.status === "confirmed" && !o.seller_reviewed && getPickupCountdown(o).diff <= 3600000)
      .map((o) => mapOrderToPickup(o, "seller"));

    const buyerPickups = myPurchases
      .filter((o) => o.status === "confirmed" && !o.buyer_reviewed && getPickupCountdown(o).diff <= 3600000)
      .map((o) => mapOrderToPickup(o, "buyer"));

    return {
      pickups_to_confirm: [...sellerPickups, ...buyerPickups],
      offers_to_review: myListings.filter((l) => (l.pendingOrderCount ?? 0) > 0),
      draft_listings: myListings.filter((l) => l.status === "draft"),
      unread_messages: [],
    };
  }, [mySellerOrders, myPurchases, myListings, getPickupCountdown, countdownTick]);

  const punchlistLoaded = !isLoadingMyOrders && !isLoadingMyListings;

  // Auto-open order modal when routed from notification
  useEffect(() => {
    if (!pendingListingId) return;
    const listing = myListings.find((l) => l.id === pendingListingId);
    const hasPendingSellerOrder = mySellerOrders.some(
      (o) => o.listing_id === pendingListingId && o.status === "pending",
    );
    if (listing && (hasPendingSellerOrder || (listing.pendingOrderCount ?? 0) > 0)) {
      openOrderManagement(listing);
      onClearPendingListing?.();
      return;
    }
    const purchase = myPurchases.find((o) => o.listing_id === pendingListingId && o.status === "confirmed");
    if (purchase) {
      const slot = purchase.selected_pickup_slots[0];
      showOrderConfirmSummary({
        listing: {
          id: purchase.listing_id,
          title: purchase.listing_title,
          description: "",
          price: purchase.listing_price,
          condition: "",
          location: "",
          tags: [],
          imageUrl: purchase.listing_image,
          postedAt: 0,
          status: "sold",
          brand: "",
          name: purchase.listing_title,
        },
        buyerName: purchase.seller_name,
        slot: slot || { date: "", time: "" },
        role: "buyer",
        confirmedTime: purchase.confirmed_time,
        pickupAddress: purchase.address_released ? purchase.pickup_address : null,
        order: purchase,
      });
      onClearPendingListing?.();
      return;
    }
    if (!ordersLoaded) return;
    onClearPendingListing?.();
  }, [pendingListingId, myListings, myPurchases, mySellerOrders, ordersLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Community handlers (preserved verbatim from prior file) ──
  const handleJoinCommunity = async () => {
    if (!joinCode.trim() || !token) return;
    setIsJoining(true);
    setJoinError("");
    try {
      const res = await apiFetch("/api/communities/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: joinCode.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        setJoinError(err.detail || "Failed to join community");
        return;
      }
      setJoinCode("");
      setShowJoinModal(false);
      fetchCommunities();
      onCommunitiesChanged?.();
    } catch {
      setJoinError("Network error. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleCommunitySearch = (query: string) => {
    setCommunitySearch(query);
    if (communitySearchTimeoutRef.current) clearTimeout(communitySearchTimeoutRef.current);
    if (!query.trim()) {
      setCommunitySearchResults([]);
      return;
    }
    communitySearchTimeoutRef.current = setTimeout(async () => {
      if (!token) return;
      setIsSearchingCommunities(true);
      try {
        const res = await apiFetch(`/api/communities/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setCommunitySearchResults(await res.json());
      } catch {
        // ignore
      } finally {
        setIsSearchingCommunities(false);
      }
    }, 300);
  };

  const handleJoinBySearch = async (inviteCode: string, communityId: number) => {
    if (!token) return;
    setJoiningCommunityId(communityId);
    try {
      const res = await apiFetch("/api/communities/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: inviteCode }),
      });
      if (res.ok) {
        setCommunitySearchResults((prev) => prev.map((c) => (c.id === communityId ? { ...c, is_member: true } : c)));
        fetchCommunities();
        onCommunitiesChanged?.();
        fetchStats();
      }
    } catch {
      // ignore
    } finally {
      setJoiningCommunityId(null);
    }
  };

  const handleRequestToJoin = async (communityId: number) => {
    if (!token) return;
    setRequestingCommunityId(communityId);
    try {
      const res = await apiFetch("/api/communities/request-join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ community_id: communityId }),
      });
      if (res.ok) {
        setCommunitySearchResults((prev) => prev.map((c) => (c.id === communityId ? { ...c, has_requested: true } : c)));
      }
    } catch {
      // ignore
    } finally {
      setRequestingCommunityId(null);
    }
  };

  const handleCancelRequest = async (communityId: number) => {
    if (!token) return;
    setRequestingCommunityId(communityId);
    try {
      const res = await apiFetch("/api/communities/cancel-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ community_id: communityId }),
      });
      if (res.ok) {
        setCommunitySearchResults((prev) => prev.map((c) => (c.id === communityId ? { ...c, has_requested: false } : c)));
      }
    } catch {
      // ignore
    } finally {
      setRequestingCommunityId(null);
    }
  };

  const closeJoinModal = () => {
    setShowJoinModal(false);
    setJoinError("");
    setJoinCode("");
    setShowInviteCode(false);
    setCommunitySearch("");
    setCommunitySearchResults([]);
  };

  const handleCreateCommunity = async () => {
    setCreateError(null);
    if (!createName.trim() || !createDescription.trim() || !createNeighborhood.trim()) {
      setCreateError("Name, description, and neighborhood are required");
      return;
    }
    if (!token) {
      setCreateError("Sign in to create a community");
      return;
    }
    setIsCreating(true);
    try {
      const formData = new FormData();
      formData.append("name", createName.trim());
      formData.append("description", createDescription.trim());
      formData.append("neighborhood", createNeighborhood.trim());
      if (createPickupAddress.trim()) formData.append("pickup_address", createPickupAddress.trim());
      if (createZipCode.trim()) formData.append("zip_code", createZipCode.trim());
      formData.append("is_public", String(createIsPublic));
      if (createImage) formData.append("image", createImage);
      const res = await apiFetch("/api/communities", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: `Server returned ${res.status}` }));
        throw new Error(data.detail || `Create failed (${res.status})`);
      }
      const community = await res.json();
      setCreatedCommunity(community);
      setShowCreateModal(false);
      setShowConfirmModal(true);
      fetchFriendsForInvite();
      resetCreateForm();
      fetchCommunities();
      onCommunitiesChanged?.();
    } catch (err) {
      console.error("Create community failed:", err);
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setIsCreating(false);
    }
  };

  const resetCreateForm = () => {
    setCreateName("");
    setCreateDescription("");
    setCreateNeighborhood("");
    setCreatePickupAddress("");
    setCreateZipCode("");
    setCreateShowLocationSuggestions(false);
    setCreateIsPublic(true);
    setCreateImage(null);
    setCreateImagePreview(null);
  };

  const handleCreateImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreateImage(file);
    const reader = new FileReader();
    reader.onload = () => setCreateImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const shareCommunity = async (community: CommunityData) => {
    const shareText = `Join ${community.name} on Cosello! Use invite code: ${community.invite_code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: community.name, text: shareText });
      } catch {
        // user cancelled
      }
    } else {
      navigator.clipboard.writeText(shareText);
    }
  };

  const copyConfirmCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedConfirm(true);
    setTimeout(() => setCopiedConfirm(false), 2000);
  };

  const openCommunityDetail = async (community: CommunityData) => {
    setSelectedCommunity(community);
    setShowCommunityDetail(true);
    setIsEditingCommunity(false);
    setShowDeleteConfirm(false);
    setPendingRequests([]);
    setIsLoadingMembers(true);
    try {
      const res = await apiFetch(`/api/communities/${community.id}/members`);
      if (res.ok) setCommunityMembers(await res.json());
    } catch {
      // ignore
    } finally {
      setIsLoadingMembers(false);
    }
    if (!community.is_public && community.created_by === user?.id) {
      setIsLoadingRequests(true);
      try {
        const res = await apiFetch(`/api/communities/${community.id}/requests`);
        if (res.ok) setPendingRequests(await res.json());
      } catch {
        // ignore
      } finally {
        setIsLoadingRequests(false);
      }
    }
  };

  const handleAcceptRequest = async (communityId: number, requestId: number) => {
    if (!token) return;
    setAcceptingRequestId(requestId);
    try {
      const res = await apiFetch(`/api/communities/${communityId}/requests/${requestId}/accept`, { method: "POST" });
      if (res.ok) {
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
        const membersRes = await apiFetch(`/api/communities/${communityId}/members`);
        if (membersRes.ok) setCommunityMembers(await membersRes.json());
        setSelectedCommunity((prev) => prev ? { ...prev, member_count: prev.member_count + 1 } : prev);
      }
    } catch {
      // ignore
    } finally {
      setAcceptingRequestId(null);
    }
  };

  const handleRejectRequest = async (communityId: number, requestId: number) => {
    if (!token) return;
    setRejectingRequestId(requestId);
    try {
      const res = await apiFetch(`/api/communities/${communityId}/requests/${requestId}/reject`, { method: "POST" });
      if (res.ok) setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch {
      // ignore
    } finally {
      setRejectingRequestId(null);
    }
  };

  const handleKickMember = async (communityId: number, memberId: string) => {
    if (!token) return;
    setKickingMemberId(memberId);
    try {
      const res = await apiFetch(`/api/communities/${communityId}/members/${memberId}`, { method: "DELETE" });
      if (res.ok) {
        setCommunityMembers((prev) => prev.filter((m) => m.id !== memberId));
        setSelectedCommunity((prev) => prev ? { ...prev, member_count: prev.member_count - 1 } : prev);
        fetchCommunities();
        onCommunitiesChanged?.();
      }
    } catch {
      // ignore
    } finally {
      setKickingMemberId(null);
    }
  };

  const startEditCommunity = () => {
    if (!selectedCommunity) return;
    setEditCommunityName(selectedCommunity.name);
    setEditCommunityDescription(selectedCommunity.description || "");
    setEditCommunityNeighborhood(selectedCommunity.neighborhood || "");
    setEditCommunityPickupAddress(selectedCommunity.pickup_address || "");
    setEditCommunityZipCode(selectedCommunity.zip_code || "");
    setEditCommunityIsPublic(selectedCommunity.is_public);
    clearEditCommunityImage();
    setIsEditingCommunity(true);
  };

  const clearEditCommunityImage = () => {
    if (editCommunityImagePreview) URL.revokeObjectURL(editCommunityImagePreview);
    setEditCommunityImageFile(null);
    setEditCommunityImagePreview(null);
    if (editCommunityImageInputRef.current) editCommunityImageInputRef.current.value = "";
  };

  const handleEditCommunityImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    // 5MB ceiling matches the Supabase Storage bucket budget.
    if (file.size > 5 * 1024 * 1024) return;
    if (editCommunityImagePreview) URL.revokeObjectURL(editCommunityImagePreview);
    setEditCommunityImageFile(file);
    setEditCommunityImagePreview(URL.createObjectURL(file));
  };

  // Revoke any held blob URL when the modal closes.
  useEffect(() => {
    if (!isEditingCommunity && editCommunityImagePreview) {
      URL.revokeObjectURL(editCommunityImagePreview);
      setEditCommunityImagePreview(null);
      setEditCommunityImageFile(null);
    }
  }, [isEditingCommunity, editCommunityImagePreview]);

  const handleSaveCommunity = async () => {
    if (!selectedCommunity || !token) return;
    setIsSavingCommunity(true);
    try {
      // Upload the new photo first (separate multipart endpoint) so the JSON
      // PUT below sees a consistent record. If the upload fails we bail out
      // without touching the other fields.
      if (editCommunityImageFile) {
        const fd = new FormData();
        fd.append("image", editCommunityImageFile);
        const imgRes = await apiFetch(`/api/communities/${selectedCommunity.id}/image`, {
          method: "PUT",
          body: fd,
        });
        if (!imgRes.ok) return;
      }
      const res = await apiFetch(`/api/communities/${selectedCommunity.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editCommunityName.trim(),
          description: editCommunityDescription.trim() || null,
          neighborhood: editCommunityNeighborhood.trim() || null,
          pickup_address: editCommunityPickupAddress.trim() || null,
          zip_code: editCommunityZipCode.trim() || null,
          is_public: editCommunityIsPublic,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedCommunity(updated);
        setCommunities((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        clearEditCommunityImage();
        setIsEditingCommunity(false);
        onCommunitiesChanged?.();
      }
    } catch {
      // ignore
    } finally {
      setIsSavingCommunity(false);
    }
  };

  const handleDeleteCommunity = async () => {
    if (!selectedCommunity || !token) return;
    setIsDeletingCommunity(true);
    try {
      const res = await apiFetch(`/api/communities/${selectedCommunity.id}`, { method: "DELETE" });
      if (res.ok) {
        setCommunities((prev) => prev.filter((c) => c.id !== selectedCommunity!.id));
        setShowCommunityDetail(false);
        setShowDeleteConfirm(false);
        onCommunitiesChanged?.();
      }
    } catch {
      // ignore
    } finally {
      setIsDeletingCommunity(false);
    }
  };

  const handleLeaveCommunity = async () => {
    if (!selectedCommunity || !token) return;
    setIsLeavingCommunity(true);
    try {
      const res = await apiFetch(`/api/communities/${selectedCommunity.id}/leave`, { method: "DELETE" });
      if (res.ok) {
        setCommunities((prev) => prev.filter((c) => c.id !== selectedCommunity!.id));
        setShowCommunityDetail(false);
        onCommunitiesChanged?.();
      }
    } catch {
      // ignore
    } finally {
      setIsLeavingCommunity(false);
    }
  };

  const [allFriends, setAllFriends] = useState<SearchUser[]>([]);
  const fetchFriendsForInvite = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        setAllFriends(data);
        setFriendResults(data);
      }
    } catch {
      // ignore
    }
  }, [token]);

  const handleFriendSearch = (query: string) => {
    setFriendSearch(query);
    const available = allFriends.filter((f) => !selectedFriends.some((s) => s.id === f.id));
    if (!query.trim()) {
      setFriendResults(available);
      return;
    }
    const q = query.trim().toLowerCase();
    setFriendResults(available.filter((f) => f.display_name?.toLowerCase().includes(q)));
  };

  const addFriend = (friend: SearchUser) => {
    setSelectedFriends([...selectedFriends, friend]);
    setFriendResults(friendResults.filter((f) => f.id !== friend.id));
    setFriendSearch("");
  };

  const removeFriend = (id: string) => {
    setSelectedFriends(selectedFriends.filter((f) => f.id !== id));
  };

  const handleInviteFriends = async () => {
    if (!createdCommunity || selectedFriends.length === 0 || !token) return;
    setIsInviting(true);
    try {
      await apiFetch("/api/communities/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ community_id: createdCommunity.id, user_ids: selectedFriends.map((f) => f.id) }),
      });
      setSelectedFriends([]);
      setShowConfirmModal(false);
      fetchCommunities();
    } catch {
      // ignore
    } finally {
      setIsInviting(false);
    }
  };

  const shareViaSMS = () => {
    if (!createdCommunity) return;
    const msg = `Join my community "${createdCommunity.name}" on Cosello! Use invite code: ${createdCommunity.invite_code}`;
    window.open(`sms:?&body=${encodeURIComponent(msg)}`, "_blank");
  };

  const shareViaInstagram = () => {
    if (!createdCommunity) return;
    const text = `Join my community "${createdCommunity.name}" on Cosello! Invite code: ${createdCommunity.invite_code}`;
    navigator.clipboard.writeText(text);
    setCopiedConfirm(true);
    setTimeout(() => setCopiedConfirm(false), 2000);
    window.open("https://www.instagram.com/direct/new/", "_blank");
  };

  const closeShareModal = () => {
    setShowConfirmModal(false);
    setFriendSearch("");
    setFriendResults([]);
    setSelectedFriends([]);
  };

  const handleAddFriendsSearch = (query: string) => {
    setAddFriendsSearch(query);
    if (addFriendsSearchRef.current) clearTimeout(addFriendsSearchRef.current);
    if (!query.trim()) {
      setAddFriendsResults([]);
      return;
    }
    addFriendsSearchRef.current = setTimeout(async () => {
      if (!token) return;
      setIsAddFriendsSearching(true);
      try {
        const res = await apiFetch(`/api/friends/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setAddFriendsResults(await res.json());
      } catch {
        // ignore
      } finally {
        setIsAddFriendsSearching(false);
      }
    }, 300);
  };

  const handleAddFriend = async (userId: string) => {
    if (!token) return;
    setAddingFriendId(userId);
    try {
      const res = await apiFetch("/api/friends/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        setAddFriendsResults((prev) => prev.map((u) => (u.id === userId ? { ...u, is_friend: true } : u)));
        setRecommendedFriends((prev) => prev.filter((u) => u.id !== userId));
        fetchStats();
      }
    } catch {
      // ignore
    } finally {
      setAddingFriendId(null);
    }
  };

  const openAddFriendsModal = () => {
    setShowAddFriendsModal(true);
    setAddFriendsTab("recommended");
    setAddFriendsSearch("");
    setAddFriendsResults([]);
    fetchRecommended();
  };

  const closeAddFriendsModal = () => {
    setShowAddFriendsModal(false);
    setAddFriendsSearch("");
    setAddFriendsResults([]);
  };

  const editIsValidNeighborhood = neighborhoods.some(
    (n) => n.toLowerCase() === editNeighborhood.trim().toLowerCase(),
  );
  const editFilteredNeighborhoods = editNeighborhood.trim()
    ? neighborhoods.filter((n) => n.toLowerCase().includes(editNeighborhood.trim().toLowerCase()))
    : neighborhoods;

  const openEditProfileModal = () => {
    const name = user?.display_name || "";
    const parts = name.split(" ");
    setEditFirstName(parts[0] || "");
    setEditLastName(parts.slice(1).join(" ") || "");
    setEditPickupAddress(user?.pickup_address || "");
    setEditNeighborhood(user?.neighborhood || "");
    setEditZipCode(user?.zip_code || "");
    setEditProfileError("");
    setEditShowSuggestions(false);
    setShowEditProfileModal(true);
  };

  const isNeighborhoodChanging = editNeighborhood.trim() !== (user?.neighborhood ?? "");

  const doUpdateProfile = async () => {
    setIsUpdatingProfile(true);
    setEditProfileError("");
    try {
      const res = await apiFetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: `${editFirstName.trim()} ${editLastName.trim()}`,
          neighborhood: editNeighborhood.trim(),
          pickup_address: editPickupAddress.trim() || undefined,
          zip_code: editZipCode.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Update failed" }));
        throw new Error(data.detail);
      }
      const updatedUser = await res.json();
      updateUser(updatedUser);
      setShowEditProfileModal(false);
      // Communities refetch fires reactively via the `user?.neighborhood`
      // useEffect below — see comment there for why.
    } catch (err) {
      setEditProfileError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) {
      setEditProfileError("Please enter your first and last name");
      return;
    }
    if (!editIsValidNeighborhood) {
      setEditProfileError("Please select a valid Manhattan neighborhood");
      return;
    }
    if (isNeighborhoodChanging) {
      setShowEditProfileModal(false);
      setShowNeighborhoodChangeConfirm(true);
      return;
    }
    await doUpdateProfile();
  };

  const handleConfirmNeighborhoodChange = async () => {
    setShowNeighborhoodChangeConfirm(false);
    await doUpdateProfile();
  };

  const handleCancelNeighborhoodChange = () => {
    setShowNeighborhoodChangeConfirm(false);
    setShowEditProfileModal(true);
  };

  useClickOutside([createLocationRef, createLocationSuggestionsRef], () => setCreateShowLocationSuggestions(false), createShowLocationSuggestions);
  useClickOutside([editNeighborhoodRef, editSuggestionsRef], () => setEditShowSuggestions(false), editShowSuggestions);
  useClickOutside([editCommunityNeighborhoodRef, editCommunitySuggestionsRef], () => setEditCommunityShowSuggestions(false), editCommunityShowSuggestions);

  // ── Derived data ───────────────────────────────────────
  const avgRating = ((stats.avg_seller_rating + stats.avg_buyer_rating) / 2).toFixed(2);

  const sellingActiveCount = myListings.filter((l) => !getListingTimeInfo(l.postedAt).expired).length;
  const sellingDraftCount = myListings.filter((l) => l.status === "draft").length;
  const sellingSoldCount = myListings.filter((l) => l.status === "sold").length;

  const buyingActiveCount = myPurchases.filter((o) => o.status === "pending" || o.status === "confirmed").length;
  const buyingCompletedCount = myPurchases.filter((o) => o.status === "completed").length;
  const buyingDeclinedCount = myPurchases.filter((o) => o.status === "declined" || o.status === "withdrawn" || o.status === "expired" || o.status === "cancelled_by_seller").length;

  const visibleSavedItems = wishlistItemsWithFolder.length > 0
    ? (selectedFolderId === "all"
        ? wishlistItemsWithFolder
        : wishlistItemsWithFolder.filter((i) => i.folder_id === selectedFolderId))
    : wishlistItems;

  return (
    <section className="min-h-[calc(100vh-64px)] bg-canvas text-ink">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* ── Profile Header ───────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-10">
          <div className="size-20 rounded-full bg-surface-soft border border-hairline flex items-center justify-center overflow-hidden shrink-0">
            {user?.profile_picture ? (
              <img src={user.profile_picture} alt={user.display_name || "Profile"} className="size-full object-cover" />
            ) : (
              <span className="text-2xl font-extrabold text-ink tracking-display">
                {(user?.display_name?.[0] || "?").toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-ink tracking-display leading-tight">
              {user?.display_name || "Your account"}
            </h1>
            {/* Meta strip — verified badge and member-since are omitted until
                AuthUser surfaces `is_verified` / `created_at` (backlog: Data gaps). */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted mt-2">
              {stats.total_listings > 0 && (
                <span className="inline-flex items-center gap-1 text-ink font-semibold">
                  {avgRating}
                  <Star className="size-3.5 fill-ink text-ink" aria-hidden="true" />
                </span>
              )}
              {user?.neighborhood && (
                <>
                  {stats.total_listings > 0 && <span aria-hidden="true">·</span>}
                  <span>{user.neighborhood}, NY</span>
                </>
              )}
            </div>
            {/* Counter row — embedded stats below the meta strip. Each stat
                jumps to its surface so the row is actionable. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm mt-3">
              <button
                type="button"
                onClick={openFriendsModal}
                className={`group rounded-sm motion-safe:transition-colors ${FOCUS_RING}`}
              >
                <span className="font-semibold text-ink">{stats.friends_count}</span>{" "}
                <span className="text-muted group-hover:text-primary motion-safe:transition-colors">
                  {stats.friends_count === 1 ? "Friend" : "Friends"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setAccountTab("listings")}
                className={`group rounded-sm motion-safe:transition-colors ${FOCUS_RING}`}
              >
                <span className="font-semibold text-ink">{myListings.length}</span>{" "}
                <span className="text-muted group-hover:text-primary motion-safe:transition-colors">
                  {myListings.length === 1 ? "Listing" : "Listings"}
                </span>
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openEditProfileModal}
              className={`inline-flex items-center justify-center h-9 px-4 rounded-md border border-primary/30 text-sm font-semibold text-primary bg-primary-soft hover:bg-primary-tint transition-colors ${FOCUS_RING}`}
            >
              Edit profile
            </button>
            <button
              type="button"
              onClick={openAddFriendsModal}
              className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
            >
              <UserPlus className="size-4" />
              Add Friends
            </button>
          </div>
        </div>

        {/* ── Tab strip ────────────────────────────────── */}
        <div role="tablist" aria-label="Account sections" className="flex items-end gap-8 border-b border-hairline mb-8">
          {([
            ["overview", "Overview", null],
            ["listings", "Listings", myListings.length || null],
            ["saved", "Saved", (wishlistItemsWithFolder.length || wishlistItems.length) || null],
            ["settings", "Settings", null],
          ] as const).map(([id, label, count]) => {
            const active = accountTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                aria-controls={`account-panel-${id}`}
                onClick={() => setAccountTab(id)}
                className={`relative inline-flex flex-col items-center gap-1 pb-3 px-1 motion-safe:transition-colors ${FOCUS_RING} ${active ? "text-ink" : "text-muted hover:text-ink"}`}
              >
                <span className="text-base font-bold">{label}</span>
                <span className={`text-[11px] font-semibold leading-none min-h-[12px] ${count != null ? "text-muted" : "invisible"}`}>
                  {count ?? "0"}
                </span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-px left-0 right-0 h-[3px] bg-primary rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tab panels ────────────────────────────────── */}
        {accountTab === "overview" && (
          <div id="account-panel-overview" role="tabpanel" className="flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
              <OverviewListingsPanel
                listingsTab={listingsTab}
                setListingsTab={setListingsTab}
                myListings={myListings}
                myPurchases={myPurchases}
                mySellerOrders={mySellerOrders}
                isLoadingMyListings={isLoadingMyListings}
                isLoadingMyOrders={isLoadingMyOrders}
                openEditListing={openEditListing}
                openOrderModal={openOrderManagement}
                openConfirmedOrderSummary={openConfirmedOrderSummary}
                openRatingModal={openRatingModal}
                openListingDetail={openListingDetail}
                getListingTimeInfo={getListingTimeInfo}
                getPickupCountdown={getPickupCountdown}
                onNavigate={onNavigate}
              />
              <PunchlistPanel
                punchlist={punchlist}
                punchlistLoaded={punchlistLoaded}
                openOrderModal={openOrderManagement}
                openEditListing={openEditListing}
                openRatingModal={openRatingModal}
                openConfirmedOrderSummary={openConfirmedOrderSummary}
                mySellerOrders={mySellerOrders}
                myPurchases={myPurchases}
              />
            </div>
          </div>
        )}

        {accountTab === "listings" && (
          <div id="account-panel-listings" role="tabpanel">
            <ListingsTabContent
              listingsTab={listingsTab}
              setListingsTab={(t) => { setListingsTab(t); setListingsFilter("all"); }}
              listingsFilter={listingsFilter}
              setListingsFilter={setListingsFilter}
              myListings={myListings}
              myPurchases={myPurchases}
              mySellerOrders={mySellerOrders}
              isLoadingStats={isLoadingStats}
              isLoadingMyListings={isLoadingMyListings}
              isLoadingMyOrders={isLoadingMyOrders}
              sellingActiveCount={sellingActiveCount}
              sellingDraftCount={sellingDraftCount}
              sellingSoldCount={sellingSoldCount}
              buyingActiveCount={buyingActiveCount}
              buyingCompletedCount={buyingCompletedCount}
              buyingDeclinedCount={buyingDeclinedCount}
              openEditListing={openEditListing}
              openRemoveListing={openRemoveListing}
              openOrderModal={openOrderManagement}
              openConfirmedOrderSummary={openConfirmedOrderSummary}
              openRatingModal={openRatingModal}
              openListingDetail={openListingDetail}
              handleRelist={handleRelist}
              relistingId={relistingId}
              getListingTimeInfo={getListingTimeInfo}
              getPickupCountdown={getPickupCountdown}
              setShowWithdrawConfirm={setShowWithdrawConfirm}
              showWithdrawConfirm={showWithdrawConfirm}
              handleWithdrawOrder={handleWithdrawOrder}
              withdrawingOrderId={withdrawingOrderId}
              onNavigate={onNavigate}
            />
          </div>
        )}

        {accountTab === "saved" && (
          <div id="account-panel-saved" role="tabpanel">
            <SavedTabContent
              folders={wishlistFolders}
              foldersAvailable={wishlistFoldersAvailable}
              items={visibleSavedItems}
              isLoadingSaved={isLoadingSaved}
              selectedFolderId={selectedFolderId}
              setSelectedFolderId={setSelectedFolderId}
              selectedIds={selectedSavedIds}
              setSelectedIds={setSelectedSavedIds}
              newFolderOpen={newFolderOpen}
              setNewFolderOpen={setNewFolderOpen}
              newFolderName={newFolderName}
              setNewFolderName={setNewFolderName}
              creatingFolder={creatingFolder}
              createFolder={createFolder}
              renamingFolderId={renamingFolderId}
              setRenamingFolderId={setRenamingFolderId}
              renamingFolderName={renamingFolderName}
              setRenamingFolderName={setRenamingFolderName}
              savingFolderId={savingFolderId}
              renameFolder={renameFolder}
              deleteFolder={deleteFolder}
              moveSelectedToFolder={moveSelectedToFolder}
              unsaveSelected={unsaveSelected}
              moveOpen={moveOpen}
              setMoveOpen={setMoveOpen}
              openListingDetail={openListingDetail}
              wishlistItemsWithFolder={wishlistItemsWithFolder}
              onNavigate={onNavigate}
            />
          </div>
        )}

        {accountTab === "settings" && (
          <div id="account-panel-settings" role="tabpanel">
            <SettingsTabContent
              settings={settings}
              updateSetting={updateSetting}
              resetSettings={resetSettings}
              openEditProfileModal={openEditProfileModal}
              openAddFriendsModal={openAddFriendsModal}
              openFriendsModal={openFriendsModal}
              friendsCount={stats.friends_count}
              logout={async () => {
                await logout();
                onNavigate("home");
              }}
            />
          </div>
        )}
      </div>

      {/* ── Modals (preserved) ───────────────────────────── */}
      <JoinCommunityModal
        open={showJoinModal}
        communitySearch={communitySearch}
        communitySearchResults={communitySearchResults}
        isSearchingCommunities={isSearchingCommunities}
        requestingCommunityId={requestingCommunityId}
        joiningCommunityId={joiningCommunityId}
        showInviteCode={showInviteCode}
        joinCode={joinCode}
        joinError={joinError}
        isJoining={isJoining}
        onClose={closeJoinModal}
        onSearchChange={handleCommunitySearch}
        onToggleInviteCode={() => setShowInviteCode((prev) => !prev)}
        onJoinCodeChange={(s) => { setJoinCode(s); setJoinError(""); }}
        onJoinByCode={handleJoinCommunity}
        onJoinBySearch={handleJoinBySearch}
        onRequestToJoin={handleRequestToJoin}
        onCancelRequest={handleCancelRequest}
        onCreateClick={() => { closeJoinModal(); setShowCreateModal(true); }}
      />

      <CreateCommunityModal
        open={showCreateModal}
        createName={createName}
        createDescription={createDescription}
        createPickupAddress={createPickupAddress}
        createNeighborhood={createNeighborhood}
        createZipCode={createZipCode}
        createIsPublic={createIsPublic}
        createImagePreview={createImagePreview}
        createError={createError}
        isCreating={isCreating}
        createImageRef={createImageRef}
        setCreateName={setCreateName}
        setCreateDescription={setCreateDescription}
        setCreatePickupAddress={setCreatePickupAddress}
        setCreateNeighborhood={setCreateNeighborhood}
        setCreateZipCode={setCreateZipCode}
        setCreateIsPublic={setCreateIsPublic}
        onImageSelect={handleCreateImageSelect}
        onClose={() => { setShowCreateModal(false); resetCreateForm(); }}
        onCreate={handleCreateCommunity}
      />

      <ShareCommunityModal
        open={showConfirmModal}
        createdCommunity={createdCommunity}
        friendSearch={friendSearch}
        friendResults={friendResults}
        selectedFriends={selectedFriends}
        isSearching={isSearching}
        isInviting={isInviting}
        copiedConfirm={copiedConfirm}
        onClose={closeShareModal}
        onCopyCode={copyConfirmCode}
        onSearchChange={handleFriendSearch}
        onAddFriend={addFriend}
        onRemoveFriend={removeFriend}
        onInvite={handleInviteFriends}
        onShareSMS={shareViaSMS}
        onShareInstagram={shareViaInstagram}
      />

      <EditProfileModal
        open={showEditProfileModal}
        editFirstName={editFirstName}
        editLastName={editLastName}
        editPickupAddress={editPickupAddress}
        editNeighborhood={editNeighborhood}
        editZipCode={editZipCode}
        editShowSuggestions={editShowSuggestions}
        editFilteredNeighborhoods={editFilteredNeighborhoods}
        editIsValidNeighborhood={editIsValidNeighborhood}
        editProfileError={editProfileError}
        isUpdatingProfile={isUpdatingProfile}
        isLoadingNeighborhoods={isLoadingNeighborhoodsList}
        neighborhoodsError={neighborhoodsListError}
        editNeighborhoodRef={editNeighborhoodRef}
        editSuggestionsRef={editSuggestionsRef}
        setEditFirstName={setEditFirstName}
        setEditLastName={setEditLastName}
        setEditPickupAddress={setEditPickupAddress}
        setEditNeighborhood={setEditNeighborhood}
        setEditZipCode={setEditZipCode}
        setEditShowSuggestions={setEditShowSuggestions}
        onClose={() => setShowEditProfileModal(false)}
        onSubmit={handleUpdateProfile}
      />

      {showNeighborhoodChangeConfirm && (
        <ModalShell open onClose={handleCancelNeighborhoodChange} z={60}>
          <div className="bg-canvas border border-hairline rounded-md max-w-md w-full mx-4 p-6 shadow-overlay">
            <h3 className="text-base font-semibold text-ink mb-2">Change neighborhood?</h3>
            <p className="text-sm text-body leading-relaxed">
              You'll leave the <strong>{user?.neighborhood ?? "—"}</strong> community
              and join <strong>{editNeighborhood}</strong>. Your existing listings
              stay tagged to {user?.neighborhood ?? "your previous neighborhood"}.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={handleCancelNeighborhoodChange}
                className={`h-9 px-4 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-sm font-semibold ${FOCUS_RING}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNeighborhoodChange}
                disabled={isUpdatingProfile}
                className={`h-9 px-4 rounded-md bg-primary text-on-primary hover:bg-primary-hover text-sm font-semibold disabled:opacity-50 ${FOCUS_RING}`}
              >
                {isUpdatingProfile ? <Loader2 className="size-4 animate-spin" /> : "Confirm"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      <AddFriendsModal
        open={showAddFriendsModal}
        addFriendsTab={addFriendsTab}
        addFriendsSearch={addFriendsSearch}
        addFriendsResults={addFriendsResults}
        recommendedFriends={recommendedFriends}
        isAddFriendsSearching={isAddFriendsSearching}
        isLoadingRecommended={isLoadingRecommended}
        addingFriendId={addingFriendId}
        onClose={closeAddFriendsModal}
        onSearchChange={handleAddFriendsSearch}
        onTabChange={setAddFriendsTab}
        onAddFriend={handleAddFriend}
        onViewUser={onViewUser}
      />

      <FriendsListModal
        open={showFriendsModal}
        friendsList={friendsList}
        isLoading={isLoadingFriends}
        removingFriendId={removingFriendId}
        onClose={() => setShowFriendsModal(false)}
        onViewUser={onViewUser}
        onRemoveFriend={handleRemoveFriend}
      />

      <RemoveListingConfirmModal
        open={removingListing != null}
        listing={
          removingListing
            ? {
                id: removingListing.id,
                brand: removingListing.brand ?? null,
                name: removingListing.name ?? null,
                imageUrl: removingListing.imageUrl ?? null,
              }
            : null
        }
        pendingOrderCount={
          removingListing
            ? mySellerOrders.filter(
                (o) =>
                  o.listing_id === removingListing.id &&
                  o.status !== "completed" &&
                  o.status !== "declined" &&
                  o.status !== "withdrawn" &&
                  o.status !== "expired" &&
                  o.status !== "cancelled_by_seller",
              ).length
            : 0
        }
        isRemoving={isRemoving}
        onClose={closeRemoveListing}
        onConfirm={handleConfirmRemoveListing}
      />

      {/* Community Detail Modal — inline (preserved). Color tokens updated. */}
      {showCommunityDetail && selectedCommunity && (
        <ModalShell
          open
          onClose={() => { setShowCommunityDetail(false); setIsEditingCommunity(false); setShowDeleteConfirm(false); }}
          z={50}
        >
          <div className="relative border border-hairline rounded-md p-6 max-w-md w-full mx-4 shadow-overlay max-h-[85vh] flex flex-col bg-canvas">
            <button
              onClick={() => { setShowCommunityDetail(false); setIsEditingCommunity(false); setShowDeleteConfirm(false); }}
              className={`absolute top-4 right-4 text-muted hover:text-ink transition-colors ${FOCUS_RING}`}
              aria-label="Close"
            >
              <X className="size-5" />
            </button>

            {showDeleteConfirm && (
              <div className="absolute inset-0 z-10 rounded-md flex items-center justify-center bg-canvas/95">
                <div className="text-center px-6">
                  <div className="size-12 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="size-6 text-error" />
                  </div>
                  <h3 className={`text-lg ${MODAL_TITLE} mb-2`}>Delete community</h3>
                  <p className="text-sm text-muted mb-6">
                    Are you sure you want to delete <span className="text-ink font-semibold">{selectedCommunity.name}</span>? This action cannot be undone and all members will be removed.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className={`flex-1 h-9 px-4 rounded-md border border-border-strong text-sm font-semibold text-ink bg-canvas hover:bg-surface-soft transition-colors ${FOCUS_RING}`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteCommunity}
                      disabled={isDeletingCommunity}
                      className={`flex-1 h-9 px-4 rounded-md bg-error text-on-primary text-sm font-semibold hover:bg-error/90 transition-colors disabled:opacity-50 ${FOCUS_RING}`}
                    >
                      {isDeletingCommunity ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isEditingCommunity ? (
              <>
                <div className="flex items-center gap-3 mb-5">
                  <Pencil className="size-5 text-primary" />
                  <h3 className={`text-lg ${MODAL_TITLE}`}>Edit community</h3>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
                  {selectedCommunity.created_by === user?.id && (
                    <div className="flex items-center gap-4">
                      <div className="size-20 rounded-full bg-surface-soft border border-hairline flex items-center justify-center overflow-hidden shrink-0">
                        {editCommunityImagePreview ? (
                          <img src={editCommunityImagePreview} alt="" className="size-full object-cover" />
                        ) : selectedCommunity.image ? (
                          <ListingImage src={selectedCommunity.image} alt={selectedCommunity.name} size="small" className="size-full object-cover" />
                        ) : (
                          <span className="text-base font-semibold text-muted">
                            {selectedCommunity.name.trim().charAt(0).toUpperCase() || "?"}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <input
                          ref={editCommunityImageInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleEditCommunityImageChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => editCommunityImageInputRef.current?.click()}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border-strong text-xs font-semibold text-ink bg-canvas hover:bg-surface-soft transition-colors ${FOCUS_RING}`}
                        >
                          <ImagePlus className="size-3.5" />
                          {editCommunityImageFile ? "Replace photo" : "Change photo"}
                        </button>
                        {editCommunityImageFile && (
                          <button
                            type="button"
                            onClick={clearEditCommunityImage}
                            className={`text-[11px] text-muted hover:text-ink text-left ${FOCUS_RING} rounded`}
                          >
                            Discard
                          </button>
                        )}
                        <p className="text-[11px] text-muted">Up to 5 MB. JPG, PNG, or WebP.</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-muted mb-1 block">Name</label>
                    <Input value={editCommunityName} onChange={(e) => setEditCommunityName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Description</label>
                    <textarea
                      value={editCommunityDescription}
                      onChange={(e) => setEditCommunityDescription(e.target.value)}
                      rows={3}
                      className={`w-full rounded-md bg-canvas border border-hairline text-ink text-sm px-3 py-2 resize-none ${FOCUS_RING}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Pickup address</label>
                    <Input value={editCommunityPickupAddress} onChange={(e) => setEditCommunityPickupAddress(e.target.value)} placeholder="Street address" />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Neighborhood</label>
                    <Input ref={editCommunityNeighborhoodRef} value={editCommunityNeighborhood} onChange={(e) => setEditCommunityNeighborhood(e.target.value)} placeholder="e.g., Upper West Side" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted mb-1 block">City</label>
                      <Input value="New York" disabled />
                    </div>
                    <div>
                      <label className="text-xs text-muted mb-1 block">State</label>
                      <Input value="NY" disabled />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Zip code</label>
                    <Input
                      value={editCommunityZipCode}
                      onChange={(e) => setEditCommunityZipCode(e.target.value.replace(/[^\d-]/g, "").slice(0, 10))}
                      placeholder="e.g., 10001"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-body">
                      {editCommunityIsPublic ? <Unlock className="size-4 text-primary" /> : <Lock className="size-4 text-warning" />}
                      {editCommunityIsPublic ? "Public" : "Private"}
                    </div>
                    <ToggleSwitch
                      checked={editCommunityIsPublic}
                      onChange={(v) => setEditCommunityIsPublic(v)}
                      label="Public community"
                    />
                  </div>
                  <div className="pt-4 border-t border-hairline">
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className={`inline-flex items-center gap-2 text-sm text-error hover:underline ${FOCUS_RING} rounded`}
                    >
                      <Trash2 className="size-4" />
                      Delete community
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setIsEditingCommunity(false)}
                    className={`flex-1 h-9 px-4 rounded-md border border-border-strong text-sm font-semibold text-ink bg-canvas hover:bg-surface-soft transition-colors ${FOCUS_RING}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCommunity}
                    disabled={isSavingCommunity || !editCommunityName.trim()}
                    className={`flex-1 h-9 px-4 rounded-md bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    {isSavingCommunity ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        {editCommunityImageFile ? "Uploading…" : ""}
                      </span>
                    ) : (
                      "Save"
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-5 pr-8">
                  <div className="size-12 rounded-md bg-surface-soft border border-hairline flex items-center justify-center overflow-hidden shrink-0">
                    {selectedCommunity.image ? (
                      <ListingImage src={selectedCommunity.image} alt={selectedCommunity.name} size="small" className="size-full object-cover rounded-md" />
                    ) : (
                      <Globe className="size-6 text-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-lg truncate ${MODAL_TITLE}`}>{selectedCommunity.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                      {selectedCommunity.neighborhood && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {selectedCommunity.neighborhood}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3" />
                        {selectedCommunity.member_count} members
                      </span>
                    </div>
                  </div>
                </div>

                {selectedCommunity.description && (
                  <p className="text-sm text-body mb-4">{selectedCommunity.description}</p>
                )}

                <div className="flex items-center gap-2 bg-surface-soft rounded-md px-3 py-2 mb-4">
                  <span className="text-xs text-muted">Invite code:</span>
                  <span className="text-xs text-ink font-mono tracking-wider">{selectedCommunity.invite_code}</span>
                  <Tooltip content="Copy invite code">
                    <button
                      onClick={() => navigator.clipboard.writeText(selectedCommunity.invite_code)}
                      className={`ml-auto text-muted hover:text-ink transition-colors ${FOCUS_RING} rounded`}
                      aria-label="Copy invite code"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </Tooltip>
                </div>

                <div className="mb-4">
                  <h4 className="text-xs text-muted mb-2">Members</h4>
                  <div className="max-h-48 overflow-y-auto">
                    {isLoadingMembers ? (
                      <div className="flex justify-center py-6"><Loader2 className="size-5 text-muted animate-spin" /></div>
                    ) : (
                      <div className="space-y-1">
                        {communityMembers.map((member) => (
                          <div key={member.id} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-soft transition-colors">
                            <button
                              onClick={() => onViewUser?.(member.id)}
                              className={`flex items-center gap-3 flex-1 min-w-0 text-left ${FOCUS_RING} rounded`}
                            >
                              <div className="size-8 rounded-full bg-surface-soft border border-hairline flex items-center justify-center overflow-hidden shrink-0">
                                {member.profile_picture ? <img src={member.profile_picture} alt="" className="size-full object-cover" /> : <User className="size-3.5 text-muted" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-ink truncate">{member.display_name}</p>
                                {member.neighborhood && <p className="text-[11px] text-muted truncate">{member.neighborhood}</p>}
                              </div>
                            </button>
                            {member.role === "owner" ? (
                              <span className="text-[10px] text-primary bg-primary-soft px-1.5 py-0.5 rounded-full border border-primary/20">Creator</span>
                            ) : selectedCommunity.created_by === user?.id ? (
                              <Tooltip content="Remove member">
                                <button
                                  onClick={() => handleKickMember(selectedCommunity.id, member.id)}
                                  disabled={kickingMemberId === member.id}
                                  className={`text-[10px] text-error/70 hover:text-error px-1.5 py-0.5 rounded-full hover:bg-error/10 transition-colors shrink-0 ${FOCUS_RING}`}
                                  aria-label="Remove member"
                                >
                                  {kickingMemberId === member.id ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                                </button>
                              </Tooltip>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {!selectedCommunity.is_public && selectedCommunity.created_by === user?.id && (
                  <div className="mb-4">
                    <h4 className="text-xs text-muted mb-2">
                      Pending requests
                      {pendingRequests.length > 0 && (
                        <span className="ml-1.5 text-warning bg-warning/10 px-1.5 py-0.5 rounded-full text-[10px] normal-case">{pendingRequests.length}</span>
                      )}
                    </h4>
                    {isLoadingRequests ? (
                      <div className="flex justify-center py-4"><Loader2 className="size-4 text-muted animate-spin" /></div>
                    ) : pendingRequests.length === 0 ? (
                      <p className="text-xs text-muted py-3 text-center">No pending requests</p>
                    ) : (
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {pendingRequests.map((req) => (
                          <div key={req.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-surface-soft border border-hairline">
                            <button
                              onClick={() => onViewUser?.(req.user_id)}
                              className={`flex items-center gap-3 flex-1 min-w-0 text-left ${FOCUS_RING} rounded`}
                            >
                              <div className="size-8 rounded-full bg-canvas border border-hairline flex items-center justify-center overflow-hidden shrink-0">
                                {req.profile_picture ? <img src={req.profile_picture} alt="" className="size-full object-cover" /> : <User className="size-3.5 text-muted" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-ink truncate">{req.display_name}</p>
                                {req.neighborhood && <p className="text-[11px] text-muted truncate">{req.neighborhood}</p>}
                              </div>
                            </button>
                            <div className="flex gap-1.5 shrink-0">
                              <button
                                onClick={() => handleAcceptRequest(selectedCommunity.id, req.id)}
                                disabled={acceptingRequestId === req.id}
                                className={`text-[10px] text-primary bg-primary-soft px-2 py-1 rounded-full border border-primary/20 hover:bg-primary-tint transition-colors disabled:opacity-50 ${FOCUS_RING}`}
                              >
                                {acceptingRequestId === req.id ? <Loader2 className="size-3 animate-spin" /> : "Accept"}
                              </button>
                              <button
                                onClick={() => handleRejectRequest(selectedCommunity.id, req.id)}
                                disabled={rejectingRequestId === req.id}
                                className={`text-[10px] text-error bg-error/10 px-2 py-1 rounded-full border border-error/20 hover:bg-error/20 transition-colors disabled:opacity-50 ${FOCUS_RING}`}
                              >
                                {rejectingRequestId === req.id ? <Loader2 className="size-3 animate-spin" /> : "Reject"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 mt-auto pt-4 border-t border-hairline">
                  <button
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); shareCommunity(selectedCommunity); }}
                    className={`flex-1 h-9 px-4 rounded-md border border-border-strong text-sm font-semibold text-ink bg-canvas hover:bg-surface-soft transition-colors inline-flex items-center justify-center gap-2 ${FOCUS_RING}`}
                  >
                    <Send className="size-4" />
                    Share
                  </button>
                  {selectedCommunity.created_by === user?.id ? (
                    <button
                      onClick={startEditCommunity}
                      className={`flex-1 h-9 px-4 rounded-md bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors inline-flex items-center justify-center gap-2 ${FOCUS_RING}`}
                    >
                      <Pencil className="size-4" />
                      Edit
                    </button>
                  ) : (
                    <button
                      onClick={handleLeaveCommunity}
                      disabled={isLeavingCommunity}
                      className={`flex-1 h-9 px-4 rounded-md border border-error/40 text-sm font-semibold text-error bg-canvas hover:bg-error/5 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 ${FOCUS_RING}`}
                    >
                      {isLeavingCommunity ? <Loader2 className="size-4 animate-spin" /> : <><LogOut className="size-4" />Leave</>}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </ModalShell>
      )}

      {editListing && (
        <EditListingModal
          open
          onClose={() => setEditListing(null)}
          listing={editListing}
          location={user?.neighborhood || editListing.location || ""}
          onSave={handleSaveListing}
          categorySchemas={categorySchemas}
        />
      )}

      {/* OrderConfirmSummaryModal + PickupAttestationModal + RatingModal +
          OrderManagementModal (R-5.7.3) all render at App-level via
          OrderModalsProvider so notification clicks open them in place
          without routing to /account. See contexts/OrderModalsContext.tsx. */}

    </section>
  );
}

// ── Reusable: Toggle switch ─────────────────────────────────
function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors motion-safe:duration-150 ${FOCUS_RING} ${checked ? "bg-primary" : "bg-surface-strong"}`}
    >
      <span
        className={`inline-block size-5 transform rounded-full bg-canvas shadow-card transition-transform motion-safe:duration-150 ${checked ? "translate-x-5" : "translate-x-0.5"}`}
      />
    </button>
  );
}

// ── Overview: Communities row (circular tiles) ─────────────
function communityInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "··";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return trimmed.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const COMM_TILE_BTN =
  `flex flex-col items-center gap-1.5 w-[72px] rounded-md ${FOCUS_RING}`;
const COMM_TILE_LABEL =
  "text-[11px] leading-tight text-center truncate w-full text-ink";

function OverviewCommunitiesRow({
  communities,
  communitiesLoaded,
  openCommunityDetail,
  openJoinModal,
}: {
  communities: CommunityData[];
  communitiesLoaded: boolean;
  openCommunityDetail: (c: CommunityData) => void;
  openJoinModal: () => void;
}) {
  const VISIBLE = 6;
  const visible = communities.slice(0, VISIBLE);
  const extra = communities.slice(VISIBLE);
  const [moreOpen, setMoreOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  useClickOutside(popoverRef, () => setMoreOpen(false), moreOpen);

  const isEmpty = communities.length === 0;

  return (
    <section
      aria-label="Your communities"
      className="bg-canvas border border-hairline rounded-md p-4"
    >
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className={`text-base ${PANEL_TITLE}`}>
          Communities
          {!isEmpty && communitiesLoaded && (
            <span className="text-muted font-normal text-sm ml-1.5">({communities.length})</span>
          )}
        </h3>
      </div>

      {!communitiesLoaded ? (
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="size-14 rounded-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {visible.map((c) => (
              <Tooltip key={c.id} content={c.name}>
                <button
                  type="button"
                  onClick={() => openCommunityDetail(c)}
                  aria-label={c.name}
                  className={COMM_TILE_BTN}
                >
                  <span className="size-14 rounded-full bg-surface-card border border-hairline hover:border-border-strong flex items-center justify-center overflow-hidden text-sm font-medium text-ink transition-colors">
                    {c.image ? (
                      <ListingImage src={c.image} alt="" size="small" className="size-full object-cover" />
                    ) : (
                      communityInitials(c.name)
                    )}
                  </span>
                  <span className={COMM_TILE_LABEL}>
                    {c.name.split(" ").slice(0, 2).join(" ")}
                  </span>
                </button>
              </Tooltip>
            ))}

            {extra.length > 0 && (
              <div ref={popoverRef} className="relative inline-block">
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((v) => !v)}
                  className={COMM_TILE_BTN}
                >
                  <span className="size-14 rounded-full flex items-center justify-center border border-dashed border-hairline bg-surface-soft text-muted text-lg">
                    …
                  </span>
                  <span className={COMM_TILE_LABEL}>More</span>
                </button>
                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute top-full left-0 mt-2 z-30 min-w-[240px] bg-surface-card border border-hairline rounded-md p-1.5 shadow-overlay"
                  >
                    <div className="text-[11px] font-semibold text-muted px-2.5 pt-1.5 pb-1">
                      More communities
                    </div>
                    {extra.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setMoreOpen(false);
                          openCommunityDetail(c);
                        }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-sm text-ink hover:bg-surface-soft text-left ${FOCUS_RING}`}
                      >
                        <span className="size-7 rounded-full bg-surface-strong border border-hairline flex items-center justify-center overflow-hidden text-[11px] font-medium text-ink shrink-0">
                          {c.image ? (
                            <ListingImage src={c.image} alt="" size="small" className="size-full object-cover" />
                          ) : (
                            communityInitials(c.name)
                          )}
                        </span>
                        <span className="truncate">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Tooltip content="Join or create a community">
              <button
                type="button"
                onClick={openJoinModal}
                aria-label="Join or create a community"
                className={COMM_TILE_BTN}
              >
                <span className="size-14 rounded-full flex items-center justify-center border border-dashed border-border-strong bg-canvas text-muted hover:text-primary hover:border-primary transition-colors">
                  <Plus className="size-5" aria-hidden="true" />
                </span>
                {/* Wrap onto two lines when the tile is narrow — single-line
                    "Join Community" was truncating with the COMM_TILE_LABEL
                    72px tile width. */}
                <span className="text-[11px] leading-tight text-center whitespace-normal w-full text-ink">
                  Join Community
                </span>
              </button>
            </Tooltip>
          </div>

          {isEmpty && (
            <p className="text-xs text-muted mt-2">
              Join a community to surface trust signals on your listings.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ── Selling row priority (for action-urgency sort) ──────────
function getSellingRowPriority(
  listing: MyListing,
  mySellerOrders: OrderData[],
  getListingTimeInfo: (postedAt: number) => { expired: boolean; label: string },
  getPickupCountdown: (o: OrderData) => { expired: boolean; label: string; diff: number },
): number {
  const timeInfo = getListingTimeInfo(listing.postedAt);
  const sellerOrder = mySellerOrders.find((o) => o.listing_id === listing.id && (o.status === "confirmed" || o.status === "completed"));
  const sellerCountdown = sellerOrder ? getPickupCountdown(sellerOrder) : null;
  const sellerReviewed = sellerOrder?.seller_reviewed ?? false;
  const buyerReviewed = sellerOrder?.buyer_reviewed ?? false;
  const hasPendingOrders = (listing.pendingOrderCount ?? 0) > 0;

  if (sellerOrder?.status === "completed") return 5;
  if (timeInfo.expired) return 5;
  if (sellerOrder?.status === "confirmed" && sellerCountdown?.expired && !sellerReviewed) return 0; // pickup ready
  if (sellerOrder?.status === "confirmed" && sellerCountdown && !sellerCountdown.expired) return 1; // countdown
  if (hasPendingOrders) return 2; // pending offers
  if (sellerOrder?.status === "confirmed" && sellerCountdown?.expired && sellerReviewed && !buyerReviewed) return 3; // awaiting buyer
  return 4; // live
}

// ── Overview: Your Listings Panel ───────────────────────────
function OverviewListingsPanel({
  listingsTab,
  setListingsTab,
  myListings,
  myPurchases,
  mySellerOrders,
  isLoadingMyListings,
  isLoadingMyOrders,
  openEditListing,
  openOrderModal,
  openConfirmedOrderSummary,
  openRatingModal,
  openListingDetail,
  getListingTimeInfo,
  getPickupCountdown,
  onNavigate,
}: {
  listingsTab: "selling" | "buying";
  setListingsTab: (t: "selling" | "buying") => void;
  myListings: MyListing[];
  myPurchases: OrderData[];
  mySellerOrders: OrderData[];
  isLoadingMyListings: boolean;
  isLoadingMyOrders: boolean;
  openEditListing: (l: MyListing) => void;
  openOrderModal: (l: MyListing) => void;
  openConfirmedOrderSummary: (id: string) => void;
  openRatingModal: (o: OrderData) => void;
  openListingDetail?: (l: Listing) => void;
  getListingTimeInfo: (postedAt: number) => { expired: boolean; label: string };
  getPickupCountdown: (o: OrderData) => { expired: boolean; label: string; diff: number };
  onNavigate: (page: string) => void;
}) {
  const sellingRows = [...myListings].sort((a, b) => {
    const pa = getSellingRowPriority(a, mySellerOrders, getListingTimeInfo, getPickupCountdown);
    const pb = getSellingRowPriority(b, mySellerOrders, getListingTimeInfo, getPickupCountdown);
    if (pa !== pb) return pa - pb; // lower priority number = higher in list
    const aTime = a.latestOrderAt || "";
    const bTime = b.latestOrderAt || "";
    if (aTime !== bTime) return bTime > aTime ? 1 : -1;
    return 0;
  });

  return (
    <div className="bg-canvas border border-hairline rounded-md p-6 h-[560px] overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <h3 className={`text-base ${PANEL_TITLE}`}>Your listings</h3>
        <div role="tablist" aria-label="Selling or buying" className="inline-flex items-center gap-1 bg-surface-soft p-1 rounded-md">
          {(["selling", "buying"] as const).map((side) => {
            const active = listingsTab === side;
            return (
              <button
                key={side}
                role="tab"
                aria-selected={active}
                onClick={() => setListingsTab(side)}
                className={`${SEG_BTN_BASE} ${active ? "bg-canvas text-ink shadow-card" : "text-muted hover:text-ink"}`}
              >
                {side === "selling" ? "Selling" : "Buying"}
              </button>
            );
          })}
        </div>
      </div>

      {listingsTab === "selling" ? (
        isLoadingMyListings && myListings.length === 0 ? (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 gap-y-0 text-[11px] text-muted pb-2 border-b border-hairline">
              <span>Item</span>
              <span>Price</span>
              <span>Status</span>
            </div>
            {Array.from({ length: 4 }).map((_, i) => <ListingRowSkeleton key={i} />)}
          </div>
        ) : myListings.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <p className="text-sm text-muted mb-4">No listings yet</p>
            <button
              onClick={() => onNavigate("newlisting")}
              className={`inline-flex items-center justify-center h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
            >
              Create listing
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* 3-col grid: Item (with community subtitle) / Price / Status.
                Each value gets its own cell — no flex wrapper. Min-widths on
                Price and Status lock the Status column's left edge at the same
                x-position across all rows regardless of pill content length.
                Identical to the Buying table below so the two read as one
                visual system. */}
            <div className="grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 gap-y-0 text-[11px] text-muted pb-2 border-b border-hairline">
              <span>Item</span>
              <span>Price</span>
              <span>Status</span>
            </div>
            <div>
              {sellingRows.map((listing) => {
                const timeInfo = getListingTimeInfo(listing.postedAt);
                const hasPendingOrders = (listing.pendingOrderCount ?? 0) > 0;
                const sellerOrder = mySellerOrders.find((o) => o.listing_id === listing.id && (o.status === "confirmed" || o.status === "completed"));
                const sellerCountdown = sellerOrder ? getPickupCountdown(sellerOrder) : null;
                const sellerHasReviewed = sellerOrder?.seller_reviewed ?? false;
                const buyerHasReviewed = sellerOrder?.buyer_reviewed ?? false;
                const isSellerPickupReady = sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && !sellerHasReviewed;
                const isSellerWaitingForBuyer = sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && sellerHasReviewed && !buyerHasReviewed;
                const isCompleted = sellerOrder?.status === "completed";
                const cta = getSellerListingCtaState({
                  timeExpired: timeInfo.expired,
                  isSellerWaitingForBuyer: !!isSellerWaitingForBuyer,
                  isSellerPickupReady: !!isSellerPickupReady,
                  sellerOrderStatus: sellerOrder?.status ?? null,
                  hasPendingOrders,
                });

                // Confirmed-and-still-ticking state renders the countdown label
                // as text ("Pickup in Xh Ym"). Other states keep their existing labels.
                const isConfirmedTicking = sellerOrder?.status === "confirmed" && sellerCountdown && !sellerCountdown.expired;

                const statusLabel = listing.status === "draft"
                  ? "Draft"
                  : listing.status === "sold"
                    ? "Sold"
                    : isCompleted
                      ? "Completed"
                      : isSellerPickupReady
                        ? "Pickup ready"
                        : isSellerWaitingForBuyer
                          ? "Awaiting buyer"
                          : isConfirmedTicking
                            ? `Pickup in ${sellerCountdown.label}`
                            : hasPendingOrders
                              ? `${listing.pendingOrderCount} offers`
                              : timeInfo.expired
                                ? "Expired"
                                : "Live";

                // Terminal states (expired / completed / sold) open the
                // product details modal. Awaiting-buyer falls through to the
                // confirmed-order summary via the existing `sellerOrder`
                // branch. Every row is clickable now.
                const isTerminal = timeInfo.expired || isCompleted || listing.status === "sold";

                return (
                  <button
                    key={listing.id}
                    onClick={() => {
                      if (isTerminal) {
                        openListingDetail?.(listing as Listing);
                        return;
                      }
                      if (isSellerPickupReady && sellerOrder) openRatingModal(sellerOrder);
                      else if (hasPendingOrders) openOrderModal(listing);
                      else if (sellerOrder) openConfirmedOrderSummary(listing.id);
                      else openEditListing(listing);
                    }}
                    className={`w-full grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 items-center py-3 border-b border-hairline-soft text-left transition-colors cursor-pointer hover:bg-surface-soft ${FOCUS_RING}`}
                  >
                    {/* Item cell — thumb + community subtitle (muted) above title. */}
                    <div className="flex items-center gap-3 min-w-0">
                      <ListingImage src={listing.imageUrl} alt="" size="small" className="size-10 rounded-md object-cover border border-hairline shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted truncate">{PLACEHOLDER_COMMUNITY.name}</p>
                        <p className="text-sm font-semibold text-ink truncate">{formatTitle(listing.brand, listing.name)}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-ink tabular-nums">${listing.price}</span>
                    <span className={`justify-self-start text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
                      statusLabel === "Draft" || statusLabel === "Sold" || statusLabel === "Completed" || statusLabel === "Expired"
                        ? "bg-surface-strong text-muted"
                        : statusLabel === "Awaiting buyer"
                          ? "bg-warning-soft text-warning"
                          : "bg-primary-soft text-primary"
                    }`}>
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {statusLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      ) : (
        isLoadingMyOrders && myPurchases.length === 0 ? (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 gap-y-0 text-[11px] text-muted pb-2 border-b border-hairline">
              <span>Item</span>
              <span>Price</span>
              <span>Status</span>
            </div>
            {Array.from({ length: 4 }).map((_, i) => <ListingRowSkeleton key={i} />)}
          </div>
        ) : myPurchases.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <p className="text-sm text-muted mb-4">No purchases yet</p>
            <button
              onClick={() => onNavigate("market")}
              className={`inline-flex items-center justify-center h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
            >
              Browse market
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* 3-col grid: Item (with community subtitle) / Price / Status —
                identical template to the Selling table above. */}
            <div className="grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 gap-y-0 text-[11px] text-muted pb-2 border-b border-hairline">
              <span>Item</span>
              <span>Price</span>
              <span>Status</span>
            </div>
            <div>
              {myPurchases.map((order) => {
                const countdown = getPickupCountdown(order);
                const viewState = getBuyerOrderViewState({
                  status: order.status,
                  countdownExpired: countdown.expired,
                  hasReviewed: order.buyer_reviewed,
                  otherReviewed: order.seller_reviewed,
                });
                const isConfirmedTicking = viewState === "confirmedCountdown";
                const statusLabel = viewState === "declined" ? "Declined"
                  : viewState === "withdrawn" ? "Withdrawn"
                  : viewState === "expired" ? "Expired"
                  : viewState === "cancelledBySeller" ? "Cancelled by seller"
                  : viewState === "waitingForOther" ? "Awaiting seller"
                  : viewState === "pickupReady" ? "Pickup ready"
                  : isConfirmedTicking ? `Pickup in ${countdown.label}`
                  : order.status === "completed" ? "Completed"
                  : "Pending";
                const isClickable = !(viewState === "declined" || viewState === "withdrawn" || viewState === "expired" || viewState === "cancelledBySeller" || viewState === "waitingForOther");
                return (
                  <button
                    key={order.id}
                    onClick={() => {
                      if (!isClickable) return;
                      if (viewState === "pickupReady") openRatingModal(order);
                      else if (order.status === "confirmed") openConfirmedOrderSummary(order.listing_id);
                    }}
                    disabled={!isClickable}
                    className={`w-full grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 items-center py-3 border-b border-hairline-soft text-left transition-colors ${FOCUS_RING} ${isClickable ? "hover:bg-surface-soft cursor-pointer" : "cursor-default"}`}
                  >
                    {/* Item cell — thumb + community subtitle above title.
                        Seller @handle no longer rendered in the table; still
                        available via the order summary modal. */}
                    <div className="flex items-center gap-3 min-w-0">
                      <ListingImage src={order.listing_image} alt="" size="small" className="size-10 rounded-md object-cover border border-hairline shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted truncate">{PLACEHOLDER_COMMUNITY.name}</p>
                        <p className="text-sm font-semibold text-ink truncate">{order.listing_title}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-primary tabular-nums">${order.listing_price}</span>
                    <span className={`justify-self-start text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
                      viewState === "declined" || viewState === "withdrawn" || viewState === "expired" || order.status === "completed"
                        ? "bg-surface-strong text-muted"
                        : viewState === "cancelledBySeller" || viewState === "waitingForOther"
                          ? "bg-warning-soft text-warning"
                          : "bg-primary-soft text-primary"
                    }`}>
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {statusLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ── Overview: Punchlist Panel ───────────────────────────────
function PunchlistPanel({
  punchlist,
  punchlistLoaded,
  openOrderModal,
  openEditListing,
  openRatingModal,
  openConfirmedOrderSummary,
  mySellerOrders,
  myPurchases,
}: {
  punchlist: PunchlistResponse | null;
  punchlistLoaded: boolean;
  openOrderModal: (l: MyListing) => void;
  openEditListing: (l: MyListing) => void;
  openRatingModal: (o: OrderData) => void;
  openConfirmedOrderSummary: (listingId: string) => void;
  mySellerOrders: OrderData[];
  myPurchases: OrderData[];
}) {
  // Each cat entry uses a typed discriminated union so the render loop can
  // dispatch without `any`. Pickups carry PunchlistPickup items; offers and
  // drafts carry MyListing items; messages carry unknown[].
  type PickupCat = {
    id: "pickups";
    label: string;
    icon: ComponentType<{ className?: string }>;
    items: PunchlistPickup[];
    cta: string;
    onAction: (item: PunchlistPickup) => void;
  };
  type ListingCat = {
    id: "offers" | "drafts";
    label: string;
    icon: ComponentType<{ className?: string }>;
    items: MyListing[];
    cta: string;
    onAction: (item: MyListing) => void;
  };
  type MessageCat = {
    id: "messages";
    label: string;
    icon: ComponentType<{ className?: string }>;
    items: unknown[];
    cta: string;
    onAction: () => void;
  };
  type PunchCat = PickupCat | ListingCat | MessageCat;

  const cats: PunchCat[] = [
    {
      id: "pickups",
      label: "Confirm pickups",
      icon: CalendarCheck,
      items: punchlist?.pickups_to_confirm ?? [],
      cta: "Confirm slot",
      onAction: (item: PunchlistPickup) => {
        // Disabled until slot passes — both roles.
        if (!item.pickup_expired) return;

        if (item.role === "seller") {
          const order = mySellerOrders.find((o) => o.id === item.order_id);
          if (order) openRatingModal(order);
          return;
        }
        // Buyer side
        const order = myPurchases.find((o) => o.id === item.order_id);
        if (order) openRatingModal(order);
      },
    },
    {
      id: "offers",
      label: "Review offers",
      icon: Coins,
      items: punchlist?.offers_to_review ?? [],
      cta: "Review offer",
      onAction: (item: MyListing) => openOrderModal(item),
    },
    {
      id: "messages",
      label: "Respond to messages",
      icon: MessageSquare,
      items: punchlist?.unread_messages ?? [],
      cta: "Open thread",
      onAction: () => {},
    },
    {
      id: "drafts",
      label: "Finish drafts",
      icon: Pencil,
      items: punchlist?.draft_listings ?? [],
      cta: "Resume draft",
      onAction: (item: MyListing) => openEditListing(item),
    },
  ];

  const totalTodo = cats.reduce((n, c) => n + c.items.length, 0);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const top = cats.reduce<PunchCat | null>((acc, c) => (c.items.length > (acc?.items.length || 0) ? c : acc), null);
    return top && top.items.length > 0 ? { [top.id]: true } : {};
  });
  useEffect(() => {
    setOpen((cur) => {
      if (Object.values(cur).some(Boolean)) return cur;
      const top = cats.reduce<PunchCat | null>((acc, c) => (c.items.length > (acc?.items.length || 0) ? c : acc), null);
      return top && top.items.length > 0 ? { [top.id]: true } : cur;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punchlist]);

  const handleRowClick = (cat: { id: string }, item: unknown) => {
    if (cat.id === "pickups") {
      const pickup = item as PunchlistPickup;
      openConfirmedOrderSummary(pickup.listing_id);
      return;
    }
    if (cat.id === "offers") {
      openOrderModal(item as MyListing);
      return;
    }
    if (cat.id === "drafts") {
      openEditListing(item as MyListing);
      return;
    }
    // messages — no-op
  };

  return (
    <div className="bg-canvas border border-hairline rounded-md p-6 h-[560px] overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <h3 className={`text-base ${PANEL_TITLE}`}>Punchlist</h3>
        <span className="text-xs text-muted">{totalTodo} to do today</span>
      </div>
      <ul className="space-y-2 flex-1">
        {!punchlistLoaded
          ? Array.from({ length: 4 }).map((_, i) => <PunchlistRowSkeleton key={i} />)
          : cats.map((cat) => {
          const empty = cat.items.length === 0;
          const isOpen = !!open[cat.id] && !empty;
          const Icon = cat.icon;
          return (
            <li key={cat.id} className={`rounded-md border ${empty ? "border-hairline-soft" : "border-hairline"}`}>
              <button
                onClick={() => !empty && setOpen((o) => ({ ...o, [cat.id]: !o[cat.id] }))}
                aria-expanded={isOpen}
                disabled={empty}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${FOCUS_RING} rounded-md ${empty ? "cursor-default" : "hover:bg-surface-soft"}`}
              >
                <span className={`size-7 rounded-md flex items-center justify-center ${empty ? "bg-surface-soft text-muted-soft" : "bg-primary-soft text-primary"}`}>
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <span className={`flex-1 text-sm font-semibold ${empty ? "text-muted-soft" : "text-ink"}`}>{cat.label}</span>
                {empty ? (
                  <span className="text-[11px] text-muted-soft inline-flex items-center gap-1">
                    <Check className="size-3" aria-hidden="true" />
                    All clear
                  </span>
                ) : (
                  <>
                    <span className="text-[11px] font-semibold bg-primary text-on-primary px-2 py-0.5 rounded-full">{cat.items.length}</span>
                    <ChevronDown className={`size-4 text-muted transition-transform motion-safe:duration-150 ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </>
                )}
              </button>
              {isOpen && (
                <ul className="px-3 pb-3 space-y-2">
                  {cat.items.map((it, i) => {
                    const isPickup = cat.id === "pickups";
                    const pickup = isPickup ? (it as PunchlistPickup) : null;
                    const listing = (cat.id === "offers" || cat.id === "drafts") ? (it as MyListing) : null;
                    const itemTitle = pickup?.listing_title
                      ?? (listing ? formatTitle(listing.brand, listing.name) : "Item");
                    const itemImage = pickup?.listing_image ?? listing?.imageUrl ?? null;
                    return (
                      <li key={i} className="flex items-center gap-3 p-2 rounded-md bg-surface-soft border border-hairline-soft">
                        <button
                          type="button"
                          onClick={() => handleRowClick(cat, it)}
                          className="flex-1 flex items-center gap-3 text-left cursor-pointer hover:bg-surface-soft transition-colors rounded-md px-2 -mx-2 py-1 -my-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {itemImage && (
                            <ListingImage src={itemImage} alt="" size="small" className="size-9 rounded-md object-cover border border-hairline shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-ink leading-snug line-clamp-2">
                              {itemTitle}
                            </p>
                            {pickup?.slot && <p className="text-[11px] text-muted truncate">{pickup.slot}</p>}
                          </div>
                        </button>
                        {cat.id === "pickups" && pickup ? (
                          !pickup.pickup_expired ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex items-center justify-center h-7 px-3 rounded-md bg-surface-strong text-muted text-[11px] font-semibold cursor-not-allowed"
                            >
                              Pickup in {pickup.countdown_label}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); cat.onAction(pickup); }}
                              className={`inline-flex items-center justify-center h-7 px-3 rounded-md bg-primary text-on-primary text-[11px] font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                            >
                              Confirm pickup
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (cat.id === "offers" && listing) cat.onAction(listing);
                              else if (cat.id === "drafts" && listing) cat.onAction(listing);
                            }}
                            className={`inline-flex items-center justify-center h-7 px-3 rounded-full bg-primary text-on-primary text-[11px] font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                          >
                            {cat.cta}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Listings tab content ────────────────────────────────────
function ListingsTabContent({
  listingsTab,
  setListingsTab,
  listingsFilter,
  setListingsFilter,
  myListings,
  myPurchases,
  mySellerOrders,
  isLoadingStats,
  isLoadingMyListings,
  isLoadingMyOrders,
  sellingActiveCount,
  sellingDraftCount,
  sellingSoldCount,
  buyingActiveCount,
  buyingCompletedCount,
  buyingDeclinedCount,
  openEditListing,
  openRemoveListing,
  openOrderModal,
  openConfirmedOrderSummary,
  openRatingModal,
  openListingDetail,
  handleRelist,
  relistingId,
  getListingTimeInfo,
  getPickupCountdown,
  setShowWithdrawConfirm,
  showWithdrawConfirm,
  handleWithdrawOrder,
  withdrawingOrderId,
  onNavigate,
}: {
  listingsTab: "selling" | "buying";
  setListingsTab: (t: "selling" | "buying") => void;
  listingsFilter: string;
  setListingsFilter: (f: string) => void;
  myListings: MyListing[];
  myPurchases: OrderData[];
  mySellerOrders: OrderData[];
  isLoadingStats: boolean;
  isLoadingMyListings: boolean;
  isLoadingMyOrders: boolean;
  sellingActiveCount: number;
  sellingDraftCount: number;
  sellingSoldCount: number;
  buyingActiveCount: number;
  buyingCompletedCount: number;
  buyingDeclinedCount: number;
  openEditListing: (l: MyListing) => void;
  openRemoveListing: (l: MyListing) => void;
  openOrderModal: (l: MyListing) => void;
  openConfirmedOrderSummary: (id: string) => void;
  openRatingModal: (o: OrderData) => void;
  openListingDetail?: (l: Listing) => void;
  handleRelist: (id: string) => void;
  relistingId: string | null;
  getListingTimeInfo: (postedAt: number) => { expired: boolean; label: string };
  getPickupCountdown: (o: OrderData) => { expired: boolean; label: string; diff: number };
  setShowWithdrawConfirm: (id: number | null) => void;
  showWithdrawConfirm: number | null;
  handleWithdrawOrder: (id: number) => void;
  withdrawingOrderId: number | null;
  onNavigate: (page: string) => void;
}) {
  const sellingKpis: { label: string; value: string; sub: string }[] = [
    { label: "Active", value: String(sellingActiveCount), sub: sellingActiveCount === 1 ? "listing" : "listings" },
    { label: "Total views", value: "—", sub: "Coming soon" },
    { label: "Saved by buyers", value: "—", sub: "Coming soon" },
    { label: "Pending offers", value: "—", sub: "Coming soon" },
  ];

  const buyingKpis: { label: string; value: string; sub: string }[] = [
    { label: "Active offers", value: "—", sub: "Coming soon" },
    { label: "Pickup soon", value: String(myPurchases.filter((o) => o.status === "confirmed").length), sub: "orders" },
    { label: "Awaiting payment", value: "—", sub: "Coming soon" },
    { label: "Total committed", value: "—", sub: "Coming soon" },
  ];

  const sellingFilters: [string, string, number][] = [
    ["all", "All", myListings.length],
    ["live", "Live", sellingActiveCount],
    ["draft", "Drafts", sellingDraftCount],
    ["sold", "Sold", sellingSoldCount],
  ];

  const buyingFilters: [string, string, number][] = [
    ["all", "All", myPurchases.length],
    ["active", "Active", buyingActiveCount],
    ["completed", "Completed", buyingCompletedCount],
    ["inactive", "Inactive", buyingDeclinedCount],
  ];

  const filteredListings = myListings.filter((l) => {
    if (listingsFilter === "all") return true;
    const timeInfo = getListingTimeInfo(l.postedAt);
    if (listingsFilter === "draft") return l.status === "draft";
    if (listingsFilter === "sold") return l.status === "sold";
    if (listingsFilter === "live") return !timeInfo.expired && l.status !== "draft" && l.status !== "sold";
    return true;
  });

  const filteredPurchases = myPurchases.filter((o) => {
    if (listingsFilter === "all") return true;
    if (listingsFilter === "active") return o.status === "pending" || o.status === "confirmed";
    if (listingsFilter === "completed") return o.status === "completed";
    if (listingsFilter === "inactive") return o.status === "declined" || o.status === "withdrawn" || o.status === "expired" || o.status === "cancelled_by_seller";
    return true;
  });

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div role="tablist" aria-label="Selling or buying" className="inline-flex items-center gap-1 bg-surface-soft p-1 rounded-md">
          {(["selling", "buying"] as const).map((side) => {
            const active = listingsTab === side;
            return (
              <button
                key={side}
                role="tab"
                aria-selected={active}
                onClick={() => setListingsTab(side)}
                className={`${SEG_BTN_BASE} ${active ? "bg-canvas text-ink shadow-card" : "text-muted hover:text-ink"}`}
              >
                {side === "selling" ? "Selling" : "Buying"}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => onNavigate("newlisting")}
          className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
        >
          <Plus className="size-4" />
          New listing
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {isLoadingStats
          ? Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
          : (listingsTab === "selling" ? sellingKpis : buyingKpis).map((kpi) => (
              <div key={kpi.label} className="bg-surface-card border border-hairline rounded-md p-4">
                <p className="text-[11px] text-muted">{kpi.label}</p>
                <p className={`text-3xl font-extrabold tracking-display mt-1 ${kpi.value === "—" ? "text-muted-soft" : "text-ink"}`}>{kpi.value}</p>
                <p className={`text-[11px] mt-0.5 ${kpi.value === "—" ? "text-muted-soft" : "text-muted"}`}>{kpi.sub}</p>
              </div>
            ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {(listingsTab === "selling" ? sellingFilters : buyingFilters).map(([id, label, n]) => {
          const active = listingsFilter === id;
          return (
            <button
              key={id}
              onClick={() => setListingsFilter(id)}
              className={getChipClass(active)}
            >
              {label}
              <span className={`text-[10px] ${active ? "text-on-primary/80" : "text-muted"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {listingsTab === "selling" ? (
        isLoadingMyListings && filteredListings.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <ListingCardSkeleton key={i} />)}
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="text-center py-16 border border-hairline rounded-md bg-surface-soft">
            <p className="text-sm text-muted">Nothing in this view yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredListings.map((listing) => {
              const timeInfo = getListingTimeInfo(listing.postedAt);
              const hasPendingOrders = (listing.pendingOrderCount ?? 0) > 0;
              const sellerOrder = mySellerOrders.find((o) => o.listing_id === listing.id && (o.status === "confirmed" || o.status === "completed"));
              const sellerCountdown = sellerOrder ? getPickupCountdown(sellerOrder) : null;
              const sellerHasReviewed = sellerOrder?.seller_reviewed ?? false;
              const buyerHasReviewed = sellerOrder?.buyer_reviewed ?? false;
              const isSellerPickupReady = !!(sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && !sellerHasReviewed);
              const isSellerWaitingForBuyer = !!(sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && sellerHasReviewed && !buyerHasReviewed);
              const isCompleted = sellerOrder?.status === "completed";
              const isConfirmedTicking = !!(sellerOrder?.status === "confirmed" && sellerCountdown && !sellerCountdown.expired);

              const statusLabel = listing.status === "draft"
                ? "Draft"
                : listing.status === "sold"
                  ? "Sold"
                  : isCompleted
                    ? "Completed"
                    : isSellerPickupReady
                      ? "Pickup ready"
                      : isSellerWaitingForBuyer
                        ? "Awaiting buyer"
                        : isConfirmedTicking
                          ? `Pickup in ${sellerCountdown.label}`
                          : hasPendingOrders
                            ? `${listing.pendingOrderCount} offers`
                            : timeInfo.expired
                              ? "Expired"
                              : "Live";
              const statusClass = statusLabel === "Draft" || statusLabel === "Sold" || statusLabel === "Completed" || statusLabel === "Expired"
                ? "bg-surface-strong text-muted"
                : statusLabel === "Awaiting buyer"
                  ? "bg-warning-soft text-warning"
                  : "bg-primary-soft text-primary";

              // Cards in terminal states (expired / completed / sold) and the
              // awaiting-buyer transient state get a card-level click handler
              // routed to detail / order summary. Active states leave the
              // article without onClick — inner buttons drive the interactions.
              const isTerminal = timeInfo.expired || isCompleted || listing.status === "sold";
              const isCardClickable = isTerminal || isSellerWaitingForBuyer;
              const onCardClick = isCardClickable
                ? () => {
                    if (isSellerWaitingForBuyer && sellerOrder) {
                      openConfirmedOrderSummary(listing.id);
                      return;
                    }
                    openListingDetail?.(listing as Listing);
                  }
                : undefined;

              return (
                <article
                  key={listing.id}
                  onClick={onCardClick}
                  className={`bg-canvas border border-hairline rounded-md overflow-hidden hover:shadow-hover transition-shadow flex flex-col ${isCardClickable ? "cursor-pointer" : ""}`}
                >
                  {/* Trust band — mirrors marketplace card.
                      MyListing payload omits allCommunities; falls back to
                      PLACEHOLDER_COMMUNITY until the sell-flow community
                      selector ships. Replicated inline rather than
                      extracted to a shared <ListingCard> per R-5.9 brief. */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary-soft/60 border-b border-hairline text-xs">
                    <span className="size-3 rounded-full bg-primary shrink-0" aria-hidden="true" />
                    <span className="text-ink font-medium truncate">{PLACEHOLDER_COMMUNITY.name}</span>
                  </div>
                  <div className="relative aspect-square bg-surface-soft">
                    <ListingImage src={listing.imageUrl} alt="" size="card" className="absolute inset-0 size-full object-cover" />
                    <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${statusClass}`}>
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {statusLabel}
                    </span>
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-1">
                    <p className="text-sm font-medium text-ink line-clamp-1">{formatTitle(listing.brand, listing.name)}</p>
                    <p className="text-xs text-muted line-clamp-1">{listing.location || "—"}</p>
                    <p className="text-2xl font-extrabold text-primary tracking-display leading-none pt-1">${listing.price}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {timeInfo.expired ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRelist(listing.id); }}
                          disabled={relistingId === listing.id}
                          className={`flex-1 inline-flex items-center justify-center gap-1 h-8 px-3 rounded-md bg-primary-soft text-primary text-xs font-semibold hover:bg-primary-tint transition-colors disabled:opacity-50 ${FOCUS_RING}`}
                        >
                          {relistingId === listing.id ? <Loader2 className="size-3 animate-spin" /> : <><RotateCcw className="size-3" />Relist</>}
                        </button>
                      ) : (
                        <>
                          <Tooltip content="Edit listing">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditListing(listing); }}
                              className={`inline-flex items-center justify-center size-8 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft transition-colors ${FOCUS_RING}`}
                              aria-label="Edit listing"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                          </Tooltip>
                          {hasPendingOrders ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); openOrderModal(listing); }}
                              className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                            >
                              Review {listing.pendingOrderCount} {listing.pendingOrderCount === 1 ? "offer" : "offers"}
                            </button>
                          ) : isSellerPickupReady && sellerOrder ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); openRatingModal(sellerOrder); }}
                              className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                            >
                              Confirm pickup
                            </button>
                          ) : isSellerWaitingForBuyer ? (
                            <span className="flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md bg-warning/10 text-warning text-xs font-semibold">
                              Awaiting buyer
                            </span>
                          ) : sellerOrder?.status === "confirmed" && sellerCountdown ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); openConfirmedOrderSummary(listing.id); }}
                              className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold transition-colors ${FOCUS_RING}`}
                            >
                              {sellerCountdown.label} to pickup
                            </button>
                          ) : (
                            <span className="flex-1 text-[11px] text-muted text-right pr-1">{timeInfo.label}</span>
                          )}
                          {listing.status !== "sold" && (
                            <Tooltip content="Remove listing">
                              <button
                                onClick={(e) => { e.stopPropagation(); openRemoveListing(listing); }}
                                className={`inline-flex items-center justify-center size-8 rounded-md border border-error/30 text-error bg-canvas hover:bg-error/5 hover:text-error transition-colors ${FOCUS_RING}`}
                                aria-label="Remove listing"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </Tooltip>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : (
        isLoadingMyOrders && filteredPurchases.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <ListingCardSkeleton key={i} />)}
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="text-center py-16 border border-hairline rounded-md bg-surface-soft">
            <p className="text-sm text-muted">Nothing in this view yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPurchases.map((order) => {
              const countdown = getPickupCountdown(order);
              const viewState = getBuyerOrderViewState({
                status: order.status,
                countdownExpired: countdown.expired,
                hasReviewed: order.buyer_reviewed,
                otherReviewed: order.seller_reviewed,
              });
              const statusLabel = viewState === "declined" ? "Declined"
                : viewState === "withdrawn" ? "Withdrawn"
                : viewState === "expired" ? "Expired"
                : viewState === "cancelledBySeller" ? "Cancelled by seller"
                : viewState === "waitingForOther" ? "Awaiting seller"
                : viewState === "pickupReady" ? "Pickup ready"
                : viewState === "confirmedCountdown" ? `Pickup in ${countdown.label}`
                : order.status === "completed" ? "Completed"
                : "Pending";
              const statusClass = ["declined", "withdrawn", "expired"].includes(viewState) || order.status === "completed"
                ? "bg-surface-strong text-muted"
                : viewState === "cancelledBySeller" || viewState === "waitingForOther"
                  ? "bg-warning-soft text-warning"
                  : "bg-primary-soft text-primary";

              // Pending buyer-side orders get the distinct "Pending" overlay
              // (uppercase tracking-widest jade pill) mirroring the marketplace
              // "Sold" overlay treatment — a clearer trust signal that this is
              // a live order awaiting the seller. Other states keep the
              // standard rounded-full status pill.
              const isPending = order.status === "pending" && !["declined", "withdrawn", "expired", "cancelledBySeller"].includes(viewState);
              return (
                <article key={order.id} className="bg-canvas border border-hairline rounded-md overflow-hidden hover:shadow-hover transition-shadow flex flex-col">
                  {/* Trust band — mirrors marketplace card. OrderData
                      doesn't enrich with allCommunities; falls back to
                      PLACEHOLDER_COMMUNITY. Seller @handle stays in the
                      band so the buyer can see who they bought from. */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary-soft/60 border-b border-hairline text-xs">
                    <span className="size-3 rounded-full bg-primary shrink-0" aria-hidden="true" />
                    <span className="text-ink font-medium truncate">{PLACEHOLDER_COMMUNITY.name}</span>
                    {order.seller_name && (
                      <>
                        <span className="text-muted">·</span>
                        <span className="text-muted truncate">@{order.seller_name}</span>
                      </>
                    )}
                  </div>
                  <div className="relative aspect-square bg-surface-soft">
                    <ListingImage src={order.listing_image} alt="" size="card" className="absolute inset-0 size-full object-cover" />
                    {isPending ? (
                      <span className="absolute top-2 left-2 text-[10px] font-semibold text-on-primary bg-primary px-2 py-1 rounded-sm">
                        Pending
                      </span>
                    ) : (
                      <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${statusClass}`}>
                        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                        {statusLabel}
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-1">
                    <p className="text-sm font-medium text-ink line-clamp-1">{order.listing_title}</p>
                    <p className="text-2xl font-extrabold text-primary tracking-display leading-none pt-1">${order.listing_price}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {viewState === "pickupReady" ? (
                        <button
                          onClick={() => openRatingModal(order)}
                          className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                        >
                          Confirm pickup
                        </button>
                      ) : viewState === "confirmedCountdown" ? (
                        <button
                          onClick={() => openConfirmedOrderSummary(order.listing_id)}
                          className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold transition-colors ${FOCUS_RING}`}
                        >
                          {countdown.label} to pickup
                        </button>
                      ) : order.status === "pending" ? (
                        <button
                          onClick={() => setShowWithdrawConfirm(showWithdrawConfirm === order.id ? null : order.id)}
                          className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold transition-colors ${FOCUS_RING}`}
                        >
                          Withdraw
                        </button>
                      ) : (
                        <span className="flex-1 text-[11px] text-muted text-right pr-1">
                          {order.created_at ? new Date(order.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                        </span>
                      )}
                    </div>
                    {showWithdrawConfirm === order.id && (
                      <div className="mt-2 bg-warning/5 border border-warning/20 rounded-md p-2">
                        <p className="text-[11px] text-body mb-2">Withdraw your order? You can re-order later.</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setShowWithdrawConfirm(null)}
                            className={`flex-1 h-7 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-[11px] font-semibold ${FOCUS_RING}`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleWithdrawOrder(order.id)}
                            disabled={withdrawingOrderId === order.id}
                            className={`flex-1 h-7 rounded-md bg-warning text-on-primary text-[11px] font-semibold hover:bg-warning/90 disabled:opacity-50 ${FOCUS_RING}`}
                          >
                            {withdrawingOrderId === order.id ? "…" : "Withdraw"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )
      )}
    </>
  );
}

// ── Saved tab content ───────────────────────────────────────
function SavedTabContent({
  folders,
  foldersAvailable,
  items,
  isLoadingSaved,
  selectedFolderId,
  setSelectedFolderId,
  selectedIds,
  setSelectedIds,
  newFolderOpen,
  setNewFolderOpen,
  newFolderName,
  setNewFolderName,
  creatingFolder,
  createFolder,
  renamingFolderId,
  setRenamingFolderId,
  renamingFolderName,
  setRenamingFolderName,
  savingFolderId,
  renameFolder,
  deleteFolder,
  moveSelectedToFolder,
  unsaveSelected,
  moveOpen,
  setMoveOpen,
  openListingDetail,
  wishlistItemsWithFolder,
  onNavigate,
}: {
  folders: WishlistFolder[];
  foldersAvailable: boolean;
  items: WishlistListingWithFolder[] | Listing[];
  isLoadingSaved: boolean;
  selectedFolderId: number | "all";
  setSelectedFolderId: (id: number | "all") => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  newFolderOpen: boolean;
  setNewFolderOpen: (v: boolean) => void;
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  creatingFolder: boolean;
  createFolder: () => void;
  renamingFolderId: number | null;
  setRenamingFolderId: (id: number | null) => void;
  renamingFolderName: string;
  setRenamingFolderName: (v: string) => void;
  savingFolderId: number | null;
  renameFolder: (id: number) => void;
  deleteFolder: (id: number) => void;
  moveSelectedToFolder: (folderId: number | null) => void;
  unsaveSelected: () => void;
  moveOpen: boolean;
  setMoveOpen: (v: boolean) => void;
  openListingDetail?: (l: Listing) => void;
  wishlistItemsWithFolder: WishlistListingWithFolder[];
  onNavigate: (page: string) => void;
}) {
  const totalCount = wishlistItemsWithFolder.length > 0 ? wishlistItemsWithFolder.length : items.length;
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const selectAll = () => setSelectedIds(new Set(items.map((i) => i.id)));
  const clearSel = () => setSelectedIds(new Set());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
      <aside className="space-y-1">
        <h3 className="text-[11px] text-muted px-2 pb-1">Collections</h3>
        {!foldersAvailable && (
          <div className="px-3 py-2 mb-2 rounded-md bg-warning/10 border border-warning/20 text-[11px] text-body">
            Folders coming soon — backend in progress.
          </div>
        )}
        <button
          onClick={() => setSelectedFolderId("all")}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${FOCUS_RING} ${
            selectedFolderId === "all" ? "bg-primary-soft text-primary font-semibold" : "text-body hover:bg-surface-soft"
          }`}
        >
          <Heart className="size-3.5 shrink-0" />
          <span className="flex-1 text-left truncate">All saved</span>
          <span className="text-[11px] text-muted">{totalCount}</span>
        </button>
        {foldersAvailable && folders.map((f) => {
          const active = selectedFolderId === f.id;
          const isRenaming = renamingFolderId === f.id;
          return (
            <div key={f.id} className="group relative">
              {isRenaming ? (
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <input
                    value={renamingFolderName}
                    onChange={(e) => setRenamingFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameFolder(f.id);
                      if (e.key === "Escape") setRenamingFolderId(null);
                    }}
                    autoFocus
                    className={`flex-1 h-7 px-2 rounded-md border border-hairline bg-canvas text-sm text-ink ${FOCUS_RING}`}
                  />
                  <button
                    onClick={() => renameFolder(f.id)}
                    disabled={savingFolderId === f.id}
                    className={`h-7 px-2 rounded-md bg-primary text-on-primary text-[11px] font-semibold disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    {savingFolderId === f.id ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                  </button>
                  <button
                    onClick={() => setRenamingFolderId(null)}
                    className={`h-7 px-2 rounded-md text-muted hover:text-ink text-[11px] ${FOCUS_RING}`}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedFolderId(f.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${FOCUS_RING} ${
                    active ? "bg-primary-soft text-primary font-semibold" : "text-body hover:bg-surface-soft"
                  }`}
                >
                  <FolderIcon className="size-3.5 shrink-0" filled={active} />
                  <span className="flex-1 text-left truncate">{f.name}</span>
                  <span className="text-[11px] text-muted">{f.item_count}</span>
                </button>
              )}
              {!isRenaming && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-canvas border border-hairline rounded-md shadow-card">
                  <Tooltip content="Rename folder">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenamingFolderId(f.id); setRenamingFolderName(f.name); }}
                      className={`size-7 inline-flex items-center justify-center text-muted hover:text-ink rounded-md ${FOCUS_RING}`}
                      aria-label="Rename folder"
                    >
                      <Pencil className="size-3" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Delete folder">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFolder(f.id); }}
                      className={`size-7 inline-flex items-center justify-center text-muted hover:text-error rounded-md ${FOCUS_RING}`}
                      aria-label="Delete folder"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>
          );
        })}
        {foldersAvailable && (
          newFolderOpen ? (
            <div className="px-2 py-1.5 mt-1 border border-dashed border-hairline rounded-md">
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                  if (e.key === "Escape") { setNewFolderOpen(false); setNewFolderName(""); }
                }}
                placeholder="Folder name"
                autoFocus
                className={`w-full h-8 px-2 rounded-md border border-hairline bg-canvas text-sm text-ink ${FOCUS_RING}`}
              />
              <div className="flex items-center gap-1.5 mt-1.5">
                <button
                  onClick={createFolder}
                  disabled={!newFolderName.trim() || creatingFolder}
                  className={`flex-1 h-7 rounded-md bg-primary text-on-primary text-[11px] font-semibold disabled:opacity-50 ${FOCUS_RING}`}
                >
                  {creatingFolder ? <Loader2 className="size-3 animate-spin mx-auto" /> : "Create"}
                </button>
                <button
                  onClick={() => { setNewFolderOpen(false); setNewFolderName(""); }}
                  className={`flex-1 h-7 rounded-md text-muted hover:text-ink text-[11px] ${FOCUS_RING}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setNewFolderOpen(true)}
              className={`w-full flex items-center gap-2 px-3 py-2 mt-2 rounded-md text-sm text-muted hover:text-ink border border-dashed border-hairline hover:border-border-strong transition-colors ${FOCUS_RING}`}
            >
              <Plus className="size-3.5" />
              <span className="flex-1 text-left">New folder</span>
            </button>
          )
        )}
      </aside>

      <div>
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 px-4 py-2 bg-surface-soft border border-hairline rounded-md">
            <span className="text-sm font-semibold text-ink">{selectedIds.size} selected</span>
            <div className="flex-1" />
            {foldersAvailable && folders.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setMoveOpen(!moveOpen)}
                  className={`inline-flex items-center gap-1 h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                >
                  Add to folder
                  <ChevronDown className="size-3" />
                </button>
                {moveOpen && (
                  <div role="menu" className="absolute right-0 top-full mt-1 w-48 bg-canvas border border-hairline rounded-md shadow-overlay overflow-hidden z-10">
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        role="menuitem"
                        onClick={() => moveSelectedToFolder(f.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-body hover:bg-surface-soft hover:text-ink text-left ${FOCUS_RING}`}
                      >
                        <FolderIcon className="size-3.5" />
                        <span className="flex-1 truncate">{f.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {foldersAvailable && selectedFolderId !== "all" && (
              <button
                onClick={() => moveSelectedToFolder(null)}
                className={`inline-flex items-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold ${FOCUS_RING}`}
              >
                Remove from folder
              </button>
            )}
            <button
              onClick={unsaveSelected}
              className={`inline-flex items-center h-8 px-3 rounded-md border border-error/40 text-error bg-canvas hover:bg-error/5 text-xs font-semibold ${FOCUS_RING}`}
            >
              Unsave
            </button>
            <button
              onClick={clearSel}
              className={`text-xs text-muted hover:text-ink ${FOCUS_RING} rounded`}
            >
              Clear
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted">
            {items.length} {items.length === 1 ? "item" : "items"}
          </p>
          {items.length > 0 && (
            <button
              onClick={selectedIds.size === items.length ? clearSel : selectAll}
              className={`text-xs text-primary hover:underline ${FOCUS_RING} rounded`}
            >
              {selectedIds.size === items.length ? "Clear selection" : "Select all"}
            </button>
          )}
        </div>

        {/* Skeleton fires while the folder-aware fetch is in flight, even
            if the parent's `wishlistItems` prop has already populated the
            `items` fallback. This way the user sees a clear loading affordance
            every time they land on Saved, not just on first-ever empty load. */}
        {isLoadingSaved && wishlistItemsWithFolder.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <ListingCardSkeleton key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 border border-hairline rounded-md bg-surface-soft">
            <p className="text-sm text-muted mb-4">Nothing saved here yet.</p>
            <button
              onClick={() => onNavigate("market")}
              className={`inline-flex items-center justify-center h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
            >
              Browse market
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((item) => {
              const selected = selectedIds.has(item.id);
              const folderId = "folder_id" in item ? item.folder_id : null;
              const folder = folderId != null ? folders.find((f) => f.id === folderId) : null;
              const listing = item as Listing;
              const heroCommunity = listing.allCommunities?.find((c) => c.is_mutual)
                ?? listing.allCommunities?.[0]
                ?? PLACEHOLDER_COMMUNITY;
              const images = listing.imageUrls && listing.imageUrls.length > 0
                ? listing.imageUrls
                : [listing.imageUrl];
              return (
                <article
                  key={item.id}
                  onClick={() => openListingDetail?.(listing)}
                  className={`group bg-canvas border rounded-md overflow-hidden cursor-pointer transition-shadow ${
                    selected ? "border-primary ring-2 ring-primary" : "border-hairline hover:shadow-hover"
                  }`}
                >
                  {/* Trust band — mirrors marketplace card.
                      Falls back to PLACEHOLDER_COMMUNITY when the wishlist
                      payload omits allCommunities enrichment. */}
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
                    <ListingImage
                      src={images[0]}
                      alt=""
                      size="card"
                      className="absolute inset-0 size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                      aria-label={selected ? "Deselect" : "Select"}
                      aria-pressed={selected}
                      className={`absolute top-2 left-2 size-6 rounded-full flex items-center justify-center transition-colors ${FOCUS_RING} ${
                        selected ? "bg-primary text-on-primary" : "bg-canvas/90 text-muted hover:text-ink border border-hairline"
                      }`}
                    >
                      {selected ? <Check className="size-3.5" /> : <span className="size-3 rounded-full border-2 border-current" />}
                    </button>
                    {listing.status === "sold" && (
                      <span className="absolute top-2 right-2 text-[10px] font-semibold text-on-primary bg-ink px-2 py-1 rounded-sm">
                        Sold
                      </span>
                    )}
                    {folder && (
                      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 bg-canvas/90 px-2 py-1 rounded-full border border-hairline" title={folder.name}>
                        <FolderIcon className="size-3 text-primary" />
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-medium text-ink line-clamp-1">{formatTitle(listing.brand ?? "", listing.name ?? "")}</p>
                    <p className="text-xs text-muted line-clamp-1">{listing.location}</p>
                    <p className="text-2xl font-extrabold text-primary tracking-display leading-none pt-1">${listing.price}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Heart icon (filled) ─────────────────────────────────────
function Heart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.84 4.6a5.5 5.5 0 0 0-7.78 0L12 5.7l-1.06-1.1a5.5 5.5 0 0 0-7.78 7.78L12 21l8.84-8.62a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

// ── Folder icon (filled when active) ────────────────────────
function FolderIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// ── Settings tab content ────────────────────────────────────
function SettingsTabContent({
  settings,
  updateSetting,
  resetSettings,
  openEditProfileModal,
  openAddFriendsModal,
  openFriendsModal,
  friendsCount,
  logout,
}: {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  resetSettings: () => void;
  openEditProfileModal: () => void;
  openAddFriendsModal: () => void;
  openFriendsModal: () => void;
  friendsCount: number;
  logout: () => Promise<void>;
}) {
  const fontSizes: [Settings["fontSize"], string][] = [
    ["default", "Default"],
    ["large", "Large"],
    ["extra-large", "Extra large"],
  ];
  const colorBlindModes: [Settings["colorBlindMode"], string][] = [
    ["off", "Off"],
    ["protanopia", "Protanopia"],
    ["deuteranopia", "Deuteranopia"],
    ["tritanopia", "Tritanopia"],
  ];

  // Reset-to-default uses an inline two-stage confirm: first click swaps
  // the button into Confirm/Cancel pair, auto-reverting after 3s so a
  // stray click can never wipe settings without intent. Confirmed reset
  // shows a 2s "Settings reset." inline note.
  const [resetConfirming, setResetConfirming] = useState(false);
  const [resetNoticeVisible, setResetNoticeVisible] = useState(false);
  useEffect(() => {
    if (!resetConfirming) return;
    const t = setTimeout(() => setResetConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [resetConfirming]);
  useEffect(() => {
    if (!resetNoticeVisible) return;
    const t = setTimeout(() => setResetNoticeVisible(false), 2000);
    return () => clearTimeout(t);
  }, [resetNoticeVisible]);
  const handleResetConfirm = () => {
    resetSettings();
    setResetConfirming(false);
    setResetNoticeVisible(true);
  };

  return (
    <div className="max-w-2xl space-y-8">
      <section>
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className={`text-base ${PANEL_TITLE}`}>General</h3>
          <div className="flex items-center gap-2">
            {resetNoticeVisible && (
              <span className="text-xs text-muted" role="status" aria-live="polite">
                Settings reset.
              </span>
            )}
            {resetConfirming ? (
              <>
                <button
                  type="button"
                  onClick={handleResetConfirm}
                  className={`inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                >
                  Confirm reset
                </button>
                <button
                  type="button"
                  onClick={() => setResetConfirming(false)}
                  className={`inline-flex items-center justify-center h-8 px-3 rounded-md text-muted hover:text-ink text-xs font-semibold ${FOCUS_RING}`}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setResetConfirming(true)}
                className={`inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold transition-colors ${FOCUS_RING}`}
              >
                Reset to default
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-muted mb-4">Restore every device setting on this page to its default value.</p>
      </section>

      <section>
        <h3 className={`text-base ${PANEL_TITLE} mb-1`}>Accessibility</h3>
        <p className="text-sm text-muted mb-4">Stored on this device, applied across Cosello.</p>
        <div className="bg-canvas border border-hairline rounded-md divide-y divide-hairline-soft">
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Text size</p>
              <p className="text-xs text-muted mt-0.5">Adjust body text size used throughout Cosello.</p>
            </div>
            <div role="radiogroup" aria-label="Text size" className="inline-flex items-center gap-1 bg-surface-soft p-1 rounded-md shrink-0">
              {fontSizes.map(([v, label]) => {
                const active = settings.fontSize === v;
                return (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={active}
                    onClick={() => updateSetting("fontSize", v)}
                    className={`${SEG_BTN_BASE} ${active ? "bg-canvas text-ink shadow-card" : "text-muted hover:text-ink"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <SettingRow
            title="Reduce motion"
            subtitle="Disable transitions and incidental animation."
            control={<ToggleSwitch checked={settings.reduceMotion} onChange={(v) => updateSetting("reduceMotion", v)} label="Reduce motion" />}
          />
          <SettingRow
            title="High contrast"
            subtitle="Increase contrast on muted text and borders."
            control={<ToggleSwitch checked={settings.highContrast} onChange={(v) => updateSetting("highContrast", v)} label="High contrast" />}
          />
          <SettingRow
            title="Compact mode"
            subtitle="Tighten spacing across cards, sections, and layouts."
            control={<ToggleSwitch checked={settings.compactMode} onChange={(v) => updateSetting("compactMode", v)} label="Compact mode" />}
          />
          {/* Dark mode sets data-theme="dark" on <html>; SettingsContext
              persists the choice to localStorage and restores on reload.
              The Electric Violet token set (UI redesign v3) fully supports
              dark mode via the [data-theme="dark"] block in theme.css. */}
          <SettingRow
            title="Dark mode"
            subtitle="Use a dark surface palette across Cosello."
            control={<ToggleSwitch checked={settings.darkMode} onChange={(v) => updateSetting("darkMode", v)} label="Dark mode" />}
          />
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Color-blind mode</p>
              <p className="text-xs text-muted mt-0.5">Substitute accent hues with palette-safe alternates.</p>
            </div>
            <div role="radiogroup" aria-label="Color-blind mode" className="inline-flex items-center gap-1 bg-surface-soft p-1 rounded-md shrink-0">
              {colorBlindModes.map(([v, label]) => {
                const active = settings.colorBlindMode === v;
                return (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={active}
                    onClick={() => updateSetting("colorBlindMode", v)}
                    className={`${SEG_BTN_BASE} ${active ? "bg-canvas text-ink shadow-card" : "text-muted hover:text-ink"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className={`text-base ${PANEL_TITLE} mb-1`}>Friends</h3>
        <p className="text-sm text-muted mb-4">Manage your friend connections.</p>
        <div className="bg-canvas border border-hairline rounded-md divide-y divide-hairline-soft">
          <SettingRow
            title="Friends"
            subtitle={`${friendsCount} ${friendsCount === 1 ? "friend" : "friends"}`}
            control={
              <div className="flex items-center gap-2">
                <button
                  onClick={openFriendsModal}
                  className={`inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold ${FOCUS_RING}`}
                >
                  View
                </button>
                <button
                  onClick={openAddFriendsModal}
                  className={`inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                >
                  Add friends
                </button>
              </div>
            }
          />
        </div>
      </section>

      <section>
        <h3 className={`text-base ${PANEL_TITLE} mb-1`}>Circles</h3>
        <p className="text-sm text-muted mb-4">Control which trust signals appear on your listings.</p>
        <CircleSettings />
      </section>

      <section>
        <h3 className={`text-base ${PANEL_TITLE} mb-1`}>Account</h3>
        <div className="bg-canvas border border-hairline rounded-md divide-y divide-hairline-soft">
          <SettingRow
            title="Edit profile"
            subtitle="Name, photo, neighborhood, and pickup address."
            control={
              <button
                onClick={openEditProfileModal}
                className={`inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold ${FOCUS_RING}`}
              >
                Edit
              </button>
            }
          />
          <SettingRow
            title="Log out"
            subtitle="Sign out of Cosello on this device."
            control={
              <button
                onClick={logout}
                className={`inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-error/40 text-error bg-canvas hover:bg-error/5 text-xs font-semibold ${FOCUS_RING}`}
              >
                <LogOut className="size-3.5" />
                Log out
              </button>
            }
          />
        </div>
      </section>
    </div>
  );
}

function SettingRow({ title, subtitle, control }: { title: string; subtitle: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="text-xs text-muted mt-0.5">{subtitle}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

