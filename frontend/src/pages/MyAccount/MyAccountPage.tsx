import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { ModalShell } from "../../components/ui/ModalShell";
import {
  User,
  Globe,
  Plus,
  Package,
  Heart,
  SlidersHorizontal,
  MapPin,
  X,
  Camera,
  Loader2,
  Copy,
  Check,
  ImagePlus,
  Lock,
  Unlock,
  Search,
  Send,
  MessageSquare,
  UserPlus,
  Trash2,
  ShoppingBag,
  Pencil,
  LogOut,
  AlertTriangle,
  Users,
  Clock,
  RotateCcw,
  Star,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { formatTitle } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { useClickOutside } from "../../hooks/useClickOutside";
import { buildSlotTarget, formatCountdown, parseClockPeriod, parseSlotEndHour } from "../../lib/pickupTime";
import { apiFetch } from "../../lib/api";
import type { CategorySchema, Listing, ListingUpdatePatch, MyListing } from "../../lib/types";
import { EditListingModal } from "../../components/EditListingModal";
import { CommunityCardSkeleton } from "../../components/CommunityCardSkeleton";
import { ListingCardSkeleton } from "../../components/ListingCardSkeleton";
import { MANHATTAN_NEIGHBORHOODS } from "../../lib/neighborhoods";
import {
  BUYER_ORDER_BADGE,
  BUYER_ORDER_CONTAINER_CLASS,
  SELLER_LISTING_CTA_BADGE,
  getBuyerOrderViewState,
  getSellerListingCtaState,
} from "../../lib/orderStatus";
import { RatingModal } from "./modals/RatingModal";
import { PickupAttestationModal } from "./modals/PickupAttestationModal";
import { OrderConfirmSummaryModal } from "./modals/OrderConfirmSummaryModal";
import { FriendsListModal } from "./modals/FriendsListModal";
import { JoinCommunityModal } from "./modals/JoinCommunityModal";
import { CreateCommunityModal } from "./modals/CreateCommunityModal";
import { ShareCommunityModal } from "./modals/ShareCommunityModal";
import { EditProfileModal } from "./modals/EditProfileModal";
import { AddFriendsModal } from "./modals/AddFriendsModal";

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

interface OrderData {
  id: number;
  listing_id: string;
  listing_title: string;
  listing_image: string;
  listing_price: string;
  buyer_id: string;
  buyer_name: string;
  buyer_picture?: string | null;
  seller_id: string;
  seller_name: string;
  seller_picture?: string | null;
  status: string;
  selected_pickup_slots: { date: string; time: string }[];
  confirmed_time?: string;
  created_at: string | null;
  role: string;
  buyer_reviewed: boolean;
  seller_reviewed: boolean;
  pickup_address: string | null;
  address_released: boolean;
  is_neighborhood: boolean;
  pickup_notified: boolean;
}

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
}

