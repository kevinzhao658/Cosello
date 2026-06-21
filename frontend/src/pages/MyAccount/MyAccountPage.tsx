import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  Lock,
  Unlock,
  Send,
  Pencil,
  LogOut,
  AlertTriangle,
  Users,
  UserPlus,
  Star,
  Trash2,
  Globe,
  ImagePlus,
} from "lucide-react";
import { useProfilePictureUpload } from "../../hooks/useProfilePictureUpload";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { useAuth } from "../../contexts/AuthContext";
import { useSettings } from "../../contexts/SettingsContext";
import { formatTitle } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { useClickOutside } from "../../hooks/useClickOutside";
import { apiFetch } from "../../lib/api";
import type { Listing, ListingUpdatePatch, MyListing, OrderData } from "../../lib/types";
import { useCommunities } from "../../contexts/CommunitiesContext";
import { FOCUS_RING, MODAL_TITLE } from "./constants";
import { EditListingModal } from "../../components/EditListingModal";
import { ListingImage } from "../../components/ui/ListingImage";
import { useNeighborhoods } from "../../lib/useNeighborhoods";
import {
  getPickupCountdown,
} from "../../lib/orderStatus";
import { useOrderModals } from "../../contexts/OrderModalsContext";
import { FriendsListModal } from "./modals/FriendsListModal";
import { EditProfileModal } from "./modals/EditProfileModal";
import { AddFriendsModal } from "./modals/AddFriendsModal";
import { RemoveListingConfirmModal } from "./modals/RemoveListingConfirmModal";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { AvatarUploadButton } from "../../components/ui/AvatarUploadButton";
import { buildSlotTarget, parseSlotEndHour } from "../../lib/pickupTime";
import { ListingsTabContent } from "./tabs/ListingsTabContent";
import { SavedTabContent } from "./tabs/SavedTabContent";
import { SettingsTabContent } from "./tabs/SettingsTabContent";
import { OverviewTabContent } from "./tabs/OverviewTabContent";
import { useEditProfileForm } from "./hooks/useEditProfileForm";
import { MyAccountProvider } from "./MyAccountContext";

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
  wishlistItems?: Listing[];
  onToggleWishlist?: (listingId: string) => void;
  pendingListingId?: string | null;
  onClearPendingListing?: () => void;
  onAddToHistory?: (item: { id: string; title: string; imageUrl: string; price: string; type: "viewed" | "purchased" | "listed" | "sold" }) => void;
  openListingDetail?: (listing: Listing) => void;
  onViewUser?: (userId: string) => void;
  // Cross-page tab requests (e.g. Settings dropdown from global nav). The nonce
  // forces re-application even when the page is already mounted and the
  // requested tab matches the current tab.
  requestedAccountTab?: { tab: AccountTab; nonce: number } | null;
  onClearRequestedAccountTab?: () => void;
}

export default function MyAccountPage({ onNavigate, wishlistItems = [], onToggleWishlist, pendingListingId, onClearPendingListing, onAddToHistory, openListingDetail, onViewUser, requestedAccountTab, onClearRequestedAccountTab }: MyAccountPageProps) {
  const { user, token, updateUser, logout } = useAuth();
  const { settings, updateSetting, resetSettings } = useSettings();
  const { fetchFilterCommunities: onCommunitiesChanged } = useCommunities();

  // ── Profile picture upload ─────────────────────────────
  const { isUploading: isUploadingAvatar, uploadError: avatarUploadError, upload: uploadAvatar, clearError: clearAvatarError } = useProfilePictureUpload({
    onSuccess: (updated) => updateUser(updated),
  });

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

  // ── Community data ─────────────────────────────────────
  const [communities, setCommunities] = useState<CommunityData[]>([]);

  // Edit Profile modal
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const editProfileForm = useEditProfileForm(neighborhoods);
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
  }, [mySellerOrders, myPurchases, myListings, countdownTick]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const { run: handleDeleteCommunity, pending: isDeletingCommunity } = useAsyncAction(
    async () => {
      if (!selectedCommunity || !token) return;
      const res = await apiFetch(`/api/communities/${selectedCommunity.id}`, { method: "DELETE" });
      if (res.ok) {
        setCommunities((prev) => prev.filter((c) => c.id !== selectedCommunity!.id));
        setShowCommunityDetail(false);
        setShowDeleteConfirm(false);
        onCommunitiesChanged?.();
      }
    },
  );

  const { run: handleLeaveCommunity, pending: isLeavingCommunity } = useAsyncAction(
    async () => {
      if (!selectedCommunity || !token) return;
      const res = await apiFetch(`/api/communities/${selectedCommunity.id}/leave`, { method: "DELETE" });
      if (res.ok) {
        setCommunities((prev) => prev.filter((c) => c.id !== selectedCommunity!.id));
        setShowCommunityDetail(false);
        onCommunitiesChanged?.();
      }
    },
  );

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

  const openEditProfileModal = () => {
    editProfileForm.reset({
      displayName: user?.display_name || "",
      neighborhood: user?.neighborhood || "",
      pickupAddress: user?.pickup_address || "",
      zipCode: user?.zip_code || "",
    });
    setShowEditProfileModal(true);
  };

  const isNeighborhoodChanging = editProfileForm.fields.neighborhood.trim() !== (user?.neighborhood ?? "");

  const doUpdateProfile = async () => {
    editProfileForm.setPending(true);
    editProfileForm.setError("");
    try {
      const res = await apiFetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: `${editProfileForm.fields.firstName.trim()} ${editProfileForm.fields.lastName.trim()}`,
          neighborhood: editProfileForm.fields.neighborhood.trim(),
          pickup_address: editProfileForm.fields.pickupAddress.trim() || undefined,
          zip_code: editProfileForm.fields.zipCode.trim() || undefined,
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
      editProfileForm.setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      editProfileForm.setPending(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editProfileForm.fields.firstName.trim() || !editProfileForm.fields.lastName.trim()) {
      editProfileForm.setError("Please enter your first and last name");
      return;
    }
    if (!editProfileForm.isValidNeighborhood) {
      editProfileForm.setError("Please select a valid Manhattan neighborhood");
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

  useClickOutside([editNeighborhoodRef, editSuggestionsRef], () => editProfileForm.setField("showSuggestions", false), editProfileForm.fields.showSuggestions);
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

  // ── Shared context value ───────────────────────────────
  const sharedContextValue = useMemo(() => ({
    myListings,
    myPurchases,
    mySellerOrders,
    isLoadingMyListings,
    isLoadingMyOrders,
    isLoadingStats,
    isLoadingSaved,
    openEditListing,
    openRemoveListing,
    openOrderModal: openOrderManagement,
    openConfirmedOrderSummary,
    openRatingModal,
    openListingDetail,
    handleRelist,
    relistingId,
    openEditProfileModal,
    openAddFriendsModal,
    openFriendsModal,
    onNavigate,
    onViewUser,
    getListingTimeInfo,
    getPickupCountdown,
  }), [ // eslint-disable-line react-hooks/exhaustive-deps
    myListings, myPurchases, mySellerOrders,
    isLoadingMyListings, isLoadingMyOrders, isLoadingStats, isLoadingSaved,
    relistingId, onNavigate, onViewUser, openListingDetail,
  ]);

  return (
    <section className="min-h-[calc(100vh-64px)] bg-canvas text-ink">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* ── Profile Header ───────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-10">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <AvatarUploadButton
              currentUrl={user?.profile_picture}
              fallback={
                <span className="text-2xl font-extrabold text-ink tracking-display">
                  {(user?.display_name?.[0] || "?").toUpperCase()}
                </span>
              }
              size="size-20"
              isUploading={isUploadingAvatar}
              uploadError={avatarUploadError}
              onFileChange={(file) => void uploadAvatar(file)}
              onErrorClear={clearAvatarError}
              iconSize="size-5"
              errorClassName="text-[11px] text-error text-center max-w-[88px] leading-tight"
              alt={user?.display_name || "Profile"}
            />
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
        <MyAccountProvider value={sharedContextValue}>
          {accountTab === "overview" && (
            <div id="account-panel-overview" role="tabpanel" className="flex flex-col gap-6">
              <OverviewTabContent
                listingsTab={listingsTab}
                setListingsTab={setListingsTab}
                punchlist={punchlist}
                punchlistLoaded={punchlistLoaded}
              />
            </div>
          )}

          {accountTab === "listings" && (
            <div id="account-panel-listings" role="tabpanel">
              <ListingsTabContent
                listingsTab={listingsTab}
                setListingsTab={(t) => { setListingsTab(t); setListingsFilter("all"); }}
                listingsFilter={listingsFilter}
                setListingsFilter={setListingsFilter}
                sellingActiveCount={sellingActiveCount}
                sellingDraftCount={sellingDraftCount}
                sellingSoldCount={sellingSoldCount}
                buyingActiveCount={buyingActiveCount}
                buyingCompletedCount={buyingCompletedCount}
                buyingDeclinedCount={buyingDeclinedCount}
                setShowWithdrawConfirm={setShowWithdrawConfirm}
                showWithdrawConfirm={showWithdrawConfirm}
                handleWithdrawOrder={handleWithdrawOrder}
                withdrawingOrderId={withdrawingOrderId}
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
                wishlistItemsWithFolder={wishlistItemsWithFolder}
              />
            </div>
          )}

          {accountTab === "settings" && (
            <div id="account-panel-settings" role="tabpanel">
              <SettingsTabContent
                settings={settings}
                updateSetting={updateSetting}
                resetSettings={resetSettings}
                friendsCount={stats.friends_count}
                logout={async () => {
                  await logout();
                  onNavigate("home");
                }}
              />
            </div>
          )}
        </MyAccountProvider>
      </div>

      {/* ── Modals ───────────────────────────────────────── */}
      <EditProfileModal
        open={showEditProfileModal}
        avatarUrl={user?.profile_picture ?? null}
        isUploadingAvatar={isUploadingAvatar}
        avatarUploadError={avatarUploadError}
        onAvatarChange={(file) => void uploadAvatar(file)}
        onAvatarErrorClear={clearAvatarError}
        editFirstName={editProfileForm.fields.firstName}
        editLastName={editProfileForm.fields.lastName}
        editPickupAddress={editProfileForm.fields.pickupAddress}
        editNeighborhood={editProfileForm.fields.neighborhood}
        editZipCode={editProfileForm.fields.zipCode}
        editShowSuggestions={editProfileForm.fields.showSuggestions}
        editFilteredNeighborhoods={editProfileForm.filteredNeighborhoods}
        editIsValidNeighborhood={editProfileForm.isValidNeighborhood}
        editProfileError={editProfileForm.error}
        isUpdatingProfile={editProfileForm.pending}
        isLoadingNeighborhoods={isLoadingNeighborhoodsList}
        neighborhoodsError={neighborhoodsListError}
        editNeighborhoodRef={editNeighborhoodRef}
        editSuggestionsRef={editSuggestionsRef}
        setEditFirstName={(v) => editProfileForm.setField("firstName", v)}
        setEditLastName={(v) => editProfileForm.setField("lastName", v)}
        setEditPickupAddress={(v) => editProfileForm.setField("pickupAddress", v)}
        setEditNeighborhood={(v) => editProfileForm.setField("neighborhood", v)}
        setEditZipCode={(v) => editProfileForm.setField("zipCode", v)}
        setEditShowSuggestions={(v) => editProfileForm.setField("showSuggestions", v)}
        onClose={() => setShowEditProfileModal(false)}
        onSubmit={handleUpdateProfile}
      />

      {showNeighborhoodChangeConfirm && (
        <ModalShell open onClose={handleCancelNeighborhoodChange} z={60}>
          <div className="bg-canvas border border-hairline rounded-md max-w-md w-full mx-4 p-6 shadow-overlay">
            <h3 className="text-base font-semibold text-ink mb-2">Change neighborhood?</h3>
            <p className="text-sm text-body leading-relaxed">
              You'll leave the <strong>{user?.neighborhood ?? "—"}</strong> community
              and join <strong>{editProfileForm.fields.neighborhood}</strong>. Your existing listings
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
                disabled={editProfileForm.pending}
                className={`h-9 px-4 rounded-md bg-primary text-on-primary hover:bg-primary-hover text-sm font-semibold disabled:opacity-50 ${FOCUS_RING}`}
              >
                {editProfileForm.pending ? <Loader2 className="size-4 animate-spin" /> : "Confirm"}
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
                      onChange={(e) => setEditCommunityZipCode(e.target.value)}
                      placeholder="10001"
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
        />
      )}

      {/* OrderConfirmSummaryModal + PickupAttestationModal + RatingModal +
          OrderManagementModal (R-5.7.3) all render at App-level via
          OrderModalsProvider so notification clicks open them in place
          without routing to /account. See contexts/OrderModalsContext.tsx. */}

    </section>
  );
}