export default function MyAccountPage({ onNavigate, onCommunitiesChanged, wishlistItems = [], wishlist, onToggleWishlist, pendingListingId, onClearPendingListing, onAddToHistory, openListingDetail, onViewUser, categorySchemas }: MyAccountPageProps) {
  const { user, token, updateUser } = useAuth();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [communitiesLoaded, setCommunitiesLoaded] = useState(false);
  const [copiedConfirm, setCopiedConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create community form state
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

  // Created community for share modal
  const [createdCommunity, setCreatedCommunity] = useState<CommunityData | null>(null);

  // Share modal state
  const [friendSearch, setFriendSearch] = useState("");
  const [friendResults, setFriendResults] = useState<SearchUser[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit Profile modal state
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPickupAddress, setEditPickupAddress] = useState("");
  const [editNeighborhood, setEditNeighborhood] = useState("");
  const [editZipCode, setEditZipCode] = useState("");
  const [editShowSuggestions, setEditShowSuggestions] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [editProfileError, setEditProfileError] = useState("");
  const editSuggestionsRef = useRef<HTMLDivElement>(null);
  const editNeighborhoodRef = useRef<HTMLInputElement>(null);

  // Add Friends modal state
  const [showAddFriendsModal, setShowAddFriendsModal] = useState(false);
  const [addFriendsTab, setAddFriendsTab] = useState<"recommended" | "contacts" | "qr">("recommended");
  const [addFriendsSearch, setAddFriendsSearch] = useState("");
  const [addFriendsResults, setAddFriendsResults] = useState<FriendSearchUser[]>([]);
  const [recommendedFriends, setRecommendedFriends] = useState<FriendSearchUser[]>([]);
  const [isAddFriendsSearching, setIsAddFriendsSearching] = useState(false);
  const [isLoadingRecommended, setIsLoadingRecommended] = useState(false);
  const [addingFriendId, setAddingFriendId] = useState<string | null>(null);
  const addFriendsSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Community search state (join modal)
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

  // Metric modals state
  const [showListingsModal, setShowListingsModal] = useState(false);

  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsList, setFriendsList] = useState<FriendSearchUser[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);

  // Community detail modal state
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

  // Pending join requests state (for community owners)
  const [pendingRequests, setPendingRequests] = useState<{ id: number; user_id: string; display_name: string | null; neighborhood: string | null; profile_picture: string | null }[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [acceptingRequestId, setAcceptingRequestId] = useState<number | null>(null);
  const [rejectingRequestId, setRejectingRequestId] = useState<number | null>(null);
  const [kickingMemberId, setKickingMemberId] = useState<string | null>(null);

  // Profile stats
  const [stats, setStats] = useState<ProfileStats>({ total_listings: 0, purchases: 0, friends_count: 0, avg_seller_rating: 5.0, avg_buyer_rating: 5.0 });
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [myListingsLoaded, setMyListingsLoaded] = useState(false);
  const [listingsTab, setListingsTab] = useState<"selling" | "buying">("selling");

  // Edit listing modal — field state lives inside EditListingModal; this
  // page only tracks which listing is being edited.
  const [editListing, setEditListing] = useState<MyListing | null>(null);

  const openEditListing = (listing: MyListing) => {
    setEditListing(listing);
  };

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

  // Order management state
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderModalListing, setOrderModalListing] = useState<MyListing | null>(null);
  const [listingOrders, setListingOrders] = useState<OrderData[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [confirmingOrderId, setConfirmingOrderId] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ orderId: number; slot: { date: string; time: string }; order: OrderData } | null>(null);
  const [confirmTime, setConfirmTime] = useState("");
  const [decliningOrderId, setDecliningOrderId] = useState<number | null>(null);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState<number | null>(null);
  const [withdrawingOrderId, setWithdrawingOrderId] = useState<number | null>(null);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState<number | null>(null);

  // Order confirmation summary state
  const [showConfirmSummary, setShowConfirmSummary] = useState(false);
  const [confirmSummaryData, setConfirmSummaryData] = useState<{
    listing: MyListing;
    buyerName: string;
    slot: { date: string; time: string };
    role: "seller" | "buyer";
    confirmedTime?: string;
    pickupAddress?: string | null;
    order: OrderData;
  } | null>(null);
  const [showPickupAttestation, setShowPickupAttestation] = useState(false);

  // Purchases (buyer's orders) and seller orders
  const [myPurchases, setMyPurchases] = useState<OrderData[]>([]);
  const [mySellerOrders, setMySellerOrders] = useState<OrderData[]>([]);
  // Becomes true after the first /api/orders fetch completes (success OR empty).
  // The "open modal from notification" effect waits on this to avoid clearing
  // pendingListingId before purchases have had a chance to load.
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  // Countdown tick (forces re-render every 60s for live countdowns)
  const [countdownTick, setCountdownTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCountdownTick((p) => p + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const getPickupCountdown = (order: OrderData): { expired: boolean; label: string; diff: number } => {
    if (order.status !== "confirmed" || order.selected_pickup_slots.length === 0) {
      return { expired: false, label: "", diff: Infinity };
    }
    const slot = order.selected_pickup_slots[0];

    // Use confirmed_time if available (e.g. "3:00 PM"), otherwise fall back to window end
    let targetHour = 18;
    let targetMin = 0;
    if (order.confirmed_time) {
      const clock = parseClockPeriod(order.confirmed_time);
      if (clock) {
        targetHour = clock.hour;
        targetMin = clock.minute;
      }
    } else {
      const endHour = parseSlotEndHour(slot.time);
      if (endHour !== null) targetHour = endHour;
      const legacyEnd: Record<string, number> = { morning: 12, afternoon: 17, evening: 21 };
      if (legacyEnd[slot.time]) targetHour = legacyEnd[slot.time];
    }

    const target = buildSlotTarget(slot.date, targetHour, targetMin);
    const diff = target.getTime() - Date.now();

    if (diff <= 0) return { expired: true, label: "Ready", diff };
    return { expired: false, label: formatCountdown(diff).label, diff };
  };

  const isSlotExpired = (slot: { date: string; time: string }): boolean => {
    const endHour = parseSlotEndHour(slot.time) ?? 18;
    const slotEnd = buildSlotTarget(slot.date, endHour);
    return new Date() > slotEnd;
  };

  // Auto-release address 1 hour before pickup for neighborhood orders
  useEffect(() => {
    if (!token) return;
    const allOrders = [...myPurchases, ...mySellerOrders];
    for (const order of allOrders) {
      if (
        order.status === "confirmed" &&
        order.is_neighborhood &&
        !order.address_released
      ) {
        const countdown = getPickupCountdown(order);
        // Trigger when 1 hour or less until pickup (diff <= 3600000ms)
        if (countdown.diff <= 3600000) {
          apiFetch(`/api/orders/${order.id}/release-address`, {
            method: "POST",
          }).then((res) => {
            if (res.ok) fetchAllOrders();
          }).catch(() => {});
        }
      }
    }
  }, [countdownTick, token, myPurchases, mySellerOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expire pending orders when all pickup slots have passed
  useEffect(() => {
    if (!token) return;
    const allOrders = [...myPurchases, ...mySellerOrders];
    for (const order of allOrders) {
      if (order.status === "pending" && order.selected_pickup_slots.length > 0) {
        const allExpired = order.selected_pickup_slots.every((slot) => isSlotExpired(slot));
        if (allExpired) {
          apiFetch(`/api/orders/${order.id}/expire`, {
            method: "POST",
          }).then((res) => {
            if (res.ok) fetchAllOrders();
          }).catch(() => {});
        }
      }
    }
  }, [countdownTick, token, myPurchases, mySellerOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rating modal state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingOrder, setRatingOrder] = useState<OrderData | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  const openRatingModal = (order: OrderData) => {
    setRatingOrder(order);
    setRatingValue(0);
    setRatingHover(0);
    setRatingComment("");
    setShowRatingModal(true);
  };

  const handleSubmitRating = async () => {
    if (!token || !ratingOrder || ratingValue === 0) return;
    setIsSubmittingRating(true);
    try {
      const res = await apiFetch(`/api/orders/${ratingOrder.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: ratingValue, comment: ratingComment }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to submit review" }));
        throw new Error(err.detail || "Failed to submit review");
      }
      setShowRatingModal(false);
      setRatingOrder(null);
      fetchAllOrders();
      fetchMyListings();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const fetchAllOrders = useCallback(async () => {
    if (!token) return;
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
    }
  }, [token]);

  const openOrderModal = async (listing: MyListing) => {
    setOrderModalListing(listing);
    setShowOrderModal(true);
    setIsLoadingOrders(true);
    try {
      const res = await apiFetch("/api/orders");
      if (res.ok) {
        const allOrders: OrderData[] = await res.json();
        setListingOrders(
          allOrders.filter((o) => o.listing_id === listing.id && o.role === "seller" && o.status === "pending")
        );
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const openConfirmedOrderSummary = async (listingId: string) => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/orders");
      if (res.ok) {
        const allOrders: OrderData[] = await res.json();
        const order = allOrders.find((o) => o.listing_id === listingId && o.status === "confirmed");
        if (order) {
          const slot = order.selected_pickup_slots[0];
          setConfirmSummaryData({
            listing: {
              id: order.listing_id,
              title: order.listing_title,
              description: "",
              price: order.listing_price,
              condition: "",
              location: "",
              tags: [],
              imageUrl: order.listing_image,
              postedAt: 0,
              status: "sold",
            },
            buyerName: order.buyer_name,
            slot: slot || { date: "", time: "" },
            role: order.role as "seller" | "buyer",
            confirmedTime: order.confirmed_time,
            pickupAddress: order.address_released ? order.pickup_address : null,
            order,
          });
          setShowConfirmSummary(true);
        }
      }
    } catch {
      // ignore
    }
  };

  const handleConfirmSlot = async (orderId: number, slot: { date: string; time: string }, order: OrderData, confirmedTime: string) => {
    if (!token) return;
    setConfirmingOrderId(orderId);
    try {
      const res = await apiFetch(`/api/orders/${orderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed_slot: slot, confirmed_time: confirmedTime }),
      });
      if (res.ok) {
        setShowOrderModal(false);
        setOrderModalListing(null);
        setSelectedSlot(null);
        setConfirmTime("");
        if (orderModalListing) {
          setConfirmSummaryData({
            listing: orderModalListing,
            buyerName: order.buyer_name,
            slot,
            role: "seller",
            confirmedTime,
            order,
          });
          setShowConfirmSummary(true);
          onAddToHistory?.({
            id: orderModalListing.id,
            title: formatTitle(orderModalListing.brand, orderModalListing.name),
            imageUrl: orderModalListing.imageUrl,
            price: orderModalListing.price,
            type: "sold",
          });
        }
        fetchMyListings();
        fetchAllOrders();
      }
    } catch {
      // ignore
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const handleDeclineOrder = async (orderId: number) => {
    if (!token) return;
    setDecliningOrderId(orderId);
    try {
      const res = await apiFetch(`/api/orders/${orderId}/decline`, {
        method: "POST",
      });
      if (res.ok) {
        setListingOrders((prev) => prev.filter((o) => o.id !== orderId));
        setShowDeclineConfirm(null);
        fetchMyListings();
        fetchAllOrders();
      }
    } catch {
      // ignore
    } finally {
      setDecliningOrderId(null);
    }
  };

  const handleWithdrawOrder = async (orderId: number) => {
    if (!token) return;
    setWithdrawingOrderId(orderId);
    try {
      const res = await apiFetch(`/api/orders/${orderId}/withdraw`, {
        method: "POST",
      });
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
    try {
      const res = await apiFetch("/api/friends/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, [token]);

  const fetchMyListings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/listings/mine");
      if (res.ok) {
        const data = await res.json();
        setMyListings(data);
      }
    } catch (err) {
      console.error("Failed to fetch my listings:", err);
    } finally {
      setMyListingsLoaded(true);
    }
  }, [token]);

  const [relistingId, setRelistingId] = useState<string | null>(null);

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

  const handleRelist = async (listingId: string) => {
    if (!token) return;
    setRelistingId(listingId);
    try {
      const res = await apiFetch(`/api/listings/${listingId}/relist`, {
        method: "POST",
      });
      if (res.ok) {
        fetchMyListings();
      }
    } catch {
      // ignore
    } finally {
      setRelistingId(null);
    }
  };

  const fetchRecommended = useCallback(async () => {
    if (!token) return;
    setIsLoadingRecommended(true);
    try {
      const res = await apiFetch("/api/friends/recommended");
      if (res.ok) {
        const data = await res.json();
        setRecommendedFriends(data);
      }
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
      if (res.ok) {
        const data = await res.json();
        setFriendsList(data);
      }
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
      const res = await apiFetch(`/api/friends/${friendId}`, {
        method: "DELETE",
      });
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
      if (res.ok) {
        const data = await res.json();
        setCommunities(data);
      }
    } catch (err) {
      console.error("Failed to fetch communities:", err);
    } finally {
      setCommunitiesLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    fetchCommunities();
    fetchStats();
    fetchMyListings();
    fetchAllOrders();
  }, [fetchCommunities, fetchStats, fetchMyListings, fetchAllOrders]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("purchase_orders_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "purchase_orders",
        },
        () => {
          fetchAllOrders();
          fetchMyListings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchAllOrders, fetchMyListings]);

  // Auto-open order modal when routed from notification
  useEffect(() => {
    if (!pendingListingId) return;
    // Seller: open pending order modal. Check mySellerOrders directly rather
    // than relying solely on the cached pendingOrderCount on the listing,
    // since the count can lag behind the realtime order insert that triggered
    // the notification the user just clicked.
    const listing = myListings.find((l) => l.id === pendingListingId);
    const hasPendingSellerOrder = mySellerOrders.some(
      (o) => o.listing_id === pendingListingId && o.status === "pending",
    );
    if (listing && (hasPendingSellerOrder || (listing.pendingOrderCount ?? 0) > 0)) {
      openOrderModal(listing);
      onClearPendingListing?.();
      return;
    }
    // Buyer: open confirmed order summary
    const purchase = myPurchases.find((o) => o.listing_id === pendingListingId && o.status === "confirmed");
    if (purchase) {
      const slot = purchase.selected_pickup_slots[0];
      setConfirmSummaryData({
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
        },
        // For role=buyer, the "other party" label in the modal renders as
        // "Seller", so we populate `buyerName` with the seller's name here.
        // (The field name is a legacy artifact from when the modal was
        // seller-only; renaming would touch every call site.)
        buyerName: purchase.seller_name,
        slot: slot || { date: "", time: "" },
        role: "buyer",
        confirmedTime: purchase.confirmed_time,
        pickupAddress: purchase.address_released ? purchase.pickup_address : null,
        order: purchase,
      });
      setShowConfirmSummary(true);
      onClearPendingListing?.();
      return;
    }
    // Orders haven't been fetched yet — wait for the next render after the
    // first /api/orders call resolves. Previously this only waited when both
    // myListings + myPurchases were empty, which mis-cleared the pending
    // state for users who had own listings AND a brand-new confirmed purchase
    // (myListings populated, myPurchases still loading).
    if (!ordersLoaded) return;
    onClearPendingListing?.();
  }, [pendingListingId, myListings, myPurchases, mySellerOrders, ordersLoaded]);

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await apiFetch("/api/auth/profile-picture", {
        method: "PUT",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const updatedUser = await res.json();
      updateUser(updatedUser);
    } catch (err) {
      console.error("Profile picture upload failed:", err);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleJoinCommunity = async () => {
    if (!joinCode.trim() || !token) return;
    setIsJoining(true);
    setJoinError("");
    try {
      const res = await apiFetch("/api/communities/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
        const res = await apiFetch(`/api/communities/search?q=${encodeURIComponent(query.trim())}`, {
        });
        if (res.ok) {
          const data = await res.json();
          setCommunitySearchResults(data);
        }
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invite_code: inviteCode }),
      });
      if (res.ok) {
        setCommunitySearchResults((prev) =>
          prev.map((c) => (c.id === communityId ? { ...c, is_member: true } : c))
        );
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ community_id: communityId }),
      });
      if (res.ok) {
        setCommunitySearchResults((prev) =>
          prev.map((c) => (c.id === communityId ? { ...c, has_requested: true } : c))
        );
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ community_id: communityId }),
      });
      if (res.ok) {
        setCommunitySearchResults((prev) =>
          prev.map((c) => (c.id === communityId ? { ...c, has_requested: false } : c))
        );
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

      const res = await apiFetch("/api/communities", {
        method: "POST",
        body: formData,
      });

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

  const createFilteredNeighborhoods = createNeighborhood.trim()
    ? MANHATTAN_NEIGHBORHOODS.filter((n) =>
        n.toLowerCase().includes(createNeighborhood.trim().toLowerCase())
      )
    : MANHATTAN_NEIGHBORHOODS;

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
        // User cancelled — silently ignore
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
      if (res.ok) {
        const data = await res.json();
        setCommunityMembers(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingMembers(false);
    }
    // Fetch pending join requests for owners of private communities
    if (!community.is_public && community.created_by === user?.id) {
      setIsLoadingRequests(true);
      try {
        const res = await apiFetch(`/api/communities/${community.id}/requests`);
        if (res.ok) {
          setPendingRequests(await res.json());
        }
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
      const res = await apiFetch(`/api/communities/${communityId}/requests/${requestId}/accept`, {
        method: "POST",
      });
      if (res.ok) {
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
        // Refresh members list
        const membersRes = await apiFetch(`/api/communities/${communityId}/members`);
        if (membersRes.ok) {
          setCommunityMembers(await membersRes.json());
        }
        // Update member count
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
      const res = await apiFetch(`/api/communities/${communityId}/requests/${requestId}/reject`, {
        method: "POST",
      });
      if (res.ok) {
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      }
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
      const res = await apiFetch(`/api/communities/${communityId}/members/${memberId}`, {
        method: "DELETE",
      });
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
    setIsEditingCommunity(true);
  };

  const editCommunityFilteredNeighborhoods = editCommunityNeighborhood.trim()
    ? MANHATTAN_NEIGHBORHOODS.filter((n) =>
        n.toLowerCase().includes(editCommunityNeighborhood.trim().toLowerCase())
      )
    : MANHATTAN_NEIGHBORHOODS;

  const handleSaveCommunity = async () => {
    if (!selectedCommunity || !token) return;
    setIsSavingCommunity(true);
    try {
      const res = await apiFetch(`/api/communities/${selectedCommunity.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
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
      const res = await apiFetch(`/api/communities/${selectedCommunity.id}`, {
        method: "DELETE",
      });
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
      const res = await apiFetch(`/api/communities/${selectedCommunity.id}/leave`, {
        method: "DELETE",
      });
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

  // Cached friends list for invite search
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
    const available = allFriends.filter(
      (f) => !selectedFriends.some((s) => s.id === f.id)
    );
    if (!query.trim()) {
      setFriendResults(available);
      return;
    }
    const q = query.trim().toLowerCase();
    setFriendResults(
      available.filter((f) => f.display_name?.toLowerCase().includes(q))
    );
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          community_id: createdCommunity.id,
          user_ids: selectedFriends.map((f) => f.id),
        }),
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
        const res = await apiFetch(`/api/friends/search?q=${encodeURIComponent(query.trim())}`, {
        });
        if (res.ok) {
          const data = await res.json();
          setAddFriendsResults(data);
        }
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        // Update the search results to reflect the new friendship
        setAddFriendsResults((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_friend: true } : u))
        );
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

  const editIsValidNeighborhood = MANHATTAN_NEIGHBORHOODS.some(
    (n) => n.toLowerCase() === editNeighborhood.trim().toLowerCase()
  );

  const editFilteredNeighborhoods = editNeighborhood.trim()
    ? MANHATTAN_NEIGHBORHOODS.filter((n) =>
        n.toLowerCase().includes(editNeighborhood.trim().toLowerCase())
      )
    : MANHATTAN_NEIGHBORHOODS;

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

  const handleUpdateProfile = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) {
      setEditProfileError("Please enter your first and last name");
      return;
    }
    if (!editIsValidNeighborhood) {
      setEditProfileError("Please select a valid Manhattan neighborhood");
      return;
    }

    setIsUpdatingProfile(true);
    setEditProfileError("");

    try {
      const res = await apiFetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
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
    } catch (err) {
      setEditProfileError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Close create location suggestions on click outside
  useClickOutside(
    [createLocationRef, createLocationSuggestionsRef],
    () => setCreateShowLocationSuggestions(false),
    createShowLocationSuggestions,
  );

  // Close edit suggestions on click outside
  useClickOutside(
    [editNeighborhoodRef, editSuggestionsRef],
    () => setEditShowSuggestions(false),
    editShowSuggestions,
  );

  // Close edit community neighborhood suggestions on click outside
  useClickOutside(
    [editCommunityNeighborhoodRef, editCommunitySuggestionsRef],
    () => setEditCommunityShowSuggestions(false),
    editCommunityShowSuggestions,
  );

  return (
    <section className="py-10 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
      <div className="max-w-5xl mx-auto">
        {/* Profile Header */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-8">
          <div className="flex items-center gap-6">
            {/* Profile Picture */}
            <div className="relative group">
              <div className="size-24 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 border-2 border-white/10 flex items-center justify-center overflow-hidden">
                {user?.profile_picture ? (
                  <img
                    src={user.profile_picture}
                    alt={user.display_name || "Profile"}
                    className="size-full object-cover"
                  />
                ) : (
                  <User className="size-10 text-white/60" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {isUploading ? (
                  <Loader2 className="size-5 text-white/80 animate-spin" />
                ) : (
                  <Camera className="size-5 text-white/80" />
                )}
              </button>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-zinc-900 border-2 border-white/10 rounded-full px-2 py-0.5 z-10">
                <span className="text-xs font-semibold text-white">
                  {((stats.avg_seller_rating + stats.avg_buyer_rating) / 2).toFixed(1)}
                </span>
                <Star className="size-2.5 text-amber-400 fill-amber-400" />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProfilePictureUpload}
              />
            </div>

            {/* Name & Neighborhood */}
            <div className="flex-1">
              <h1 className="text-2xl font-light tracking-wider mb-1">
                {user?.display_name || "User"}
              </h1>
              <p className="text-white/50 text-sm flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {user?.neighborhood || "Manhattan"}
              </p>
              <p className="text-white/30 text-xs mt-1">
                Member since {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </p>

              {/* Metrics Row */}
              <div className="flex items-center gap-4 mt-3">
                <button
                  onClick={() => setShowListingsModal(true)}
                  className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/10 hover:border-white/20 transition-colors cursor-pointer"
                >
                  <span className="text-xs font-medium">{stats.total_listings}</span>
                  <span className="text-[10px] text-white/40">Listings</span>
                </button>
                <button
                  onClick={() => { setListingsTab("buying"); setShowListingsModal(true); }}
                  className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/10 hover:border-white/20 transition-colors cursor-pointer"
                >
                  <span className="text-xs font-medium">{stats.purchases}</span>
                  <span className="text-[10px] text-white/40">Purchases</span>
                </button>
                <button
                  onClick={openFriendsModal}
                  className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/10 hover:border-white/20 transition-colors cursor-pointer"
                >
                  <span className="text-xs font-medium">{stats.friends_count}</span>
                  <span className="text-[10px] text-white/40">Friends</span>
                </button>
              </div>
            </div>

            {/* Edit Profile & Add Friends */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={openEditProfileModal}
                variant="outline"
                size="sm"
                className="bg-white/5 border-white/20 text-white/60 hover:text-white hover:bg-white/10 text-xs"
              >
                Edit Profile
              </Button>
              <Button
                onClick={openAddFriendsModal}
                size="sm"
                className="bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-400/20 text-xs"
              >
                <UserPlus className="size-3.5" />
                Add Friends
              </Button>
            </div>
          </div>
        </div>

        {/* Communities Section */}
        <div className="mb-10">
          <h2 className="text-lg font-light tracking-wider mb-4 text-white/80">Communities</h2>
          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2">
            {/* My Neighborhood Virtual Tile */}
            {user?.neighborhood && (
              <div
                className="relative bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10 border border-cyan-400/20 rounded-lg p-2 hover:from-cyan-500/15 hover:to-fuchsia-500/15 transition-colors aspect-square flex flex-col items-center justify-center gap-1.5 cursor-default"
              >
                <div className="size-10 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                  <MapPin className="size-5 text-cyan-400" />
                </div>
                <div className="min-w-0 w-full text-center">
                  <h3 className="text-[11px] font-medium truncate leading-tight">My Neighborhood</h3>
                  <p className="text-[9px] text-white/30 truncate mt-0.5">{user.neighborhood}</p>
                </div>
              </div>
            )}

            {/* Community Tiles (skeletons on initial cold load) */}
            {!communitiesLoaded && communities.length === 0 &&
              Array.from({ length: 6 }).map((_, i) => (
                <CommunityCardSkeleton key={`community-skeleton-${i}`} />
              ))}
            {communities.map((community) => (
              <div
                key={community.id}
                onClick={() => openCommunityDetail(community)}
                className="relative bg-white/5 border border-white/10 rounded-lg p-2 hover:bg-white/[0.07] transition-colors aspect-square flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <div className="absolute top-1.5 left-1.5" title={community.is_public ? "Public community" : "Private community"}>
                  {community.is_public ? (
                    <Globe className="size-3 text-white/25 hover:text-white/50 transition-colors" />
                  ) : (
                    <Lock className="size-3 text-white/25 hover:text-white/50 transition-colors" />
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); shareCommunity(community); }}
                  className="absolute top-1.5 right-1.5 text-white/25 hover:text-white/60 transition-colors p-0.5"
                  title="Share community"
                >
                  <Send className="size-3" />
                </button>
                <div className="size-10 rounded-full bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 flex items-center justify-center overflow-hidden shrink-0">
                  {community.image ? (
                    <img src={community.image} alt={community.name} className="size-full object-cover" />
                  ) : (
                    <Globe className="size-5 text-cyan-400" />
                  )}
                </div>
                <div className="min-w-0 w-full text-center">
                  <h3 className="text-[11px] font-medium truncate leading-tight">
                    {community.name}
                  </h3>
                  {community.neighborhood && (
                    <div className="flex items-center justify-center gap-0.5 mt-0.5">
                      <MapPin className="size-2.5 text-white/30 shrink-0" />
                      <span className="text-[9px] text-white/30 truncate">{community.neighborhood}</span>
                    </div>
                  )}
                  <p className="text-[9px] text-white/25 mt-0.5">
                    {community.member_count} {community.member_count === 1 ? "member" : "members"}
                  </p>
                </div>
              </div>
            ))}

            {/* Join / Create Community Tile */}
            <button
              onClick={() => setShowJoinModal(true)}
              className="bg-white/[0.02] border border-dashed border-white/15 rounded-lg p-2 hover:bg-white/5 hover:border-white/25 transition-all flex flex-col items-center justify-center gap-1.5 aspect-square cursor-pointer"
            >
              <div className="size-10 rounded-full bg-white/5 flex items-center justify-center">
                <Plus className="size-4 text-white/40" />
              </div>
              <span className="text-[9px] text-white/40">Join or Create</span>
            </button>
          </div>
        </div>

        {/* User Dashboard */}
        <div className="mb-10">
          <h2 className="text-lg font-light tracking-wider mb-4 text-white/80">User Dashboard</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* My Listings */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="size-8 rounded-lg bg-fuchsia-500/15 flex items-center justify-center">
                <Package className="size-4 text-fuchsia-400" />
              </div>
              <h3 className="text-sm font-medium">My Orders</h3>
            </div>

            {/* Selling / Buying tabs */}
            <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg mb-4">
              <button
                onClick={() => setListingsTab("selling")}
                className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${listingsTab === "selling" ? "bg-fuchsia-500/20 text-fuchsia-300 font-medium" : "text-white/40 hover:text-white/60"}`}
              >
                Selling
              </button>
              <button
                onClick={() => setListingsTab("buying")}
                className={`flex-1 text-xs py-1.5 rounded-md transition-colors relative ${listingsTab === "buying" ? "bg-cyan-500/20 text-cyan-300 font-medium" : "text-white/40 hover:text-white/60"}`}
              >
                Buying
                {myPurchases.filter((o) => o.status === "pending" || o.status === "confirmed").length > 0 && listingsTab !== "buying" && (
                  <span className="absolute -top-1 -right-1 size-4 bg-cyan-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                    {myPurchases.filter((o) => o.status === "pending" || o.status === "confirmed").length}
                  </span>
                )}
              </button>
            </div>

            {listingsTab === "selling" ? (
              <>
                {!myListingsLoaded && myListings.length === 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <ListingCardSkeleton key={i} />
                    ))}
                  </div>
                ) : myListings.length === 0 ? (
                  <div className="text-center py-6">
                    <Package className="size-8 text-white/15 mx-auto mb-2" />
                    <p className="text-xs text-white/30 mb-3">No listings yet</p>
                    <Button
                      onClick={() => onNavigate("home")}
                      size="sm"
                      className="bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25 border border-fuchsia-400/20 text-xs"
                    >
                      Create Listing
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {[...myListings].sort((a, b) => {
                      const aOrders = a.pendingOrderCount ?? 0;
                      const bOrders = b.pendingOrderCount ?? 0;
                      if (aOrders !== bOrders) return bOrders - aOrders;
                      const aTime = a.latestOrderAt || "";
                      const bTime = b.latestOrderAt || "";
                      if (aTime !== bTime) return bTime > aTime ? 1 : -1;
                      return 0;
                    }).map((listing) => {
                      const timeInfo = getListingTimeInfo(listing.postedAt);
                      const hasPendingOrders = (listing.pendingOrderCount ?? 0) > 0;
                      const sellerOrder = mySellerOrders.find((o) => o.listing_id === listing.id && (o.status === "confirmed" || o.status === "completed"));
                      const sellerCountdown = sellerOrder ? getPickupCountdown(sellerOrder) : null;
                      const sellerHasReviewed = sellerOrder?.seller_reviewed ?? false;
                      const buyerHasReviewed = sellerOrder?.buyer_reviewed ?? false;
                      const isSellerPickupReady = sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && !sellerHasReviewed;
                      const isSellerWaitingForBuyer = sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && sellerHasReviewed && !buyerHasReviewed;
                      const isSellerCompleted = sellerOrder && sellerOrder.status === "completed";

                      return (
                        <div
                          key={listing.id}
                          className={`flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer ${
                            timeInfo.expired
                              ? "bg-red-500/[0.03] border-red-500/10 opacity-60"
                              : isSellerPickupReady
                                ? "bg-green-500/[0.05] border-green-400/30 hover:bg-green-500/[0.08]"
                                : isSellerWaitingForBuyer
                                  ? "bg-amber-500/[0.05] border-amber-400/20"
                                  : hasPendingOrders
                                    ? "bg-cyan-500/[0.05] border-cyan-400/30 hover:bg-cyan-500/[0.08]"
                                    : sellerOrder && sellerOrder.status === "confirmed"
                                      ? "bg-green-500/[0.03] border-green-400/20"
                                      : "bg-white/[0.03] border-white/5 hover:bg-white/5"
                          }`}
                          onClick={() => {
                            if (timeInfo.expired) return;
                            if (isSellerPickupReady && sellerOrder) openRatingModal(sellerOrder);
                            else if (isSellerWaitingForBuyer) return;
                            else if (hasPendingOrders) openOrderModal(listing);
                            else if (sellerOrder) openConfirmedOrderSummary(listing.id);
                            else openEditListing(listing);
                          }}
                        >
                          <div className="relative shrink-0">
                            <img src={listing.imageUrl} alt={formatTitle(listing.brand, listing.name)} className="size-10 rounded-md object-cover border border-white/10" />
                            {hasPendingOrders && (
                              <span className="absolute -top-1 -right-1 size-4 bg-cyan-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                                {listing.pendingOrderCount}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white/80 truncate">{formatTitle(listing.brand, listing.name)}</p>
                            <div className="flex items-center gap-1.5">
                              {isSellerCompleted ? (
                                <span className="text-[10px] text-white/30">Completed</span>
                              ) : isSellerWaitingForBuyer ? (
                                <span className="text-[10px] text-amber-400">Waiting for buyer to confirm pickup</span>
                              ) : isSellerPickupReady ? (
                                <span className="text-[10px] text-green-400">Confirm Pickup</span>
                              ) : sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown ? (
                                <span className="text-[10px] text-green-400">{sellerCountdown.label} till pickup{sellerOrder.confirmed_time ? ` at ${sellerOrder.confirmed_time}` : ""}</span>
                              ) : hasPendingOrders ? (
                                <span className="text-[10px] text-cyan-400">{listing.pendingOrderCount} pending {listing.pendingOrderCount === 1 ? "order" : "orders"}</span>
                              ) : (
                                <>
                                  <Clock className="size-2.5 text-white/20" />
                                  <p className={`text-[10px] ${timeInfo.expired ? "text-red-400" : "text-white/30"}`}>{timeInfo.label}</p>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs font-medium text-fuchsia-400">${listing.price}</span>
                            {(() => {
                              const cta = getSellerListingCtaState({
                                timeExpired: timeInfo.expired,
                                isSellerWaitingForBuyer,
                                isSellerPickupReady,
                                sellerOrderStatus: sellerOrder?.status ?? null,
                                hasPendingOrders,
                              });
                              if (cta === "expired") return (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRelist(listing.id); }}
                                  disabled={relistingId === listing.id}
                                  className="flex items-center gap-1 text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-full border border-cyan-400/20 hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
                                >
                                  {relistingId === listing.id ? <Loader2 className="size-3 animate-spin" /> : <><RotateCcw className="size-2.5" />Relist</>}
                                </button>
                              );
                              if (cta === "default") return <Pencil className="size-3 text-white/20" />;
                              const badge = SELLER_LISTING_CTA_BADGE[cta];
                              return <span className={badge.className}>{badge.label}</span>;
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="flex justify-between text-xs text-white/30">
                    <span>Active</span>
                    <span>{myListings.filter((l) => !getListingTimeInfo(l.postedAt).expired).length}</span>
                  </div>
                  <div className="flex justify-between text-xs text-white/30 mt-1">
                    <span>Expired</span>
                    <span>{myListings.filter((l) => getListingTimeInfo(l.postedAt).expired).length}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {myPurchases.length === 0 ? (
                  <div className="text-center py-6">
                    <ShoppingBag className="size-8 text-white/15 mx-auto mb-2" />
                    <p className="text-xs text-white/30 mb-3">No purchases yet</p>
                    <Button
                      onClick={() => onNavigate("market")}
                      size="sm"
                      className="bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-400/20 text-xs"
                    >
                      Browse Market
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {myPurchases.map((order) => {
                      const countdown = getPickupCountdown(order);
                      const viewState = getBuyerOrderViewState({
                        status: order.status,
                        countdownExpired: countdown.expired,
                        hasReviewed: order.buyer_reviewed,
                        otherReviewed: order.seller_reviewed,
                      });
                      const badge = BUYER_ORDER_BADGE[viewState];

                      return (
                        <div key={order.id}>
                        <div
                          className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${BUYER_ORDER_CONTAINER_CLASS[viewState]}`}
                          onClick={() => {
                            if (viewState === "declined" || viewState === "withdrawn" || viewState === "expired" || viewState === "waitingForOther") return;
                            if (viewState === "pickupReady") openRatingModal(order);
                            else if (order.status === "confirmed") openConfirmedOrderSummary(order.listing_id);
                          }}
                        >
                          <img src={order.listing_image} alt={order.listing_title} className="size-10 rounded-md object-cover border border-white/10 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white/80 truncate">{order.listing_title}</p>
                            <div className="flex items-center gap-1.5">
                              {viewState === "declined" ? (
                                <span className="text-[10px] text-red-400/70">Order was declined</span>
                              ) : viewState === "withdrawn" ? (
                                <span className="text-[10px] text-white/40">Order withdrawn</span>
                              ) : viewState === "expired" ? (
                                <span className="text-[10px] text-white/40">Order expired</span>
                              ) : viewState === "waitingForOther" ? (
                                <span className="text-[10px] text-amber-400">Waiting for seller to confirm pickup</span>
                              ) : viewState === "pickupReady" ? (
                                <span className="text-[10px] text-green-400">Confirm Pickup</span>
                              ) : viewState === "confirmedCountdown" ? (
                                <span className="text-[10px] text-green-400">{countdown.label} till pickup{order.confirmed_time ? ` at ${order.confirmed_time}` : ""}</span>
                              ) : (
                                <p className="text-[10px] text-white/30">
                                  {order.created_at ? new Date(order.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                                </p>
                              )}
                            </div>
                            {order.address_released && order.pickup_address && (
                              <p className="text-[10px] text-green-400/80 flex items-center gap-1 mt-0.5">
                                <MapPin className="size-2.5" />{order.pickup_address}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs font-medium text-fuchsia-400">${order.listing_price}</span>
                            <span className={badge.className}>{badge.label}</span>
                            {order.status === "pending" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowWithdrawConfirm(showWithdrawConfirm === order.id ? null : order.id);
                                }}
                                className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                              >
                                Withdraw
                              </button>
                            )}
                          </div>
                        </div>
                        {showWithdrawConfirm === order.id && (
                          <div className="mt-1.5 bg-amber-500/[0.05] border border-amber-400/20 rounded-lg p-2">
                            <p className="text-[10px] text-white/60 mb-2">Withdraw your order? You can re-order later.</p>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setShowWithdrawConfirm(null)}
                                className="flex-1 text-[10px] text-white/40 bg-white/5 border border-white/10 rounded py-1 hover:bg-white/10"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleWithdrawOrder(order.id)}
                                disabled={withdrawingOrderId === order.id}
                                className="flex-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-400/20 rounded py-1 hover:bg-amber-500/20 disabled:opacity-40"
                              >
                                {withdrawingOrderId === order.id ? "..." : "Withdraw"}
                              </button>
                            </div>
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="flex justify-between text-xs text-white/30">
                    <span>Active</span>
                    <span>{myPurchases.filter((o) => o.status === "pending" || o.status === "confirmed").length}</span>
                  </div>
                  <div className="flex justify-between text-xs text-white/30 mt-1">
                    <span>Completed</span>
                    <span>{myPurchases.filter((o) => o.status === "completed").length}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Wishlist */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="size-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                <Heart className="size-4 text-red-400" />
              </div>
              <h3 className="text-sm font-medium">Wishlist</h3>
            </div>

            {wishlistItems.length === 0 ? (
              <div className="text-center py-4">
                <Heart className="size-6 text-white/15 mx-auto mb-2" />
                <p className="text-xs text-white/30 mb-2">Nothing saved yet</p>
                <Button onClick={() => onNavigate("market")} size="sm" className="bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-400/20 text-xs">
                  Browse Market
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {wishlistItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => openListingDetail?.(item)}
                  >
                    <img src={item.imageUrls && item.imageUrls.length > 0 ? item.imageUrls[0] : item.imageUrl} alt={formatTitle(item.brand, item.name)} className="size-10 rounded-md object-cover shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{formatTitle(item.brand, item.name)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] text-fuchsia-400">${item.price}</p>
                        {item.status === "sold" && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/30">Sold</span>
                        )}
                      </div>
                    </div>
                    {onToggleWishlist && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleWishlist(item.id); }}
                        className="p-1 rounded-full hover:bg-white/10 transition-colors shrink-0"
                      >
                        <Heart className="size-3.5 text-red-400 fill-red-400" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex justify-between text-xs text-white/30">
                <span>Saved Items</span>
                <span>{wishlistItems.length}</span>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="size-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                <SlidersHorizontal className="size-4 text-cyan-400" />
              </div>
              <h3 className="text-sm font-medium">Preferences</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-white/50">Notifications</span>
                <span className="text-xs text-white/30">Off</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-white/50">Pickup Radius</span>
                <span className="text-xs text-white/30">1 mile</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-white/50">Price Alerts</span>
                <span className="text-xs text-white/30">Off</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-white/50">Visibility</span>
                <span className="text-xs text-white/30">Public</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/5">
              <Button
                onClick={() => onNavigate("settings")}
                variant="ghost"
                size="sm"
                className="w-full text-xs text-white/40 hover:text-white/60"
              >
                Manage Settings
              </Button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Join Community Modal */}
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

      {/* Create Community Modal */}
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

      {/* Share Community Modal */}
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
      {/* Edit Profile Modal */}
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

      {/* Add Friends Modal */}
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
      {/* Listings Modal */}
      {showListingsModal && (
        <ModalShell
          open
          onClose={() => setShowListingsModal(false)}
          z={50}
        >
          <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={() => setShowListingsModal(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
                <Package className="size-5 text-fuchsia-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium">My Orders</h3>
                <p className="text-xs text-white/40">
                  {listingsTab === "selling"
                    ? `${myListings.length} listing${myListings.length !== 1 ? "s" : ""}`
                    : `${myPurchases.length} order${myPurchases.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>

            {/* Selling / Buying tabs */}
            <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg mb-4">
              <button
                onClick={() => setListingsTab("selling")}
                className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${listingsTab === "selling" ? "bg-fuchsia-500/20 text-fuchsia-300 font-medium" : "text-white/40 hover:text-white/60"}`}
              >
                Selling
              </button>
              <button
                onClick={() => setListingsTab("buying")}
                className={`flex-1 text-xs py-1.5 rounded-md transition-colors relative ${listingsTab === "buying" ? "bg-cyan-500/20 text-cyan-300 font-medium" : "text-white/40 hover:text-white/60"}`}
              >
                Buying
                {myPurchases.filter((o) => o.status === "pending" || o.status === "confirmed").length > 0 && listingsTab !== "buying" && (
                  <span className="absolute -top-1 -right-1 size-4 bg-cyan-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                    {myPurchases.filter((o) => o.status === "pending" || o.status === "confirmed").length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {listingsTab === "selling" ? (
                myListings.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="size-10 text-white/15 mx-auto mb-3" />
                    <p className="text-sm text-white/30 mb-1">No listings yet</p>
                    <p className="text-xs text-white/20">Create your first listing from the homepage</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...myListings].sort((a, b) => {
                      const aOrders = a.pendingOrderCount ?? 0;
                      const bOrders = b.pendingOrderCount ?? 0;
                      if (aOrders !== bOrders) return bOrders - aOrders;
                      const aTime = a.latestOrderAt || "";
                      const bTime = b.latestOrderAt || "";
                      if (aTime !== bTime) return bTime > aTime ? 1 : -1;
                      return 0;
                    }).map((listing) => {
                      const timeInfo = getListingTimeInfo(listing.postedAt);
                      const hasPendingOrders = (listing.pendingOrderCount ?? 0) > 0;
                      const sellerOrder = mySellerOrders.find((o) => o.listing_id === listing.id && (o.status === "confirmed" || o.status === "completed"));
                      const sellerCountdown = sellerOrder ? getPickupCountdown(sellerOrder) : null;
                      const sellerHasReviewed = sellerOrder?.seller_reviewed ?? false;
                      const buyerHasReviewedM = sellerOrder?.buyer_reviewed ?? false;
                      const isSellerPickupReady = sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && !sellerHasReviewed;
                      const isSellerWaitingForBuyerM = sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && sellerHasReviewed && !buyerHasReviewedM;
                      const isSellerCompletedM = sellerOrder && sellerOrder.status === "completed";

                      return (
                        <div
                          key={listing.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                            timeInfo.expired
                              ? "bg-red-500/[0.03] border-red-500/10 opacity-60"
                              : isSellerPickupReady
                                ? "bg-green-500/[0.05] border-green-400/30 hover:bg-green-500/[0.08]"
                                : isSellerWaitingForBuyerM
                                  ? "bg-amber-500/[0.05] border-amber-400/20"
                                  : hasPendingOrders
                                    ? "bg-cyan-500/[0.05] border-cyan-400/30 hover:bg-cyan-500/[0.08]"
                                    : sellerOrder && sellerOrder.status === "confirmed"
                                      ? "bg-green-500/[0.03] border-green-400/20"
                                      : "bg-white/[0.03] border-white/5 hover:bg-white/5"
                          }`}
                          onClick={() => {
                            setShowListingsModal(false);
                            if (timeInfo.expired) return;
                            if (isSellerPickupReady && sellerOrder) openRatingModal(sellerOrder);
                            else if (isSellerWaitingForBuyerM) return;
                            else if (hasPendingOrders) openOrderModal(listing);
                            else if (sellerOrder) openConfirmedOrderSummary(listing.id);
                            else openEditListing(listing);
                          }}
                        >
                          <div className="relative shrink-0">
                            <img src={listing.imageUrl} alt={formatTitle(listing.brand, listing.name)} className="size-14 rounded-lg object-cover border border-white/10" />
                            {hasPendingOrders && (
                              <span className="absolute -top-1 -right-1 size-4 bg-cyan-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                                {listing.pendingOrderCount}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white/80 truncate">{formatTitle(listing.brand, listing.name)}</p>
                            <div className="flex items-center gap-1.5">
                              {isSellerCompletedM ? (
                                <span className="text-[10px] text-white/30">Completed</span>
                              ) : isSellerWaitingForBuyerM ? (
                                <span className="text-[10px] text-amber-400">Waiting for buyer to confirm pickup</span>
                              ) : isSellerPickupReady ? (
                                <span className="text-[10px] text-green-400">Confirm Pickup</span>
                              ) : sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown ? (
                                <span className="text-[10px] text-green-400">{sellerCountdown.label} till pickup{sellerOrder.confirmed_time ? ` at ${sellerOrder.confirmed_time}` : ""}</span>
                              ) : hasPendingOrders ? (
                                <span className="text-[10px] text-cyan-400">{listing.pendingOrderCount} pending {listing.pendingOrderCount === 1 ? "order" : "orders"}</span>
                              ) : (
                                <>
                                  <Clock className="size-2.5 text-white/20" />
                                  <p className={`text-[10px] ${timeInfo.expired ? "text-red-400" : "text-white/30"}`}>{timeInfo.label}</p>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-sm font-medium text-fuchsia-400">${listing.price}</span>
                            {timeInfo.expired ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRelist(listing.id); }}
                                disabled={relistingId === listing.id}
                                className="flex items-center gap-1 text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-full border border-cyan-400/20 hover:bg-cyan-500/20 transition-colors disabled:opacity-40"
                              >
                                {relistingId === listing.id ? <Loader2 className="size-3 animate-spin" /> : <><RotateCcw className="size-2.5" />Relist</>}
                              </button>
                            ) : isSellerWaitingForBuyerM ? (
                              <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-400/20">Awaiting Buyer</span>
                            ) : isSellerPickupReady ? (
                              <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-400/20">Confirm Pickup</span>
                            ) : hasPendingOrders ? (
                              <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-400/20">Review</span>
                            ) : (
                              <Pencil className="size-3.5 text-white/20" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                myPurchases.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingBag className="size-10 text-white/15 mx-auto mb-3" />
                    <p className="text-sm text-white/30 mb-1">No purchases yet</p>
                    <p className="text-xs text-white/20">Browse the market to find items</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myPurchases.map((order) => {
                      const countdown = getPickupCountdown(order);
                      const hasReviewed = order.buyer_reviewed;
                      const otherReviewed = order.seller_reviewed;
                      const isPickupReady = order.status === "confirmed" && countdown.expired && !hasReviewed;
                      const isWaitingForOther = order.status === "confirmed" && countdown.expired && hasReviewed && !otherReviewed;
                      const isConfirmedCountdown = order.status === "confirmed" && !countdown.expired;
                      const isCompleted = order.status === "completed";
                      const isDeclined = order.status === "declined";
                      const isWithdrawn = order.status === "withdrawn";
                      const isExpired = order.status === "expired";

                      return (
                        <div key={order.id}>
                        <div
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                            isDeclined
                              ? "bg-red-500/[0.03] border-red-500/10 opacity-60"
                              : isWithdrawn || isExpired
                                ? "bg-white/[0.02] border-white/5 opacity-50"
                                : isPickupReady
                                  ? "bg-green-500/[0.05] border-green-400/30 hover:bg-green-500/[0.08] cursor-pointer"
                                  : isWaitingForOther
                                    ? "bg-amber-500/[0.05] border-amber-400/20"
                                    : isConfirmedCountdown
                                      ? "bg-green-500/[0.03] border-green-400/20 hover:bg-green-500/[0.06] cursor-pointer"
                                      : "bg-white/[0.03] border-white/5"
                          }`}
                          onClick={() => {
                            if (isDeclined || isWithdrawn || isExpired || isWaitingForOther) return;
                            setShowListingsModal(false);
                            if (isPickupReady) openRatingModal(order);
                            else if (order.status === "confirmed") openConfirmedOrderSummary(order.listing_id);
                          }}
                        >
                          <img src={order.listing_image} alt={order.listing_title} className="size-14 rounded-lg object-cover border border-white/10 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white/80 truncate">{order.listing_title}</p>
                            <div className="flex items-center gap-1.5">
                              {isDeclined ? (
                                <span className="text-[10px] text-red-400/70">Order was declined</span>
                              ) : isWithdrawn ? (
                                <span className="text-[10px] text-white/40">Order withdrawn</span>
                              ) : isExpired ? (
                                <span className="text-[10px] text-white/40">Order expired</span>
                              ) : isWaitingForOther ? (
                                <span className="text-[10px] text-amber-400">Waiting for seller to confirm pickup</span>
                              ) : isPickupReady ? (
                                <span className="text-[10px] text-green-400">Confirm Pickup</span>
                              ) : isConfirmedCountdown ? (
                                <span className="text-[10px] text-green-400">{countdown.label} till pickup{order.confirmed_time ? ` at ${order.confirmed_time}` : ""}</span>
                              ) : (
                                <p className="text-[10px] text-white/30">
                                  {order.created_at ? new Date(order.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                                </p>
                              )}
                            </div>
                            {order.address_released && order.pickup_address && (
                              <p className="text-[10px] text-green-400/80 flex items-center gap-1 mt-0.5">
                                <MapPin className="size-2.5" />{order.pickup_address}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-sm font-medium text-fuchsia-400">${order.listing_price}</span>
                            {isDeclined ? (
                              <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-400/20">Declined</span>
                            ) : isWithdrawn ? (
                              <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">Withdrawn</span>
                            ) : isExpired ? (
                              <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">Expired</span>
                            ) : isWaitingForOther ? (
                              <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-400/20">Awaiting Seller</span>
                            ) : isPickupReady ? (
                              <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-400/20">Confirm Pickup</span>
                            ) : isConfirmedCountdown ? (
                              <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-400/20">Confirmed</span>
                            ) : isCompleted ? (
                              <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">Completed</span>
                            ) : (
                              <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-400/20">Pending</span>
                            )}
                            {order.status === "pending" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowWithdrawConfirm(showWithdrawConfirm === order.id ? null : order.id);
                                }}
                                className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                              >
                                Withdraw
                              </button>
                            )}
                          </div>
                        </div>
                        {showWithdrawConfirm === order.id && (
                          <div className="mt-1.5 bg-amber-500/[0.05] border border-amber-400/20 rounded-lg p-2">
                            <p className="text-[10px] text-white/60 mb-2">Withdraw your order? You can re-order later.</p>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setShowWithdrawConfirm(null)}
                                className="flex-1 text-[10px] text-white/40 bg-white/5 border border-white/10 rounded py-1 hover:bg-white/10"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleWithdrawOrder(order.id)}
                                disabled={withdrawingOrderId === order.id}
                                className="flex-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-400/20 rounded py-1 hover:bg-amber-500/20 disabled:opacity-40"
                              >
                                {withdrawingOrderId === order.id ? "..." : "Withdraw"}
                              </button>
                            </div>
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>
        </ModalShell>
      )}

      {/* Friends List Modal */}
      <FriendsListModal
        open={showFriendsModal}
        friendsList={friendsList}
        isLoading={isLoadingFriends}
        removingFriendId={removingFriendId}
        onClose={() => setShowFriendsModal(false)}
        onViewUser={onViewUser}
        onRemoveFriend={handleRemoveFriend}
      />

      {/* Community Detail Modal */}
      {showCommunityDetail && selectedCommunity && (
        <ModalShell
          open
          onClose={() => { setShowCommunityDetail(false); setIsEditingCommunity(false); setShowDeleteConfirm(false); }}
          z={50}
        >
          <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={() => { setShowCommunityDetail(false); setIsEditingCommunity(false); setShowDeleteConfirm(false); }}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            {/* Delete Confirmation Overlay */}
            {showDeleteConfirm && (
              <div className="absolute inset-0 z-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(24, 24, 27, 0.95)" }}>
                <div className="text-center px-6">
                  <div className="size-12 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="size-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">Delete Community</h3>
                  <p className="text-sm text-white/50 mb-6">
                    Are you sure you want to delete <span className="text-white/80 font-medium">{selectedCommunity.name}</span>? This action cannot be undone and all members will be removed.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 bg-white/10 hover:bg-white/15 text-white border-0"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeleteCommunity}
                      disabled={isDeletingCommunity}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white border-0"
                    >
                      {isDeletingCommunity ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {isEditingCommunity ? (
              /* Edit Mode */
              <>
                <div className="flex items-center gap-3 mb-5">
                  <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
                    <Pencil className="size-5 text-fuchsia-400" />
                  </div>
                  <h3 className="text-lg font-medium">Edit Community</h3>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Name</label>
                    <Input
                      value={editCommunityName}
                      onChange={(e) => setEditCommunityName(e.target.value)}
                      className="bg-white/5 border-white/20 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Description</label>
                    <textarea
                      value={editCommunityDescription}
                      onChange={(e) => setEditCommunityDescription(e.target.value)}
                      rows={3}
                      className="w-full rounded-md bg-white/5 border border-white/20 text-white text-sm px-3 py-2 resize-none focus:outline-none focus:border-white/40"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Pickup Address</label>
                    <Input
                      value={editCommunityPickupAddress}
                      onChange={(e) => setEditCommunityPickupAddress(e.target.value)}
                      placeholder="Street address"
                      className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Neighborhood</label>
                    <Input
                      ref={editCommunityNeighborhoodRef}
                      value={editCommunityNeighborhood}
                      onChange={(e) => setEditCommunityNeighborhood(e.target.value)}
                      placeholder="e.g., Upper West Side"
                      className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-white/40 mb-1 block">City</label>
                      <Input
                        value="New York"
                        disabled
                        className="bg-white/5 border-white/20 text-white/50 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/40 mb-1 block">State</label>
                      <Input
                        value="NY"
                        disabled
                        className="bg-white/5 border-white/20 text-white/50 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Zip Code</label>
                    <Input
                      value={editCommunityZipCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^\d-]/g, "").slice(0, 10);
                        setEditCommunityZipCode(val);
                      }}
                      placeholder="e.g., 10001"
                      className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {editCommunityIsPublic ? (
                        <Unlock className="size-4 text-green-400" />
                      ) : (
                        <Lock className="size-4 text-amber-400" />
                      )}
                      <span className="text-sm text-white/70">
                        {editCommunityIsPublic ? "Public" : "Private"}
                      </span>
                    </div>
                    <button
                      onClick={() => setEditCommunityIsPublic(!editCommunityIsPublic)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        editCommunityIsPublic ? "bg-green-500/30" : "bg-white/10"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                          editCommunityIsPublic ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Delete Community */}
                  <div className="pt-4 border-t border-white/10">
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 text-red-400/70 hover:text-red-400 transition-colors text-sm"
                    >
                      <Trash2 className="size-4" />
                      Delete Community
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <Button
                    onClick={() => setIsEditingCommunity(false)}
                    className="flex-1 bg-white/10 hover:bg-white/15 text-white border-0"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveCommunity}
                    disabled={isSavingCommunity || !editCommunityName.trim()}
                    className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40"
                  >
                    {isSavingCommunity ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </>
            ) : (
              /* View Mode */
              <>
                {/* Header */}
                <div className="flex items-start gap-3 mb-5 pr-8">
                  <div className="size-12 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 flex items-center justify-center overflow-hidden shrink-0">
                    {selectedCommunity.image ? (
                      <img src={selectedCommunity.image} alt={selectedCommunity.name} className="size-full object-cover rounded-xl" />
                    ) : (
                      <Globe className="size-6 text-cyan-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium truncate">{selectedCommunity.name}</h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      {selectedCommunity.neighborhood && (
                        <div className="flex items-center gap-1">
                          <MapPin className="size-3 text-white/30" />
                          <span className="text-xs text-white/40">{selectedCommunity.neighborhood}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Users className="size-3 text-white/30" />
                        <span className="text-xs text-white/40">{selectedCommunity.member_count} members</span>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedCommunity.description && (
                  <p className="text-sm text-white/50 mb-4">{selectedCommunity.description}</p>
                )}

                {/* Invite Code */}
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 mb-4">
                  <span className="text-xs text-white/30">Invite Code:</span>
                  <span className="text-xs text-white/70 font-mono tracking-wider">{selectedCommunity.invite_code}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedCommunity.invite_code);
                    }}
                    className="ml-auto text-white/30 hover:text-white/60 transition-colors"
                    title="Copy invite code"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>

                {/* Members List */}
                <div className="mb-4">
                  <h4 className="text-xs text-white/40 mb-2 uppercase tracking-wider">Members</h4>
                  <div className="flex-1 overflow-y-auto max-h-48 min-h-0">
                    {isLoadingMembers ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="size-5 text-white/30 animate-spin" />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {communityMembers.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                          >
                            <button onClick={() => onViewUser?.(member.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                              <div className="size-8 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden shrink-0">
                                {member.profile_picture ? (
                                  <img src={member.profile_picture} alt="" className="size-full object-cover" />
                                ) : (
                                  <User className="size-3.5 text-white/50" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white/80 truncate">{member.display_name}</p>
                                {member.neighborhood && (
                                  <p className="text-[10px] text-white/30 truncate">{member.neighborhood}</p>
                                )}
                              </div>
                            </button>
                            {member.role === "owner" ? (
                              <span className="text-[10px] text-fuchsia-400/70 bg-fuchsia-500/10 px-1.5 py-0.5 rounded-full border border-fuchsia-400/20">
                                Creator
                              </span>
                            ) : selectedCommunity.created_by === user?.id ? (
                              <button
                                onClick={() => handleKickMember(selectedCommunity.id, member.id)}
                                disabled={kickingMemberId === member.id}
                                className="text-[10px] text-red-400/60 hover:text-red-400 bg-red-500/0 hover:bg-red-500/10 px-1.5 py-0.5 rounded-full border border-transparent hover:border-red-400/20 transition-all shrink-0"
                                title="Remove member"
                              >
                                {kickingMemberId === member.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <X className="size-3" />
                                )}
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pending Join Requests (for owners of private communities) */}
                {!selectedCommunity.is_public && selectedCommunity.created_by === user?.id && (
                  <div className="mb-4">
                    <h4 className="text-xs text-white/40 mb-2 uppercase tracking-wider">
                      Pending Requests
                      {pendingRequests.length > 0 && (
                        <span className="ml-1.5 text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded-full text-[10px] normal-case">
                          {pendingRequests.length}
                        </span>
                      )}
                    </h4>
                    {isLoadingRequests ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="size-4 text-white/30 animate-spin" />
                      </div>
                    ) : pendingRequests.length === 0 ? (
                      <p className="text-xs text-white/20 py-3 text-center">No pending requests</p>
                    ) : (
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {pendingRequests.map((req) => (
                          <div
                            key={req.id}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5"
                          >
                            <button onClick={() => onViewUser?.(req.user_id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                              <div className="size-8 rounded-full bg-gradient-to-br from-amber-500/30 to-orange-500/30 flex items-center justify-center overflow-hidden shrink-0">
                                {req.profile_picture ? (
                                  <img src={req.profile_picture} alt="" className="size-full object-cover" />
                                ) : (
                                  <User className="size-3.5 text-white/50" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white/80 truncate">{req.display_name}</p>
                                {req.neighborhood && (
                                  <p className="text-[10px] text-white/30 truncate">{req.neighborhood}</p>
                                )}
                              </div>
                            </button>
                            <div className="flex gap-1.5 shrink-0">
                              <button
                                onClick={() => handleAcceptRequest(selectedCommunity.id, req.id)}
                                disabled={acceptingRequestId === req.id}
                                className="text-[10px] text-green-400 bg-green-500/10 px-2 py-1 rounded-full border border-green-400/20 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                              >
                                {acceptingRequestId === req.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  "Accept"
                                )}
                              </button>
                              <button
                                onClick={() => handleRejectRequest(selectedCommunity.id, req.id)}
                                disabled={rejectingRequestId === req.id}
                                className="text-[10px] text-red-400 bg-red-500/10 px-2 py-1 rounded-full border border-red-400/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                              >
                                {rejectingRequestId === req.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  "Reject"
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 mt-auto pt-4 border-t border-white/10">
                  <Button
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); shareCommunity(selectedCommunity); }}
                    className="flex-1 bg-white/10 hover:bg-white/15 text-white border-0 gap-2"
                  >
                    <Send className="size-4" />
                    Share
                  </Button>
                  {selectedCommunity.created_by === user?.id ? (
                    <Button
                      onClick={startEditCommunity}
                      className="flex-1 bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25 border border-fuchsia-400/20 gap-2"
                    >
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  ) : (
                    <Button
                      onClick={handleLeaveCommunity}
                      disabled={isLeavingCommunity}
                      className="flex-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-400/20 gap-2"
                    >
                      {isLeavingCommunity ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <LogOut className="size-4" />
                          Leave
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </ModalShell>
      )}
      {/* User Profile Summary Modal */}
      {/* Edit Listing Modal */}
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

      {/* Order Management Modal */}
      {/* Order Confirmation Summary Modal */}
      <OrderConfirmSummaryModal
        open={showConfirmSummary}
        data={confirmSummaryData}
        countdownExpired={confirmSummaryData ? getPickupCountdown(confirmSummaryData.order).expired : false}
        onClose={() => { setShowConfirmSummary(false); setConfirmSummaryData(null); }}
        onConfirmPickup={() => setShowPickupAttestation(true)}
        onDone={() => { setShowConfirmSummary(false); setConfirmSummaryData(null); }}
      />

      <PickupAttestationModal
        open={showPickupAttestation && !!confirmSummaryData}
        onClose={() => setShowPickupAttestation(false)}
        onStillWaiting={() => {
          setShowPickupAttestation(false);
          setShowConfirmSummary(false);
          setConfirmSummaryData(null);
        }}
        onConfirm={() => {
          if (!confirmSummaryData) return;
          setShowPickupAttestation(false);
          setShowConfirmSummary(false);
          openRatingModal(confirmSummaryData.order);
        }}
      />

      {showOrderModal && orderModalListing && (
        <ModalShell
          open
          onClose={() => { setShowOrderModal(false); setOrderModalListing(null); setSelectedSlot(null); setConfirmTime(""); setShowDeclineConfirm(null); }}
          z={50}
        >
          <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] overflow-y-auto" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={() => { setShowOrderModal(false); setOrderModalListing(null); setSelectedSlot(null); setConfirmTime(""); setShowDeclineConfirm(null); }}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <img
                src={orderModalListing.imageUrl}
                alt={formatTitle(orderModalListing.brand, orderModalListing.name)}
                className="size-12 rounded-lg object-cover border border-white/10 shrink-0"
              />
              <div className="min-w-0">
                <h3 className="text-sm font-medium truncate">{formatTitle(orderModalListing.brand, orderModalListing.name)}</h3>
                <p className="text-xs text-fuchsia-400">${orderModalListing.price}</p>
              </div>
            </div>

            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Pending Orders</p>

            {isLoadingOrders ? (
              <div className="py-8 text-center">
                <Loader2 className="size-5 animate-spin mx-auto text-cyan-400" />
              </div>
            ) : listingOrders.length === 0 ? (
              <div className="py-8 text-center">
                <Package className="size-8 text-white/15 mx-auto mb-2" />
                <p className="text-xs text-white/30">No pending orders</p>
              </div>
            ) : (
              <div className="space-y-4">
                {listingOrders.map((order) => {
                  const timeLabels: Record<string, string> = { morning: "8 AM – 12 PM", afternoon: "12 – 5 PM", evening: "5 – 9 PM" };
                  const isSelected = selectedSlot?.orderId === order.id;

                  // Generate 30-min increments for a time window string like "10 AM – 6 PM"
                  const generateTimeOptions = (timeWindow: string): string[] => {
                    const parseHour = (s: string): number => {
                      const m = s.trim().match(/^(\d{1,2})\s*(AM|PM)$/i);
                      if (!m) return 0;
                      let h = parseInt(m[1]);
                      if (m[2].toUpperCase() === "PM" && h !== 12) h += 12;
                      if (m[2].toUpperCase() === "AM" && h === 12) h = 0;
                      return h;
                    };
                    const label = timeLabels[timeWindow] || timeWindow;
                    const parts = label.split("–").map((s) => s.trim());
                    if (parts.length !== 2) return [];
                    const startH = parseHour(parts[0]);
                    const endH = parseHour(parts[1]);
                    const options: string[] = [];
                    for (let h = startH; h < endH; h++) {
                      for (const m of [0, 30]) {
                        const hour = h % 12 || 12;
                        const ampm = h >= 12 ? "PM" : "AM";
                        options.push(`${hour}:${m.toString().padStart(2, "0")} ${ampm}`);
                      }
                    }
                    // Include the end hour itself as a valid pickup time
                    const endHour = endH % 12 || 12;
                    const endAmpm = endH >= 12 ? "PM" : "AM";
                    options.push(`${endHour}:00 ${endAmpm}`);
                    return options;
                  };

                  return (
                    <div key={order.id} className="bg-white/[0.03] border border-cyan-400/20 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <button
                          onClick={() => onViewUser?.(order.buyer_id)}
                          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
                        >
                          <div className="size-8 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                            {order.buyer_picture ? (
                              <img src={order.buyer_picture} alt="" className="size-full object-cover" />
                            ) : (
                              <User className="size-3.5 text-white/50" />
                            )}
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium">{order.buyer_name}</p>
                            {order.created_at && (
                              <p className="text-[10px] text-white/25 mt-0.5">
                                {new Date(order.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                              </p>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-2">
                          {showDeclineConfirm !== order.id && (
                            <button
                              onClick={() => setShowDeclineConfirm(order.id)}
                              className="text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
                            >
                              Decline
                            </button>
                          )}
                          <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-400/20">Pending</span>
                        </div>
                      </div>

                      {showDeclineConfirm === order.id ? (
                        <div className="bg-red-500/[0.05] border border-red-400/20 rounded-lg p-3">
                          <p className="text-xs text-white/70 mb-3">Are you sure you want to decline this order?</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowDeclineConfirm(null)}
                              className="flex-1 text-xs text-white/50 bg-white/5 border border-white/10 rounded-lg py-1.5 hover:bg-white/10 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDeclineOrder(order.id)}
                              disabled={decliningOrderId === order.id}
                              className="flex-1 text-xs text-red-400 bg-red-500/10 border border-red-400/20 rounded-lg py-1.5 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                            >
                              {decliningOrderId === order.id ? <Loader2 className="size-3 animate-spin mx-auto" /> : "Decline Order"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Select a Pickup Window</p>
                          <div className="space-y-1.5">
                            {order.selected_pickup_slots.map((slot, i) => {
                              const dateStr = new Date(slot.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                              const isThisSelected = isSelected && selectedSlot.slot.date === slot.date && selectedSlot.slot.time === slot.time;
                              const expired = isSlotExpired(slot);
                              return (
                                <button
                                  key={i}
                                  onClick={() => {
                                    if (expired) return;
                                    if (isThisSelected) {
                                      setSelectedSlot(null);
                                      setConfirmTime("");
                                    } else {
                                      setSelectedSlot({ orderId: order.id, slot, order });
                                      setConfirmTime("");
                                    }
                                  }}
                                  disabled={expired}
                                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-colors text-left ${
                                    expired
                                      ? "border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed"
                                      : isThisSelected
                                        ? "border-cyan-400/50 bg-cyan-500/10"
                                        : "border-white/10 bg-white/[0.03] hover:border-cyan-400/30 hover:bg-cyan-500/[0.03]"
                                  }`}
                                >
                                  <div>
                                    <p className={`text-xs ${expired ? "text-white/30 line-through" : "text-white/80"}`}>{dateStr}</p>
                                    <p className={`text-[10px] ${expired ? "text-white/20" : "text-white/40"}`}>{timeLabels[slot.time] || slot.time}</p>
                                  </div>
                                  {expired ? (
                                    <span className="text-[9px] text-white/20 italic">Expired</span>
                                  ) : (
                                    <div className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                      isThisSelected ? "border-cyan-400 bg-cyan-400" : "border-white/25"
                                    }`}>
                                      {isThisSelected && <Check className="size-2.5 text-white" />}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {isSelected && (() => {
                            const timeOptions = generateTimeOptions(selectedSlot.slot.time);
                            const slotDateStr = new Date(selectedSlot.slot.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                            return (
                              <div className="mt-3 pt-3 border-t border-white/10">
                                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Choose Exact Pickup Time</p>
                                <p className="text-xs text-white/50 mb-2">{slotDateStr} — {timeLabels[selectedSlot.slot.time] || selectedSlot.slot.time}</p>
                                <select
                                  value={confirmTime}
                                  onChange={(e) => setConfirmTime(e.target.value)}
                                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors mb-3"
                                >
                                  <option value="">Select a time...</option>
                                  {timeOptions.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleConfirmSlot(selectedSlot.orderId, selectedSlot.slot, selectedSlot.order, confirmTime)}
                                  disabled={!confirmTime || confirmingOrderId === order.id}
                                  className="w-full py-2 rounded-lg text-sm font-medium bg-cyan-500 hover:bg-cyan-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                  {confirmingOrderId === order.id ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    "Confirm Pickup"
                                  )}
                                </button>
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* Rating / Confirm Pickup Modal */}
      <RatingModal
        open={showRatingModal}
        order={ratingOrder}
        ratingValue={ratingValue}
        ratingHover={ratingHover}
        ratingComment={ratingComment}
        isSubmitting={isSubmittingRating}
        onClose={() => { setShowRatingModal(false); setRatingOrder(null); }}
        onHoverChange={setRatingHover}
        onValueChange={setRatingValue}
        onCommentChange={setRatingComment}
        onSubmit={handleSubmitRating}
      />
    </section>
  );
}
