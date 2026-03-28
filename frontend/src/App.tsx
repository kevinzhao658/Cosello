import { TrendingUp, Search, Menu, User, DollarSign, ArrowRight, Upload, X, XCircle, Plus, Loader2, MapPin, Globe, Settings, ChevronRight, ExternalLink, FileText, Shield, AlertTriangle, Scale, Ban, CreditCard, MessageSquare, RefreshCw, UserCheck, Eye, LogOut, HelpCircle, Type, Contrast, Minimize2, Zap, Sparkles, Leaf, Users, Recycle, Heart, Bell, UserPlus, CheckCircle, Check, Lock, Pencil, Clock, Package, ShoppingBag, Star } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { useSettings } from "./contexts/SettingsContext";
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "./contexts/AuthContext";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import MyAccountPage from "./pages/MyAccountPage";
import UserProfileOverlay from "./pages/UserProfilePage";

interface ProductDetails {
  title: string;
  description: string;
  price: string;
  condition: string;
  location: string;
  tags: string[];
}

interface BulkItemDetails extends ProductDetails {
  imageIndices: number[];
}

interface Listing extends ProductDetails {
  id: string;
  userId?: number;
  imageUrl: string;
  imageUrls?: string[];
  postedAt: number;
  mutualCommunityNames?: string[];
  mutualCommunities?: { name: string; is_public: boolean }[];
  allCommunities?: { name: string; is_public: boolean; is_mutual: boolean; is_neighborhood?: boolean }[];
  visibility?: "public" | "private";
  tier?: number;
  status?: string;
  seller_name?: string | null;
  seller_picture?: string | null;
}

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

  const [homeSearch, setHomeSearch] = useState("");
  const [displayText, setDisplayText] = useState("");
  const fullText = "COSELLO";
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [currentLetterIndex, setCurrentLetterIndex] = useState(-1);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");

  const sellPrompt = "Upload single or multiple items, and we'll do the rest";
  const [sellDisplayText, setSellDisplayText] = useState("");
  const [sellLetterIndex, setSellLetterIndex] = useState(-1);

  const [uploadedImages, setUploadedImages] = useState<{ file: File; preview: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [productDetails, setProductDetails] = useState<ProductDetails | null>(null);

  const [bulkItems, setBulkItems] = useState<BulkItemDetails[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [bulkReviewPhase, setBulkReviewPhase] = useState<"cards" | "summary" | null>(null);
  const [isPostingBulk, setIsPostingBulk] = useState(false);
  const [dragImageState, setDragImageState] = useState<{ imageIndex: number; sourceGroup: number } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<number | null>(null);
  const [dragOverGap, setDragOverGap] = useState<number | null>(null);
  const [groupingsModified, setGroupingsModified] = useState(false);
  const [modifiedGroupIndices, setModifiedGroupIndices] = useState<Set<number>>(new Set());
  const bulkPhotoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newTag, setNewTag] = useState("");
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.replace("#", "");
    const validPages: Page[] = ["home", "market", "terms", "settings", "signin", "signup", "account", "help", "mission"];
    return validPages.includes(hash as Page) ? (hash as Page) : "home";
  });
  const [showPostConfirm, setShowPostConfirm] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [marketSearch, setMarketSearch] = useState("");
  const [selectedMarketCommunities, setSelectedMarketCommunities] = useState<string[]>([]);
  const [marketSort, setMarketSort] = useState("newest");
  const [publicCommunities, setPublicCommunities] = useState<{ id: string | number; name: string; neighborhood?: string; is_public?: boolean }[]>([]);
  const [privateCommunities, setPrivateCommunities] = useState<{ id: string | number; name: string; neighborhood?: string; is_public?: boolean }[]>([]);
  const filterCommunities = [...publicCommunities, ...privateCommunities];
  // Post To state
  const [postVisibility, setPostVisibility] = useState<"public" | "private">("public");
  const [selectedPostPrivateCommunities, setSelectedPostPrivateCommunities] = useState<(string | number)[]>([]);
  const [postPickupLocation, setPostPickupLocation] = useState("");

  // Wishlist state
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [wishlistItems, setWishlistItems] = useState<Listing[]>([]);

  // Profile dropdown state (custom, not Radix)
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Notifications state
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<{ id: number; type: string; title: string; message: string; is_read: boolean; community_id: number | null; related_user_id: number | null; related_user_name: string | null; related_user_picture: string | null; join_request_status: string | null; listing_id: string | null; created_at: string | null }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Notification countdown tick (forces re-render every 60s for live pickup countdowns)
  const [notifCountdownTick, setNotifCountdownTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNotifCountdownTick((p) => p + 1), 60000);
    return () => clearInterval(timer);
  }, []);

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
  const [viewingUserId, setViewingUserId] = useState<number | null>(null);

  // Listing detail modal state
  const [showListingDetailModal, setShowListingDetailModal] = useState(false);
  const [listingDetailData, setListingDetailData] = useState<Listing | null>(null);
  const [listingDetailSellerProfile, setListingDetailSellerProfile] = useState<{
    id: number; display_name: string | null; neighborhood: string | null; profile_picture: string | null;
    is_friend: boolean;
    communities: { id: number; name: string; image: string | null; is_mutual: boolean; is_public?: boolean }[];
    mutual_friends: { id: number; display_name: string | null; profile_picture: string | null; neighborhood: string | null }[];
  } | null>(null);
  const [isLoadingListingDetail, setIsLoadingListingDetail] = useState(false);
  const [listingDetailImageIndex, setListingDetailImageIndex] = useState(0);

  // Buy confirmation modal state
  const [buyerOrderStatus, setBuyerOrderStatus] = useState<{ status: string | null; order_id?: number } | null>(null);
  const [myOrderStatuses, setMyOrderStatuses] = useState<Record<string, { status: string; orderId: number }>>({});
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [pickupDaySelections, setPickupDaySelections] = useState<Record<string, { slots: { from: number; to: number }[]; dayLabel: string }>>({});
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [buyTosAgreed, setBuyTosAgreed] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const formatHour = (h: number) => h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`;

  // Edit listing modal state (from marketplace detail)
  const [showEditListingModal, setShowEditListingModal] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCondition, setEditCondition] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editNewTag, setEditNewTag] = useState("");
  const [isSavingListing, setIsSavingListing] = useState(false);

  const openEditFromDetail = () => {
    if (!listingDetailData) return;
    setEditTitle(listingDetailData.title);
    setEditDescription(listingDetailData.description || "");
    setEditPrice(listingDetailData.price);
    setEditCondition(listingDetailData.condition);
    setEditLocation(user?.neighborhood || listingDetailData.location || "");
    setEditTags(listingDetailData.tags || []);
    setEditNewTag("");
    setShowEditListingModal(true);
  };

  const handleSaveListingFromMarket = async () => {
    if (!listingDetailData || !token) return;
    setIsSavingListing(true);
    try {
      const formData = new FormData();
      formData.append("data", JSON.stringify({
        title: editTitle,
        description: editDescription,
        price: editPrice,
        condition: editCondition,
        location: editLocation,
        tags: editTags,
      }));
      const res = await fetch(`/api/listings/${listingDetailData.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        setShowEditListingModal(false);
        setShowListingDetailModal(false);
        setListingDetailData(null);
        fetchListings();
      }
    } catch {
      // ignore
    } finally {
      setIsSavingListing(false);
    }
  };

  const openUserDashboard = (userId: number) => {
    if (!token || userId === user?.id) return;
    setViewingUserId(userId);
  };

  const openListingDetail = async (listing: Listing) => {
    setShowListingDetailModal(true);
    setListingDetailData(listing);
    setListingDetailSellerProfile(null);
    setBuyerOrderStatus(null);
    setListingDetailImageIndex(0);
    addToHistory({ id: listing.id, title: listing.title, imageUrl: listing.imageUrls?.[0] || listing.imageUrl, price: listing.price, type: "viewed" });
    if (token && listing.userId) {
      setIsLoadingListingDetail(true);
      try {
        const [profileRes, orderStatusRes] = await Promise.all([
          fetch(`/api/friends/profile/${listing.userId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          listing.userId !== user?.id
            ? fetch(`/api/orders/status/${listing.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
            : Promise.resolve(null),
        ]);
        if (profileRes.ok) setListingDetailSellerProfile(await profileRes.json());
        if (orderStatusRes && orderStatusRes.ok) setBuyerOrderStatus(await orderStatusRes.json());
      } catch { /* ignore */ }
      finally { setIsLoadingListingDetail(false); }
    }
  };

  const computeAvailablePickupDays = (listing: Listing) => {
    const now = new Date();
    const postedAt = new Date(listing.postedAt * 1000);
    const expiresAt = new Date(postedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const days: { date: string; dayLabel: string }[] = [];
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    const todayStr = startDate.toISOString().split("T")[0];
    const currentHour = now.getHours();
    for (let d = new Date(startDate); d <= expiresAt; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      // Skip today if current time is past 9 PM (21:00)
      if (dateStr === todayStr && currentHour >= 21) continue;
      const dayLabel = dateStr === todayStr
        ? "Today"
        : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      days.push({ date: dateStr, dayLabel });
    }
    return days;
  };

  const handleConfirmPurchase = async () => {
    const dayEntries = Object.entries(pickupDaySelections);
    if (!listingDetailData || dayEntries.length === 0 || !token) return;
    setIsSubmittingOrder(true);
    try {
      const slots = dayEntries.flatMap(([date, { slots: timeSlots }]) =>
        timeSlots.map(({ from, to }) => ({
          date,
          time: `${formatHour(from)} – ${formatHour(to)}`,
        }))
      );
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listing_id: listingDetailData.id,
          selected_pickup_slots: slots,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to create order" }));
        throw new Error(err.detail || "Failed to create order");
      }
      addToHistory({ id: listingDetailData.id, title: listingDetailData.title, imageUrl: listingDetailData.imageUrls?.[0] || listingDetailData.imageUrl, price: listingDetailData.price, type: "purchased" });
      const orderData = await res.json();
      setBuyerOrderStatus({ status: "pending", order_id: orderData.id });
      setMyOrderStatuses((prev) => ({ ...prev, [listingDetailData.id]: { status: "pending", orderId: orderData.id } }));
      setShowBuyModal(false);
      setShowListingDetailModal(false);
      setListingDetailData(null);
      setListingDetailSellerProfile(null);
      setPickupDaySelections({});
      setBuyTosAgreed(false);
      fetchListings();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleUpdatePickupSlots = async () => {
    const dayEntries = Object.entries(pickupDaySelections);
    if (!editingOrderId || dayEntries.length === 0 || !token) return;
    setIsSubmittingOrder(true);
    try {
      const slots = dayEntries.flatMap(([date, { slots: timeSlots }]) =>
        timeSlots.map(({ from, to }) => ({
          date,
          time: `${formatHour(from)} – ${formatHour(to)}`,
        }))
      );
      const res = await fetch(`/api/orders/${editingOrderId}/update-slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ selected_pickup_slots: slots }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to update" }));
        throw new Error(err.detail || "Failed to update pickup windows");
      }
      setShowBuyModal(false);
      setEditingOrderId(null);
      setPickupDaySelections({});
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const parseTimeToHour = (timeStr: string): number => {
    const match = timeStr.match(/^(\d{1,2})\s*(AM|PM)$/i);
    if (!match) return 10;
    let h = parseInt(match[1]);
    const period = match[2].toUpperCase();
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return h;
  };

  const openEditPickupSlots = (listing: Listing, orderId: number, existingSlots: { date: string; time: string }[]) => {
    setListingDetailData(listing);
    setEditingOrderId(orderId);
    // Parse existing slots back into pickupDaySelections (multiple per day)
    const selections: Record<string, { slots: { from: number; to: number }[]; dayLabel: string }> = {};
    for (const slot of existingSlots) {
      const parts = slot.time.split("–").map((s: string) => s.trim());
      if (parts.length === 2) {
        if (!selections[slot.date]) {
          selections[slot.date] = { slots: [], dayLabel: slot.date };
        }
        selections[slot.date].slots.push({
          from: parseTimeToHour(parts[0]),
          to: parseTimeToHour(parts[1]),
        });
      }
    }
    setPickupDaySelections(selections);
    setBuyTosAgreed(true);
    setShowBuyModal(true);
  };

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current?.contains(e.target as Node)) return;
      setProfileOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  // Close notifications dropdown on outside click — mark as read on close
  useEffect(() => {
    if (!notificationsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (notificationsRef.current?.contains(e.target as Node)) return;
      setNotificationsOpen(false);
      if (unreadCount > 0) handleMarkAllRead();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notificationsOpen, unreadCount]);

  // Close history dropdown on outside click
  useEffect(() => {
    if (!historyOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (historyRef.current?.contains(e.target as Node)) return;
      setHistoryOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [historyOpen]);

  // Fetch unread notification count periodically
  const fetchUnreadCount = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/notifications/unread-count", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch { /* ignore */ }
  };

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setNotifications(await res.json());
      }
    } catch { /* ignore */ }
  };

  const handleMarkAllRead = async () => {
    if (!token) return;
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const handleNotificationAction = async (notificationId: number, action: "accept" | "reject") => {
    if (!token) return;
    try {
      const res = await fetch(`/api/notifications/${notificationId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, token]);

  // Reset bulk state when switching away from sell mode
  useEffect(() => {
    if (tradeMode !== "sell") {
      setBulkItems([]);
      setBulkReviewPhase(null);
      setCurrentCardIndex(0);
    }
  }, [tradeMode]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setUploadedImages((prev) => [...prev, ...newImages]);
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateBulkItem = (index: number, field: string, value: unknown) => {
    setBulkItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const deleteBulkItem = (index: number) => {
    setBulkItems((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setBulkReviewPhase(null);
        setCurrentCardIndex(0);
      } else if (currentCardIndex >= updated.length) {
        setCurrentCardIndex(updated.length - 1);
      }
      return updated;
    });
  };

  const addPhotoToBulkItem = (index: number, files: FileList) => {
    const newImages = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    const startIdx = uploadedImages.length;
    setUploadedImages((prev) => [...prev, ...newImages]);
    setBulkItems((prev) => {
      const updated = [...prev];
      const newIndices = newImages.map((_, i) => startIdx + i);
      updated[index] = {
        ...updated[index],
        imageIndices: [...updated[index].imageIndices, ...newIndices],
      };
      return updated;
    });
  };

  const handleDragStart = (imageIndex: number, sourceGroup: number) => {
    setDragImageState({ imageIndex, sourceGroup });
  };

  const handleGroupDragOver = (e: React.DragEvent, groupIndex: number) => {
    e.preventDefault();
    setDragOverGroup(groupIndex);
  };

  const handleDrop = (targetGroup: number) => {
    setDragOverGroup(null);
    if (!dragImageState) return;
    const { imageIndex, sourceGroup } = dragImageState;
    setDragImageState(null);
    if (sourceGroup === targetGroup) return;

    const isLastInSource = bulkItems[sourceGroup].imageIndices.length <= 1;

    setBulkItems((prev) => {
      const updated = prev.map((item, idx) => {
        if (idx === sourceGroup) {
          return { ...item, imageIndices: item.imageIndices.filter((i) => i !== imageIndex) };
        }
        if (idx === targetGroup) {
          return { ...item, imageIndices: [...item.imageIndices, imageIndex] };
        }
        return item;
      });
      // Remove the now-empty source group
      if (isLastInSource) {
        return updated.filter((_, idx) => idx !== sourceGroup);
      }
      return updated;
    });

    // Adjust currentCardIndex if a group was removed before it
    if (isLastInSource && sourceGroup <= currentCardIndex) {
      setCurrentCardIndex((prev) => Math.max(0, prev - 1));
    }
    setGroupingsModified(true);
    setModifiedGroupIndices((prev) => {
      const next = new Set(prev);
      // Both source and target groups are modified
      if (isLastInSource) {
        // Source group was removed; adjust indices for groups after it
        const adjusted = new Set<number>();
        for (const idx of next) {
          if (idx === sourceGroup) continue;
          adjusted.add(idx > sourceGroup ? idx - 1 : idx);
        }
        adjusted.add(targetGroup > sourceGroup ? targetGroup - 1 : targetGroup);
        adjusted.add(sourceGroup > 0 ? Math.min(sourceGroup - 1, targetGroup > sourceGroup ? targetGroup - 1 : targetGroup) : 0);
        return adjusted;
      }
      next.add(sourceGroup);
      next.add(targetGroup);
      return next;
    });
  };

  const handleDropNewGroup = (gapIndex: number) => {
    setDragOverGap(null);
    setDragOverGroup(null);
    if (!dragImageState) return;
    const { imageIndex, sourceGroup } = dragImageState;
    setDragImageState(null);
    if (bulkItems[sourceGroup].imageIndices.length <= 1) return;

    setBulkItems((prev) => {
      const updated = prev.map((item, idx) => {
        if (idx === sourceGroup) {
          return { ...item, imageIndices: item.imageIndices.filter((i) => i !== imageIndex) };
        }
        return item;
      });
      const newItem: BulkItemDetails = {
        title: "",
        description: "",
        price: "",
        condition: "Good",
        location: "",
        tags: [],
        imageIndices: [imageIndex],
      };
      updated.splice(gapIndex, 0, newItem);
      return updated;
    });
    // Keep currentCardIndex pointing to the same item after insertion
    if (gapIndex <= currentCardIndex) {
      setCurrentCardIndex((prev) => prev + 1);
    }
    setGroupingsModified(true);
    setModifiedGroupIndices((prev) => {
      const next = new Set(prev);
      // The source group was modified, and the new group is always modified
      const adjustedSource = gapIndex <= sourceGroup ? sourceGroup + 1 : sourceGroup;
      next.clear();
      for (const idx of prev) {
        next.add(gapIndex <= idx ? idx + 1 : idx);
      }
      next.add(adjustedSource);
      next.add(gapIndex);
      return next;
    });
  };

  const handleDragEnd = () => {
    setDragImageState(null);
    setDragOverGroup(null);
    setDragOverGap(null);
  };

  const handleSeparateItems = async () => {
    if (uploadedImages.length < 2) return;
    setProductDetails(null);
    setIsGenerating(true);
    try {
      const formData = new FormData();
      uploadedImages.forEach((img) => formData.append("images", img.file));
      const res = await fetch("/api/generate-bulk-listing", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Server error" }));
        throw new Error(err.detail || "Failed to generate bulk listing");
      }
      const items: BulkItemDetails[] = await res.json();
      const sellerNeighborhood = user?.neighborhood;
      if (sellerNeighborhood) {
        items.forEach((item) => { item.location = sellerNeighborhood; });
      }
      setBulkItems(items);
      setCurrentCardIndex(0);
      setBulkReviewPhase("cards");
      setGroupingsModified(false);
      setModifiedGroupIndices(new Set());
    } catch (err) {
      console.error("Separate items failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSellSubmit = async () => {
    if (uploadedImages.length === 0) return;
    setIsGenerating(true);

    try {
      const formData = new FormData();
      uploadedImages.forEach((img) => formData.append("images", img.file));

      const res = await fetch("/api/generate-bulk-listing", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Server error" }));
        throw new Error(err.detail || "Failed to generate listing");
      }
      const items: BulkItemDetails[] = await res.json();

      if (items.length === 1) {
        // Single item detected — use single-item edit form
        setProductDetails({
          title: items[0].title,
          description: items[0].description,
          price: items[0].price,
          condition: items[0].condition,
          location: user?.neighborhood || items[0].location,
          tags: items[0].tags,
        });
        setPostPickupLocation(user?.pickup_address || "");
      } else {
        // Multiple items — enter bulk cards flow
        const sellerNeighborhood = user?.neighborhood;
        if (sellerNeighborhood) {
          items.forEach((item) => { item.location = sellerNeighborhood; });
        }
        setBulkItems(items);
        setCurrentCardIndex(0);
        setBulkReviewPhase("cards");
        setGroupingsModified(false);
        setModifiedGroupIndices(new Set());
        setPostPickupLocation(user?.pickup_address || "");
      }
    } catch (err) {
      console.error("Generate listing failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefreshGroupings = async () => {
    if (bulkItems.length === 0 || uploadedImages.length === 0) return;
    setIsGenerating(true);
    try {
      // Only send modified groups to save credits
      const modifiedIndices = Array.from(modifiedGroupIndices).filter((i) => i < bulkItems.length);
      if (modifiedIndices.length === 0) return;

      const modifiedGroupings = modifiedIndices.map((i) => bulkItems[i].imageIndices);

      const formData = new FormData();
      // Only send the images that are referenced by modified groups
      const neededImageIndices = new Set<number>();
      for (const group of modifiedGroupings) {
        for (const idx of group) neededImageIndices.add(idx);
      }
      // Build a mapping from original index to position in the upload
      const sortedNeeded = Array.from(neededImageIndices).sort((a, b) => a - b);
      const indexMap = new Map<number, number>();
      sortedNeeded.forEach((origIdx, newIdx) => {
        indexMap.set(origIdx, newIdx);
      });
      sortedNeeded.forEach((origIdx) => {
        formData.append("images", uploadedImages[origIdx].file);
      });
      // Remap groupings to use new indices
      const remappedGroupings = modifiedGroupings.map((group) =>
        group.map((idx) => indexMap.get(idx)!)
      );
      formData.append("groupings", JSON.stringify(remappedGroupings));

      const res = await fetch("/api/regenerate-bulk-listing", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Server error" }));
        throw new Error(err.detail || "Failed to regenerate listings");
      }
      const newItems: BulkItemDetails[] = await res.json();

      // Merge: replace only the modified groups, keep unmodified ones intact
      setBulkItems((prev) => {
        const updated = [...prev];
        modifiedIndices.forEach((groupIdx, i) => {
          if (newItems[i]) {
            updated[groupIdx] = {
              ...newItems[i],
              imageIndices: prev[groupIdx].imageIndices,
            };
          }
        });
        return updated;
      });
      setCurrentCardIndex(modifiedIndices[0]);
      setBulkReviewPhase("cards");
      setGroupingsModified(false);
      setModifiedGroupIndices(new Set());
    } catch (err) {
      console.error("Regenerate listing failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePostListing = async () => {
    if (!productDetails || uploadedImages.length === 0) return;

    if (!isAuthenticated) {
      setPage("signin");
      return;
    }

    try {
      const formData = new FormData();
      uploadedImages.forEach((img) => formData.append("images", img.file));
      formData.append("data", JSON.stringify(productDetails));

      // Build communities + visibility for the form
      const communityIds: string[] = [];
      if (postVisibility === "private") {
        communityIds.push(...selectedPostPrivateCommunities.map(String));
      }
      // Public: send empty — backend auto-attaches user's communities
      formData.append("communities", communityIds.join(","));
      formData.append("visibility", postVisibility);
      formData.append("pickup_location", postPickupLocation);

      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to post listing");
      const posted = await res.json();
      if (posted?.id) {
        addToHistory({ id: posted.id, title: productDetails.title, imageUrl: posted.imageUrl || "", price: productDetails.price, type: "listed" });
      }

      setProductDetails(null);
      setUploadedImages([]);
      setPostPickupLocation("");

      setTradeMode("buy");
      setPage("market");
    } catch (err) {
      console.error("Post listing failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleBulkPostListing = async () => {
    if (bulkItems.length === 0 || uploadedImages.length === 0) return;

    if (!isAuthenticated) {
      setPage("signin");
      return;
    }

    setIsPostingBulk(true);

    try {
      const communityIds: string[] = [];
      if (postVisibility === "private") {
        communityIds.push(...selectedPostPrivateCommunities.map(String));
      }
      // Public: send empty — backend auto-attaches user's communities

      for (const item of bulkItems) {
        const formData = new FormData();
        for (const imgIdx of item.imageIndices) {
          if (uploadedImages[imgIdx]) {
            formData.append("images", uploadedImages[imgIdx].file);
          }
        }
        const { imageIndices: _, ...productData } = item;
        formData.append("data", JSON.stringify(productData));
        formData.append("communities", communityIds.join(","));
        formData.append("visibility", postVisibility);
        formData.append("pickup_location", postPickupLocation);

        const res = await fetch("/api/listings", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) throw new Error(`Failed to post listing: ${item.title}`);
      }

      setBulkItems([]);
      setBulkReviewPhase(null);
      setCurrentCardIndex(0);
      setProductDetails(null);
      setUploadedImages([]);
      setPostPickupLocation("");

      setTradeMode("buy");
      setPage("market");
    } catch (err) {
      console.error("Bulk post failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsPostingBulk(false);
    }
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore
    }
    logout();
    setListings([]);
    setNotifications([]);
    setUnreadCount(0);
    setWishlist(new Set());
    setWishlistItems([]);
    setHistoryItems([]);
    localStorage.removeItem("ge_history");
    setPublicCommunities([]);
    setPrivateCommunities([]);
    setSelectedHomeCommunities([]);
    setSelectedMarketCommunities([]);
    setPostVisibility("public");
    setSelectedPostPrivateCommunities([]);
    setHomeSearch("");
    setMarketSearch("");
    setTradeMode("buy");
    setMarketSort("newest");
    setMyOrderStatuses({});
    setProductDetails(null);
    setUploadedImages([]);
    setBulkItems([]);
    setBulkReviewPhase(null);
    setPage("home");
  };

  const fetchFilterCommunities = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/communities/mine-with-neighborhood", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPublicCommunities(data.public || []);
        setPrivateCommunities(data.private || []);
        const allIds = [...(data.public || []), ...(data.private || [])].map(
          (c: { id: string | number }) => String(c.id)
        );
        setSelectedHomeCommunities(allIds);
        setHomeShowAll(true);
        // Market default: no filter (empty = show tier-ranked feed)
        setSelectedMarketCommunities([]);
      }
    } catch (err) {
      console.error("Failed to fetch communities:", err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchFilterCommunities();
  }, [isAuthenticated]);

  const fetchListings = async () => {
    const params = new URLSearchParams();
    if (marketSearch) params.set("search", marketSearch);
    params.set("sort", marketSort);

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
        const res = await fetch(`/api/listings?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setListings(await res.json());
      } catch (err) {
        console.error("Failed to fetch listings:", err);
      }
    } else {
      try {
        const res = await fetch(`/api/listings/public?${params}`);
        if (res.ok) setListings(await res.json());
      } catch (err) {
        console.error("Failed to fetch public listings:", err);
      }
    }
  };

  const fetchWishlist = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/wishlist", { headers: { Authorization: `Bearer ${token}` } });
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
      const res = await fetch("/api/wishlist/listings", { headers: { Authorization: `Bearer ${token}` } });
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
      const res = await fetch(`/api/wishlist/${listingId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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
  }, [page, marketSearch, selectedMarketCommunities, marketSort, isAuthenticated]);

  useEffect(() => {
    if (token) fetchWishlist();
  }, [token]);

  useEffect(() => {
    if (page === "account" && token) fetchWishlistItems();
  }, [page, token]);

  const fetchMyOrderStatuses = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/orders", { headers: { Authorization: `Bearer ${token}` } });
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
    if (!isAuthenticated && (page === "account" || page === "signup")) {
      setPage("home");
    }
  }, [isAuthenticated, page]);

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

  useEffect(() => {
    if (tradeMode !== "sell") {
      setSellDisplayText("");
      setSellLetterIndex(-1);
      return;
    }

    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex <= sellPrompt.length) {
        setSellDisplayText(sellPrompt.slice(0, currentIndex));
        setSellLetterIndex(currentIndex - 1);
        currentIndex++;
      } else {
        clearInterval(typingInterval);
        setSellLetterIndex(-1);
      }
    }, 25);

    return () => clearInterval(typingInterval);
  }, [tradeMode]);

  // If user needs registration, redirect to signup
  useEffect(() => {
    if (needsRegistration && page !== "signup") {
      setPage("signup");
    }
  }, [needsRegistration]);

  return (
    <div className="size-full bg-gradient-to-br from-fuchsia-950 via-zinc-950 to-cyan-950 text-white overflow-auto">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-black/20 backdrop-blur-sm relative z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-8">
              <button onClick={() => setPage("home")} className="flex items-center gap-2 bg-transparent border-none cursor-pointer">
                <div className="relative">
                  <DollarSign className="size-8 text-fuchsia-400 absolute top-0 left-0" />
                  <DollarSign className="size-8 text-cyan-400 relative" style={{ transform: 'translate(8px, 0)' }} />
                </div>
              </button>

              {/* Desktop Navigation */}
              <div className="hidden md:flex gap-6">
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
                <div className="relative" ref={notificationsRef}>
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

                  {notificationsOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-80 rounded-md border border-white/15 shadow-xl overflow-hidden z-[100]" style={{ backgroundColor: '#18181b' }}>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                        <p className="text-xs font-medium">Notifications</p>
                        {unreadCount > 0 && (
                          <button
                            onClick={() => handleMarkAllRead()}
                            className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                      <div className="max-h-[8.5rem] overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="py-8 text-center">
                            <Bell className="size-5 text-white/15 mx-auto mb-2" />
                            <p className="text-xs text-white/30">No notifications</p>
                          </div>
                        ) : (
                          [...notifications].sort((a, b) => {
                            // Pin address_released notifications only when within 1 hour of pickup AND unread
                            const isActivePickup = (n: typeof notifications[0]) => {
                              if (n.type !== "address_released" || !n.message.includes("||") || n.is_read) return false;
                              const targetIso = n.message.split("||")[2] || "";
                              const target = new Date(targetIso);
                              if (isNaN(target.getTime())) return false;
                              const diff = target.getTime() - Date.now();
                              // Pin if within 1 hour before pickup or pickup time has passed (awaiting confirmation)
                              return diff <= 3600000;
                            };
                            const aPin = isActivePickup(a);
                            const bPin = isActivePickup(b);
                            if (aPin && !bPin) return -1;
                            if (!aPin && bPin) return 1;
                            return 0; // preserve original order for ties
                          }).map((n) => (
                            <div
                              key={n.id}
                              className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-white/5 transition-colors ${
                                n.is_read ? "opacity-40" : ""
                              } ${(n.type === "purchase" || n.type === "order_confirmed" || n.type === "order_declined" || n.type === "review_submitted" || n.type === "address_released" || n.type === "order_withdrawn" || n.type === "order_cancelled" || n.type === "order_updated" || n.type === "order_completed" || n.type === "order_expired") && n.listing_id ? "cursor-pointer hover:bg-white/5" : ""}`}
                              onClick={() => {
                                if ((n.type === "purchase" || n.type === "order_withdrawn" || n.type === "order_updated") && n.listing_id) {
                                  setNotificationsOpen(false);
                                  if (unreadCount > 0) handleMarkAllRead();
                                  setPendingListingId(n.listing_id);
                                  setPage("account");
                                }
                                if (n.type === "order_declined" || n.type === "order_cancelled" || n.type === "order_expired") {
                                  setNotificationsOpen(false);
                                  if (unreadCount > 0) handleMarkAllRead();
                                  setPage("account");
                                }
                                if ((n.type === "order_confirmed" || n.type === "review_submitted" || n.type === "address_released" || n.type === "order_completed") && n.listing_id) {
                                  setNotificationsOpen(false);
                                  if (unreadCount > 0) handleMarkAllRead();
                                  setPendingListingId(n.listing_id);
                                  setPage("account");
                                }
                              }}
                            >
                              {n.type === "join_request" && n.related_user_picture ? (
                                <img src={n.related_user_picture} alt="" className="size-7 rounded-full object-cover shrink-0 mt-0.5" />
                              ) : (
                                <div className={`size-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                  n.type === "join_request"
                                    ? "bg-amber-500/15"
                                    : n.type === "purchase"
                                      ? "bg-cyan-500/15"
                                      : n.type === "order_declined" || n.type === "order_cancelled"
                                        ? "bg-red-500/15"
                                        : n.type === "order_withdrawn" || n.type === "order_expired"
                                          ? "bg-amber-500/15"
                                          : n.type === "order_updated"
                                            ? "bg-cyan-500/15"
                                          : n.type === "order_completed"
                                            ? "bg-fuchsia-500/15"
                                          : n.type === "review_submitted"
                                            ? "bg-fuchsia-500/15"
                                            : n.type === "address_released"
                                              ? "bg-green-500/15"
                                              : "bg-green-500/15"
                                }`}>
                                  {n.type === "join_request" ? (
                                    <UserPlus className="size-3.5 text-amber-400" />
                                  ) : n.type === "purchase" ? (
                                    <ShoppingBag className="size-3.5 text-cyan-400" />
                                  ) : n.type === "order_declined" || n.type === "order_cancelled" ? (
                                    <XCircle className="size-3.5 text-red-400" />
                                  ) : n.type === "order_withdrawn" || n.type === "order_expired" ? (
                                    <XCircle className="size-3.5 text-amber-400" />
                                  ) : n.type === "order_updated" ? (
                                    <ShoppingBag className="size-3.5 text-cyan-400" />
                                  ) : n.type === "order_completed" ? (
                                    <CheckCircle className="size-3.5 text-fuchsia-400" />
                                  ) : n.type === "review_submitted" ? (
                                    <Star className="size-3.5 text-fuchsia-400" />
                                  ) : n.type === "address_released" ? (
                                    <MapPin className="size-3.5 text-green-400" />
                                  ) : (
                                    <CheckCircle className="size-3.5 text-green-400" />
                                  )}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs leading-relaxed ${n.is_read ? "text-white/60" : "text-white font-medium"}`}>
                                  {n.type === "join_request" && n.related_user_name ? (
                                    <>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); n.related_user_id && openUserDashboard(n.related_user_id); }}
                                        className="font-medium text-white hover:underline"
                                      >
                                        {n.related_user_name}
                                      </button>
                                      {" "}{n.message.replace(n.related_user_name, "").trimStart()}
                                    </>
                                  ) : n.type === "address_released" && n.message.includes("||") ? (
                                    (() => {
                                      void notifCountdownTick; // force re-render on tick
                                      const parts = n.message.split("||");
                                      const baseText = parts[0];
                                      const pickupTimeDisplay = parts[1] || "";
                                      const targetIso = parts[2] || "";
                                      const target = new Date(targetIso);
                                      const diff = target.getTime() - Date.now();
                                      if (diff > 0) {
                                        const days = Math.floor(diff / 86400000);
                                        const hours = Math.floor((diff % 86400000) / 3600000);
                                        const mins = Math.floor((diff % 3600000) / 60000);
                                        const countdownLabel = days > 0 ? `${days}d ${hours}h ${mins}m` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                                        return <>{baseText} <span className="text-cyan-400 font-semibold">{countdownLabel}</span> until pickup at {pickupTimeDisplay}.</>;
                                      }
                                      return <>{baseText}</>;
                                    })()
                                  ) : (
                                    n.message
                                  )}
                                </p>
                                {n.type === "join_request" && n.join_request_status === "pending" && (
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <button
                                      onClick={() => handleNotificationAction(n.id, "accept")}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
                                    >
                                      <Check className="size-3" />
                                      Accept
                                    </button>
                                    <button
                                      onClick={() => handleNotificationAction(n.id, "reject")}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                                    >
                                      <X className="size-3" />
                                      Deny
                                    </button>
                                  </div>
                                )}
                                {n.type === "join_request" && n.join_request_status === "accepted" && (
                                  <p className="text-[10px] text-green-400 mt-1">Accepted</p>
                                )}
                                {n.type === "join_request" && n.join_request_status === "rejected" && (
                                  <p className="text-[10px] text-red-400 mt-1">Denied</p>
                                )}
                                {n.type === "address_released" && n.message.includes("||") && (() => {
                                  const targetIso = n.message.split("||")[2] || "";
                                  const target = new Date(targetIso);
                                  return !isNaN(target.getTime()) && Date.now() >= target.getTime();
                                })() && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setNotificationsOpen(false);
                                      if (unreadCount > 0) handleMarkAllRead();
                                      if (n.listing_id) setPendingListingId(n.listing_id);
                                      setPage("account");
                                    }}
                                    className="flex items-center gap-1 mt-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
                                  >
                                    <CheckCircle className="size-3" />
                                    Confirm Pickup
                                  </button>
                                )}
                                {n.created_at && (
                                  <p className="text-[10px] text-white/25 mt-0.5">
                                    {new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
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
        <SignInPage
          onSuccess={(newToken, userExists, newUser) => {
            login(newToken, newUser);
            if (!userExists || !newUser?.display_name || !newUser?.neighborhood) {
              setPage("signup");
            } else {
              setPage("home");
            }
          }}
          onCancel={() => setPage("home")}
        />
      )}

      {/* Sign Up Page */}
      {page === "signup" && (
        <SignUpPage onComplete={() => setPage("account")} />
      )}

      {page === "home" && (
        <>
      {/* Hero Section */}
      <section className="min-h-[calc(100vh-64px)] flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-7xl mx-auto w-full">
          <div className="text-center mb-12">
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

            {/* Search Bar / Sell Upload */}
            <div className="max-w-4xl mx-auto">
              {tradeMode === "buy" ? (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setMarketSearch(homeSearch);
                      setPage("market");
                    }}
                    className="relative flex items-center gap-2 mb-2"
                  >
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/40 size-5" />
                      <Input
                        type="text"
                        value={homeSearch}
                        onChange={(e) => setHomeSearch(e.target.value)}
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
              ) : (
                <>
                  {/* Sell Upload Area */}
                  <div className="relative flex items-center gap-2 mb-2">
                    <label className="flex-1 flex items-center gap-3 px-4 py-3 bg-white/5 border border-dashed border-fuchsia-400/40 rounded-lg cursor-pointer hover:bg-white/10 hover:border-fuchsia-400/60 transition-all">
                      <Upload className="size-5 text-fuchsia-400 shrink-0" />
                      <p className="text-sm inline-flex items-center" style={{ fontFamily: "'Courier Prime', monospace" }}>
                        {sellDisplayText.split('').map((letter, index) => (
                          <span
                            key={index}
                            className={`${index === sellLetterIndex ? 'animate-letter-flash' : 'text-white/70'}${letter === ' ' ? ' inline-block w-1.5' : ''}`}
                          >
                            {letter === ' ' ? '\u00A0' : letter}
                          </span>
                        ))}
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                    </label>

                    {/* Buy/Sell Toggle */}
                    <div className="flex bg-white/5 border border-white/20 rounded-lg overflow-hidden">
                      <Button
                        variant="ghost"
                        onClick={() => setTradeMode("buy")}
                        className={`h-[52px] px-4 rounded-none text-sm ${
                          tradeMode === "buy"
                            ? "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                            : "text-white/60 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        Buy
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setTradeMode("sell")}
                        className={`h-[52px] px-4 rounded-none text-sm ${
                          tradeMode === "sell"
                            ? "bg-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/30"
                            : "text-white/60 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        Sell
                      </Button>
                    </div>

                    {/* Submit Button */}
                    <Button
                      size="icon"
                      disabled={uploadedImages.length === 0 || isGenerating}
                      onClick={handleSellSubmit}
                      className={`h-[52px] w-[52px] bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 ${uploadedImages.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {isGenerating ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
                    </Button>
                  </div>

                  {/* Thumbnail Previews */}
                  {uploadedImages.length > 0 && (
                    <>
                      {bulkReviewPhase && bulkItems.length > 0 ? (
                        /* Grouped view — single scrollable row with white outlines per group */
                        <div className="flex items-center mt-3 mb-2 overflow-x-auto pb-2 pt-3 pl-2 scrollbar-thin">
                          {bulkItems.map((item, groupIdx) => {
                            const isDropTarget = dragOverGroup === groupIdx;
                            const isActive = bulkReviewPhase === "cards" && currentCardIndex === groupIdx;
                            return (
                              <React.Fragment key={groupIdx}>
                                {/* Gap drop zone before each group */}
                                <div
                                  className={`shrink-0 transition-all self-stretch flex items-center ${
                                    dragImageState
                                      ? "w-4 mx-0.5"
                                      : "w-3"
                                  } ${dragOverGap === groupIdx ? "w-6 mx-0.5" : ""}`}
                                  onDragOver={(e) => { e.preventDefault(); setDragOverGap(groupIdx); setDragOverGroup(null); }}
                                  onDragLeave={() => setDragOverGap(null)}
                                  onDrop={() => handleDropNewGroup(groupIdx)}
                                >
                                  {dragImageState && (
                                    <div className={`w-0.5 h-full mx-auto rounded-full transition-all ${
                                      dragOverGap === groupIdx ? "bg-fuchsia-400 w-1" : "bg-white/15"
                                    }`} />
                                  )}
                                </div>
                                <div
                                  className={`relative flex items-center gap-1.5 rounded-lg px-1.5 py-1 border shrink-0 transition-all cursor-pointer ${
                                    isDropTarget ? "bg-white/10 ring-1 ring-white/40 border-white/30" :
                                    isActive ? "border-fuchsia-400/60 bg-fuchsia-500/5" : "border-white/30"
                                  }`}
                                  onDragOver={(e) => handleGroupDragOver(e, groupIdx)}
                                  onDragLeave={() => setDragOverGroup(null)}
                                  onDrop={() => handleDrop(groupIdx)}
                                  onClick={() => {
                                    setCurrentCardIndex(groupIdx);
                                    setBulkReviewPhase("cards");
                                  }}
                                >
                                  <span className="absolute -top-1.5 -left-1.5 size-4 rounded-full bg-white/90 flex items-center justify-center text-[8px] font-bold text-black z-10">
                                    {groupIdx + 1}
                                  </span>
                                  {item.imageIndices.map((imgIdx) => {
                                    const img = uploadedImages[imgIdx];
                                    if (!img) return null;
                                    const isDragging = dragImageState?.imageIndex === imgIdx;
                                    return (
                                      <div
                                        key={imgIdx}
                                        draggable
                                        onDragStart={() => handleDragStart(imgIdx, groupIdx)}
                                        onDragEnd={handleDragEnd}
                                        className={`relative size-16 rounded-lg overflow-hidden border border-white/20 cursor-grab active:cursor-grabbing transition-opacity ${
                                          isDragging ? "opacity-40" : "opacity-100"
                                        }`}
                                      >
                                        <img
                                          src={img.preview}
                                          alt={`Upload ${imgIdx + 1}`}
                                          className="size-full object-cover"
                                          draggable={false}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </React.Fragment>
                            );
                          })}
                          {/* Gap drop zone after last group */}
                          <div
                            className={`shrink-0 transition-all self-stretch flex items-center ${
                              dragImageState
                                ? "w-4 mx-0.5"
                                : "w-3"
                            } ${dragOverGap === bulkItems.length ? "w-6 mx-0.5" : ""}`}
                            onDragOver={(e) => { e.preventDefault(); setDragOverGap(bulkItems.length); setDragOverGroup(null); }}
                            onDragLeave={() => setDragOverGap(null)}
                            onDrop={() => handleDropNewGroup(bulkItems.length)}
                          >
                            {dragImageState && (
                              <div className={`w-0.5 h-full mx-auto rounded-full transition-all ${
                                dragOverGap === bulkItems.length ? "bg-fuchsia-400 w-1" : "bg-white/15"
                              }`} />
                            )}
                          </div>
                          <div className="shrink-0 ml-auto flex flex-col gap-1">
                            <button
                              onClick={() => {
                                uploadedImages.forEach((img) => URL.revokeObjectURL(img.preview));
                                setUploadedImages([]);
                                setProductDetails(null);
                                setBulkItems([]);
                                setBulkReviewPhase(null);
                                setCurrentCardIndex(0);
                                setNewTag("");
                                setGroupingsModified(false);
                                setModifiedGroupIndices(new Set());
                              }}
                              className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors px-2 py-1 rounded border border-transparent hover:border-red-400/20 hover:bg-red-500/10"
                            >
                              Clear all
                            </button>
                            {groupingsModified && (
                              <button
                                onClick={handleRefreshGroupings}
                                disabled={isGenerating}
                                className="text-[10px] text-cyan-400/70 hover:text-cyan-400 transition-colors px-2 py-1 rounded border border-transparent hover:border-cyan-400/20 hover:bg-cyan-500/10 disabled:opacity-40"
                              >
                                {isGenerating ? <Loader2 className="size-3 animate-spin mx-auto" /> : "Refresh content"}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Flat view — default upload thumbnails */
                        <div className="flex items-center gap-2 mt-3 mb-2">
                          {uploadedImages.map((img, index) => (
                            <div key={index} className="relative group">
                              <img
                                src={img.preview}
                                alt={`Upload ${index + 1}`}
                                className="size-16 object-cover rounded-lg border border-white/20"
                              />
                              <button
                                onClick={() => removeImage(index)}
                                className="absolute -top-1.5 -right-1.5 size-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="size-3 text-white" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="size-16 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-white/40 hover:text-white/60 hover:border-white/40 transition-all"
                          >
                            <Plus className="size-5" />
                          </button>
                          <div className="ml-auto shrink-0 flex flex-col gap-1">
                            <button
                              onClick={() => {
                                uploadedImages.forEach((img) => URL.revokeObjectURL(img.preview));
                                setUploadedImages([]);
                                setProductDetails(null);
                                setBulkItems([]);
                                setBulkReviewPhase(null);
                                setCurrentCardIndex(0);
                                setNewTag("");
                              }}
                              className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors px-2 py-1 rounded border border-transparent hover:border-red-400/20 hover:bg-red-500/10"
                            >
                              Clear all
                            </button>
                            {productDetails && uploadedImages.length > 1 && (
                              <button
                                onClick={handleSeparateItems}
                                disabled={isGenerating}
                                className="text-[10px] text-cyan-400/70 hover:text-cyan-400 transition-colors px-2 py-1 rounded border border-transparent hover:border-cyan-400/20 hover:bg-cyan-500/10 disabled:opacity-40"
                              >
                                {isGenerating ? <Loader2 className="size-3 animate-spin mx-auto" /> : "Separate items"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}


                  {/* Auto-Generated Product Details */}
                  {isGenerating && (
                    <div className="mt-6 p-6 bg-white/5 rounded-lg border border-white/10 text-center">
                      <Loader2 className="size-6 text-fuchsia-400 animate-spin mx-auto mb-3" />
                      <p className="text-white/60 text-sm">Analyzing your images...</p>
                    </div>
                  )}

                  {productDetails && !isGenerating && (
                    <div className="mt-6 p-6 bg-white/5 rounded-lg border border-white/10 space-y-4 text-left">
                      <div>
                        <label className="text-xs text-white/40 uppercase tracking-wider">Title</label>
                        <Input
                          value={productDetails.title}
                          onChange={(e) => setProductDetails({ ...productDetails, title: e.target.value })}
                          className="mt-1 bg-white/5 border-white/20 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-white/40 uppercase tracking-wider">Description</label>
                        <textarea
                          value={productDetails.description}
                          onChange={(e) => setProductDetails({ ...productDetails, description: e.target.value })}
                          rows={3}
                          className="mt-1 w-full bg-white/5 border border-white/20 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400 resize-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-white/40 uppercase tracking-wider">Price ($)</label>
                          <Input
                            value={productDetails.price}
                            onChange={(e) => setProductDetails({ ...productDetails, price: e.target.value })}
                            className="mt-1 bg-white/5 border-white/20 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-white/40 uppercase tracking-wider">Condition</label>
                          <select
                            value={productDetails.condition}
                            onChange={(e) => setProductDetails({ ...productDetails, condition: e.target.value })}
                            className="mt-1 w-full bg-white/5 border border-white/20 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400 h-9"
                          >
                            <option value="New">New</option>
                            <option value="Like New">Like New</option>
                            <option value="Good">Good</option>
                            <option value="Fair">Fair</option>
                            <option value="Poor">Poor</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-white/40 uppercase tracking-wider">Tags</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {productDetails.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-fuchsia-500/15 border border-fuchsia-400/30 text-fuchsia-300"
                            >
                              {tag}
                              <button
                                onClick={() =>
                                  setProductDetails({
                                    ...productDetails,
                                    tags: productDetails.tags.filter((_, i) => i !== index),
                                  })
                                }
                                className="hover:text-white transition-colors"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const trimmed = newTag.trim();
                              if (trimmed && !productDetails.tags.includes(trimmed)) {
                                setProductDetails({
                                  ...productDetails,
                                  tags: [...productDetails.tags, trimmed],
                                });
                                setNewTag("");
                              }
                            }}
                            className="inline-flex"
                          >
                            <input
                              value={newTag}
                              onChange={(e) => setNewTag(e.target.value)}
                              placeholder="Add tag..."
                              className="w-20 px-2 py-1 rounded-full text-xs bg-white/5 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:border-fuchsia-400 transition-colors"
                            />
                          </form>
                        </div>
                      </div>
                      {/* Post To */}
                      <div>
                        <label className="text-xs text-white/40 uppercase tracking-wider">Post to</label>
                        {/* Visibility toggle */}
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => { setPostVisibility("public"); setSelectedPostPrivateCommunities([]); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                              postVisibility === "public"
                                ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-300"
                                : "bg-white/5 border-white/20 text-white/40"
                            }`}
                          >
                            <Globe className="size-3.5 inline mr-1.5" />Public
                          </button>
                          <button
                            onClick={() => { setPostVisibility("private"); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                              postVisibility === "private"
                                ? "bg-fuchsia-500/15 border-fuchsia-400/40 text-fuchsia-300"
                                : "bg-white/5 border-white/20 text-white/40"
                            }`}
                          >
                            <Lock className="size-3.5 inline mr-1.5" />Private
                          </button>
                        </div>
                        {/* Community selection */}
                        <div className="mt-2 space-y-2">
                          {postVisibility === "public" ? (
                            <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-400/20 text-center">
                              <Globe className="size-5 text-cyan-400 mx-auto mb-2" />
                              <p className="text-sm text-cyan-300 font-medium">Available to all users</p>
                              <p className="text-xs text-white/40 mt-1 leading-relaxed">
                                Your listing will appear in the public market. Buyers who share communities with you will be prioritized.
                              </p>
                            </div>
                          ) : (
                            <>
                              {privateCommunities.length > 0 ? privateCommunities.map((community) => {
                                const isSelected = selectedPostPrivateCommunities.includes(community.id);
                                return (
                                  <button
                                    key={String(community.id)}
                                    onClick={() =>
                                      setSelectedPostPrivateCommunities((prev) =>
                                        isSelected ? prev.filter((c) => c !== community.id) : [...prev, community.id]
                                      )
                                    }
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                                      isSelected
                                        ? "bg-fuchsia-500/10 border-fuchsia-400/40 text-fuchsia-300"
                                        : "bg-white/5 border-white/20 text-white/40"
                                    }`}
                                  >
                                    <Lock className="size-4 shrink-0" />
                                    <span className="flex-1">{community.name}</span>
                                    {community.neighborhood && (
                                      <span className={`text-xs flex items-center gap-1 ${isSelected ? "text-fuchsia-400/50" : "text-white/30"}`}>
                                        <MapPin className="size-3" />
                                        {community.neighborhood}
                                      </span>
                                    )}
                                  </button>
                                );
                              }) : (
                                <p className="text-xs text-white/30 text-center py-3">You haven't joined any private communities yet.</p>
                              )}
                              <p className="text-[10px] text-white/30 mt-1">Members who share these communities will be prioritized.</p>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Pickup Location */}
                      <div className="mt-3">
                        <label className="text-xs text-white/40 uppercase tracking-wider">Pickup Location</label>
                        <div className="mt-1.5 flex items-center gap-2">
                          <MapPin className="size-3.5 text-fuchsia-400 shrink-0" />
                          <input
                            type="text"
                            value={postPickupLocation}
                            onChange={(e) => setPostPickupLocation(e.target.value)}
                            placeholder="Enter pickup location"
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20"
                          />
                        </div>
                        <p className="text-[10px] text-white/30 mt-1.5 leading-relaxed">
                          Your address will not be shared until pickup is confirmed.
                        </p>
                      </div>

                      <Button
                        onClick={() => {
                          if (!isAuthenticated) { setPage("signin"); return; }
                          setShowPostConfirm(true);
                        }}
                        disabled={postVisibility === "private" && selectedPostPrivateCommunities.length === 0}
                        className={`w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 mt-2 ${(postVisibility === "private" && selectedPostPrivateCommunities.length === 0) ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        {isAuthenticated ? "Post Listing" : "Sign in to Post"}
                      </Button>
                    </div>
                  )}

                  {/* Bulk Card Review (TikTok-style) */}
                  {bulkReviewPhase === "cards" && !isGenerating && bulkItems.length > 0 && (
                    <div className="mt-6 space-y-4">
                      {/* Progress indicator */}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-3">
                          <span className="text-white/40">
                            Item {currentCardIndex + 1} of {bulkItems.length}
                          </span>
                          <button
                            onClick={() => setBulkReviewPhase(null)}
                            className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                          >
                            + Add Photos
                          </button>
                        </div>
                        <div className="flex gap-1">
                          {bulkItems.map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-full transition-all ${
                                i === currentCardIndex
                                  ? "bg-fuchsia-400 scale-125"
                                  : i < currentCardIndex
                                  ? "bg-fuchsia-400/40"
                                  : "bg-white/20"
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Card content */}
                      <div className="p-6 bg-white/5 rounded-lg border border-white/10 space-y-4 text-left">
                        {/* Item images + add photo */}
                        <div className="flex items-center gap-2 mb-1">
                          {bulkItems[currentCardIndex].imageIndices.map((imgIdx) => (
                            <img
                              key={imgIdx}
                              src={uploadedImages[imgIdx]?.preview}
                              alt="Item"
                              className="size-16 object-cover rounded-lg border border-white/20"
                            />
                          ))}
                          <button
                            onClick={() => bulkPhotoInputRef.current?.click()}
                            className="size-16 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-white/40 hover:text-white/60 hover:border-white/40 transition-all"
                          >
                            <Plus className="size-5" />
                          </button>
                          <input
                            ref={bulkPhotoInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                addPhotoToBulkItem(currentCardIndex, e.target.files);
                                e.target.value = "";
                              }
                            }}
                          />
                        </div>

                        <div>
                          <label className="text-xs text-white/40 uppercase tracking-wider">Title</label>
                          <Input
                            value={bulkItems[currentCardIndex].title}
                            onChange={(e) => updateBulkItem(currentCardIndex, "title", e.target.value)}
                            className="mt-1 bg-white/5 border-white/20 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-white/40 uppercase tracking-wider">Description</label>
                          <textarea
                            value={bulkItems[currentCardIndex].description}
                            onChange={(e) => updateBulkItem(currentCardIndex, "description", e.target.value)}
                            rows={3}
                            className="mt-1 w-full bg-white/5 border border-white/20 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400 resize-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-white/40 uppercase tracking-wider">Price ($)</label>
                            <Input
                              value={bulkItems[currentCardIndex].price}
                              onChange={(e) => updateBulkItem(currentCardIndex, "price", e.target.value)}
                              className="mt-1 bg-white/5 border-white/20 text-white"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-white/40 uppercase tracking-wider">Condition</label>
                            <select
                              value={bulkItems[currentCardIndex].condition}
                              onChange={(e) => updateBulkItem(currentCardIndex, "condition", e.target.value)}
                              className="mt-1 w-full bg-white/5 border border-white/20 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400 h-9"
                            >
                              <option value="New">New</option>
                              <option value="Like New">Like New</option>
                              <option value="Good">Good</option>
                              <option value="Fair">Fair</option>
                              <option value="Poor">Poor</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-white/40 uppercase tracking-wider">Tags</label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {bulkItems[currentCardIndex].tags.map((tag, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-fuchsia-500/15 border border-fuchsia-400/30 text-fuchsia-300"
                              >
                                {tag}
                                <button
                                  onClick={() =>
                                    updateBulkItem(currentCardIndex, "tags", bulkItems[currentCardIndex].tags.filter((_, i) => i !== index))
                                  }
                                  className="hover:text-white transition-colors"
                                >
                                  <X className="size-3" />
                                </button>
                              </span>
                            ))}
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                const trimmed = newTag.trim();
                                if (trimmed && !bulkItems[currentCardIndex].tags.includes(trimmed)) {
                                  updateBulkItem(currentCardIndex, "tags", [...bulkItems[currentCardIndex].tags, trimmed]);
                                  setNewTag("");
                                }
                              }}
                              className="inline-flex"
                            >
                              <input
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                placeholder="Add tag..."
                                className="w-20 px-2 py-1 rounded-full text-xs bg-white/5 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:border-fuchsia-400 transition-colors"
                              />
                            </form>
                          </div>
                        </div>
                      </div>

                      {/* Navigation buttons */}
                      <div className="flex gap-3">
                        <Button
                          onClick={() => setCurrentCardIndex((prev) => Math.max(0, prev - 1))}
                          disabled={currentCardIndex === 0}
                          variant="outline"
                          className="flex-1 border-white/20 text-white/60 hover:text-white disabled:opacity-30"
                        >
                          Previous
                        </Button>
                        <Button
                          onClick={() => deleteBulkItem(currentCardIndex)}
                          variant="outline"
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 px-3"
                          title="Remove this item"
                        >
                          <X className="size-4" />
                        </Button>
                        <Button
                          onClick={() => {
                            if (currentCardIndex < bulkItems.length - 1) {
                              setCurrentCardIndex((prev) => prev + 1);
                            } else {
                              setBulkReviewPhase("summary");
                            }
                          }}
                          className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0"
                        >
                          {currentCardIndex < bulkItems.length - 1 ? "Next Item" : "Review All"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Bulk Summary View */}
                  {bulkReviewPhase === "summary" && !isGenerating && bulkItems.length > 0 && (
                    <div className="mt-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-white/80">
                          {bulkItems.length} items ready to post
                        </h3>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setBulkReviewPhase(null)}
                            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                          >
                            + Add Photos
                          </button>
                          <button
                            onClick={() => { setBulkReviewPhase("cards"); setCurrentCardIndex(0); }}
                            className="text-xs text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
                          >
                            Edit Items
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {bulkItems.map((item, idx) => {
                          const itemImages = item.imageIndices
                            .map((imgIdx) => uploadedImages[imgIdx]?.preview)
                            .filter(Boolean);
                          return (
                            <div
                              key={idx}
                              className="relative flex gap-5 p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/[0.07] transition-colors group cursor-pointer"
                              onClick={() => { setCurrentCardIndex(idx); setBulkReviewPhase("cards"); }}
                            >
                              <div className="shrink-0">
                                <ListingImageCarousel
                                  images={itemImages.length > 0 ? itemImages : [""]}
                                  alt={item.title}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-medium truncate pr-10 text-left">{item.title}</h3>
                                <div className="flex items-center gap-3 mt-1.5 text-sm text-white/50">
                                  <span className="px-2 py-0.5 rounded bg-white/10 text-xs">{item.condition}</span>
                                </div>
                                {/* Seller */}
                                {user?.display_name && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <div className="size-5 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                                      {user?.profile_picture ? (
                                        <img src={user.profile_picture} alt="" className="size-full object-cover" />
                                      ) : (
                                        <User className="size-2.5 text-white/50" />
                                      )}
                                    </div>
                                    <span className="text-xs text-white/50">{user.display_name}</span>
                                  </div>
                                )}
                                {/* Community tags preview */}
                                {(() => {
                                  const previewCommunities = postVisibility === "public"
                                    ? publicCommunities
                                    : privateCommunities.filter(c => selectedPostPrivateCommunities.includes(c.id));
                                  const neighborhoodName = user?.neighborhood;
                                  const hasNeighborhood = postVisibility === "public" && !!neighborhoodName;
                                  if (!hasNeighborhood && previewCommunities.length === 0) return null;
                                  return (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                      {hasNeighborhood && (
                                        <span className="px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1 border bg-white/5 border-white/10 text-white/30">
                                          <MapPin className="size-2.5" />{neighborhoodName}
                                        </span>
                                      )}
                                      {hasNeighborhood && previewCommunities.length > 0 && (
                                        <span className="text-white/15 text-xs">|</span>
                                      )}
                                      {previewCommunities.map((c, i) => (
                                        <span key={i} className="px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1 border bg-white/5 border-white/10 text-white/30">
                                          {c.is_public ? <Globe className="size-2.5" /> : <Lock className="size-2.5" />}{c.name}
                                        </span>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                              <div className="flex flex-col items-center justify-center gap-1.5 shrink-0">
                                <span className="text-lg font-semibold text-fuchsia-400">${item.price}</span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteBulkItem(idx); }}
                                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all p-1"
                                title="Remove item"
                              >
                                <X className="size-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Community selector */}
                      <div>
                        <label className="text-xs text-white/40 uppercase tracking-wider">Post all to</label>
                        {/* Visibility toggle */}
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => { setPostVisibility("public"); setSelectedPostPrivateCommunities([]); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                              postVisibility === "public"
                                ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-300"
                                : "bg-white/5 border-white/20 text-white/40"
                            }`}
                          >
                            <Globe className="size-3.5 inline mr-1.5" />Public
                          </button>
                          <button
                            onClick={() => { setPostVisibility("private"); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                              postVisibility === "private"
                                ? "bg-fuchsia-500/15 border-fuchsia-400/40 text-fuchsia-300"
                                : "bg-white/5 border-white/20 text-white/40"
                            }`}
                          >
                            <Lock className="size-3.5 inline mr-1.5" />Private
                          </button>
                        </div>
                        {/* Community selection */}
                        <div className="mt-2 space-y-2">
                          {postVisibility === "public" ? (
                            <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-400/20 text-center">
                              <Globe className="size-5 text-cyan-400 mx-auto mb-2" />
                              <p className="text-sm text-cyan-300 font-medium">Available to all users</p>
                              <p className="text-xs text-white/40 mt-1 leading-relaxed">
                                Your listings will appear in the public market. Buyers who share communities with you will be prioritized.
                              </p>
                            </div>
                          ) : (
                            <>
                              {privateCommunities.length > 0 ? privateCommunities.map((community) => {
                                const isSelected = selectedPostPrivateCommunities.includes(community.id);
                                return (
                                  <button
                                    key={String(community.id)}
                                    onClick={() =>
                                      setSelectedPostPrivateCommunities((prev) =>
                                        isSelected ? prev.filter((c) => c !== community.id) : [...prev, community.id]
                                      )
                                    }
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                                      isSelected
                                        ? "bg-fuchsia-500/10 border-fuchsia-400/40 text-fuchsia-300"
                                        : "bg-white/5 border-white/20 text-white/40"
                                    }`}
                                  >
                                    <Lock className="size-4 shrink-0" />
                                    <span className="flex-1">{community.name}</span>
                                    {community.neighborhood && (
                                      <span className={`text-xs flex items-center gap-1 ${isSelected ? "text-fuchsia-400/50" : "text-white/30"}`}>
                                        <MapPin className="size-3" />
                                        {community.neighborhood}
                                      </span>
                                    )}
                                  </button>
                                );
                              }) : (
                                <p className="text-xs text-white/30 text-center py-3">You haven't joined any private communities yet.</p>
                              )}
                              <p className="text-[10px] text-white/30 mt-1">Members who share these communities will be prioritized.</p>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Pickup Location */}
                      <div className="mt-3">
                        <label className="text-xs text-white/40 uppercase tracking-wider">Pickup Location</label>
                        <div className="mt-1.5 flex items-center gap-2">
                          <MapPin className="size-3.5 text-fuchsia-400 shrink-0" />
                          <input
                            type="text"
                            value={postPickupLocation}
                            onChange={(e) => setPostPickupLocation(e.target.value)}
                            placeholder="Enter pickup location"
                            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20"
                          />
                        </div>
                        <p className="text-[10px] text-white/30 mt-1.5 leading-relaxed">
                          Your address will not be shared until pickup is confirmed.
                        </p>
                      </div>

                      <Button
                        onClick={() => {
                          if (!isAuthenticated) { setPage("signin"); return; }
                          setShowPostConfirm(true);
                        }}
                        disabled={(postVisibility === "private" && selectedPostPrivateCommunities.length === 0) || isPostingBulk}
                        className={`w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 mt-2 ${(postVisibility === "private" && selectedPostPrivateCommunities.length === 0) ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        {isPostingBulk ? (
                          <Loader2 className="size-5 animate-spin" />
                        ) : isAuthenticated ? (
                          `Post All ${bulkItems.length} Listings`
                        ) : (
                          "Sign in to Post"
                        )}
                      </Button>
                    </div>
                  )}

                  {!productDetails && !isGenerating && !bulkReviewPhase && (
                    <p className="text-sm text-white/60 text-center mt-2">
                      {uploadedImages.length > 0
                        ? `${uploadedImages.length} photo${uploadedImages.length > 1 ? 's' : ''} ready • Hit submit to generate listing`
                        : "Selling • Click above to upload photos"}
                    </p>
                  )}
                </>
              )}
            </div>
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
        <section className="py-12 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-light tracking-wider mb-8" style={{ fontFamily: "'Courier Prime', monospace" }}>
              Marketplace
            </h2>

            {/* Search, Filter & Sort Bar */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-8">
              <div className="flex flex-col flex-1">
                <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 size-4" />
                  <input
                    type="text"
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                    placeholder="Search items..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/20 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Sort By</label>
                <select
                  value={marketSort}
                  onChange={(e) => setMarketSort(e.target.value)}
                  className="px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors"
                >
                  <option value="newest">Newest</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                </select>
              </div>
            </div>

            {/* Community Filter Chips */}
            {isAuthenticated && filterCommunities.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mt-2 mb-1">
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
                    onClick={() => openListingDetail(listing)}
                  >
                    {isAuthenticated && listing.userId !== user?.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleWishlist(listing.id); }}
                        className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors z-10"
                      >
                        <Heart
                          className={`size-4 ${wishlist.has(listing.id) ? "text-red-400 fill-red-400" : "text-white/30 hover:text-white/50"}`}
                        />
                      </button>
                    )}
                    <ListingImageCarousel
                      images={listing.imageUrls && listing.imageUrls.length > 0 ? listing.imageUrls : [listing.imageUrl]}
                      alt={listing.title}
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium truncate pr-10">{listing.title}</h3>
                      <div className="flex items-center gap-3 mt-1.5 text-sm text-white/50">
                        <span className="px-2 py-0.5 rounded bg-white/10 text-xs">{listing.condition}</span>
                        {listing.status === "sold" && <span className="px-2 py-0.5 rounded bg-white/10 text-xs text-white/40">Sold</span>}
                      </div>
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
                        const neighborhood = listing.allCommunities!.find((c: any) => c.is_neighborhood);
                        const others = listing.allCommunities!.filter((c: any) => !c.is_neighborhood);
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
                            {others.map((c: any, i: number) => (
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
                                    const res = await fetch(`/api/orders/status/${listing.id}`, { headers: { Authorization: `Bearer ${token}` } });
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
                              setEditingOrderId(null);
                              setPickupDaySelections({});
                              setBuyTosAgreed(false);
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
                          onClick={(e) => { e.stopPropagation(); openListingDetail(listing); setTimeout(openEditFromDetail, 100); }}
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
        <MyAccountPage onNavigate={(p) => setPage(p as Page)} onCommunitiesChanged={fetchFilterCommunities} wishlistItems={wishlistItems} wishlist={wishlist} onToggleWishlist={(id) => { toggleWishlist(id).then(() => fetchWishlistItems()); }} pendingListingId={pendingListingId} onClearPendingListing={() => setPendingListingId(null)} onAddToHistory={addToHistory} openListingDetail={openListingDetail} onViewUser={openUserDashboard} />
      )}

      {/* Post Listing Confirmation Modal */}
      {showPostConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowPostConfirm(false); setAcceptedTerms(false); }}
          />
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
              <h3 className="text-lg font-medium">Confirm {bulkReviewPhase === "summary" ? "Bulk " : ""}Listing</h3>
            </div>

            <div className="space-y-4 mb-6">
              <p className="text-sm text-white/90 font-semibold">
                By confirming, you agree to make {bulkReviewPhase === "summary"
                  ? `these ${bulkItems.length} items`
                  : "this item"} available for pickup within 7 days.
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
                  if (bulkReviewPhase === "summary") {
                    handleBulkPostListing();
                  } else {
                    handlePostListing();
                  }
                }}
                className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {bulkReviewPhase === "summary" ? `Confirm & Post All (${bulkItems.length})` : "Confirm & Post"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Listing Detail Modal */}
      {showListingDetailModal && listingDetailData && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowListingDetailModal(false); setListingDetailData(null); setListingDetailSellerProfile(null); }}
          />
          <div
            className="relative w-full max-w-lg mx-4 rounded-lg border border-white/15 shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: "#18181b" }}
          >
            <button
              onClick={() => { setShowListingDetailModal(false); setListingDetailData(null); setListingDetailSellerProfile(null); }}
              className="absolute top-3 right-3 z-10 size-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
            >
              <X className="size-4 text-white/80" />
            </button>

            {/* Large Image */}
            {(() => {
              const images = listingDetailData.imageUrls?.length ? listingDetailData.imageUrls : [listingDetailData.imageUrl];
              return (
                <div className="relative w-full aspect-square bg-black">
                  <img
                    src={images[listingDetailImageIndex]}
                    alt={listingDetailData.title}
                    className="w-full h-full object-contain"
                  />
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => setListingDetailImageIndex((listingDetailImageIndex - 1 + images.length) % images.length)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80"
                      >
                        <ChevronRight className="size-4 rotate-180" />
                      </button>
                      <button
                        onClick={() => setListingDetailImageIndex((listingDetailImageIndex + 1) % images.length)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {images.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setListingDetailImageIndex(i)}
                            className={`size-2 rounded-full transition-colors ${i === listingDetailImageIndex ? "bg-white" : "bg-white/40"}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Product Info */}
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h2 className="text-xl font-medium">{listingDetailData.title}</h2>
                <span className="text-xl font-semibold text-fuchsia-400 shrink-0">${listingDetailData.price}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-white/50 mb-3">
                <span className="px-2 py-0.5 rounded bg-white/10 text-xs">{listingDetailData.condition}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{listingDetailData.location}</span>
              </div>

              {listingDetailData.description && (
                <p className="text-sm text-white/60 mb-4 leading-relaxed">{listingDetailData.description}</p>
              )}

              {listingDetailData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {listingDetailData.tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-fuchsia-500/10 border border-fuchsia-400/20 text-fuchsia-300">{tag}</span>
                  ))}
                </div>
              )}

              {listingDetailData.mutualCommunities && listingDetailData.mutualCommunities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {listingDetailData.mutualCommunities.map((c, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-white/5 border border-white/10 text-white/40 inline-flex items-center gap-1">
                      {c.is_public ? <Users className="size-2.5" /> : <Lock className="size-2.5" />}{c.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Seller Section */}
              {isLoadingListingDetail ? (
                <div className="py-6 text-center border-t border-white/10">
                  <Loader2 className="size-5 animate-spin mx-auto text-fuchsia-400" />
                </div>
              ) : listingDetailSellerProfile ? (
                <div className="border-t border-white/10 pt-4 mt-4">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Seller</p>
                  <button
                    onClick={() => openUserDashboard(listingDetailSellerProfile.id)}
                    className="flex items-center gap-3 mb-3 hover:opacity-80 transition-opacity w-full text-left"
                  >
                    <div className="size-10 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden border border-white/10">
                      {listingDetailSellerProfile.profile_picture ? (
                        <img src={listingDetailSellerProfile.profile_picture} alt="" className="size-full object-cover" />
                      ) : (
                        <User className="size-4 text-white/50" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{listingDetailSellerProfile.display_name || "User"}</p>
                      {listingDetailSellerProfile.neighborhood && (
                        <p className="text-xs text-white/40 flex items-center gap-1"><MapPin className="size-3" />{listingDetailSellerProfile.neighborhood}</p>
                      )}
                    </div>
                    {listingDetailSellerProfile.is_friend && (
                      <span className="ml-auto text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-full border border-cyan-400/20">Friend</span>
                    )}
                  </button>

                  {listingDetailSellerProfile.communities.filter((c) => c.is_mutual).length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] text-white/25 mb-1.5">Shared communities</p>
                      <div className="flex flex-wrap gap-1.5">
                        {listingDetailSellerProfile.communities.filter((c) => c.is_mutual).map((c) => (
                          <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-400/20">
                            {c.is_public !== false ? <Users className="size-2.5" /> : <Lock className="size-2.5" />}{c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {listingDetailSellerProfile.mutual_friends.length > 0 && (
                    <div>
                      <p className="text-[10px] text-white/25 mb-1.5">Mutual friends ({listingDetailSellerProfile.mutual_friends.length})</p>
                      <div className="flex -space-x-2">
                        {listingDetailSellerProfile.mutual_friends.slice(0, 5).map((f) => (
                          <div key={f.id} className="size-7 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden border-2 border-[#18181b]" title={f.display_name || ""}>
                            {f.profile_picture ? (
                              <img src={f.profile_picture} alt="" className="size-full object-cover" />
                            ) : (
                              <User className="size-3 text-white/50" />
                            )}
                          </div>
                        ))}
                        {listingDetailSellerProfile.mutual_friends.length > 5 && (
                          <div className="size-7 rounded-full bg-white/10 flex items-center justify-center border-2 border-[#18181b] text-[10px] text-white/50">
                            +{listingDetailSellerProfile.mutual_friends.length - 5}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Buy / Edit Button */}
              {isAuthenticated && listingDetailData.userId === user?.id ? (
                listingDetailData.status === "sold" ? (
                  <div className="mt-5 text-center py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/40 text-sm">Sold</div>
                ) : (
                  <Button
                    onClick={openEditFromDetail}
                    className="w-full bg-white/10 hover:bg-white/15 text-white border border-white/10 mt-5 gap-2"
                  >
                    <Pencil className="size-4" />
                    Edit Listing
                  </Button>
                )
              ) : isAuthenticated && listingDetailData.userId !== user?.id ? (
                listingDetailData.status === "sold" ? (
                  <div className="mt-5 text-center py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/40 text-sm">Sold</div>
                ) : buyerOrderStatus?.status === "declined" ? (
                  <div className="mt-5 text-center py-2.5 rounded-lg bg-red-500/10 border border-red-400/20 text-red-400/70 text-sm">Your order was declined</div>
                ) : buyerOrderStatus?.status === "pending" ? (
                  <button
                    onClick={() => {
                      if (buyerOrderStatus?.order_id && listingDetailData) {
                        (async () => {
                          try {
                            const res = await fetch(`/api/orders/status/${listingDetailData.id}`, { headers: { Authorization: `Bearer ${token}` } });
                            if (res.ok) {
                              const data = await res.json();
                              openEditPickupSlots(listingDetailData, data.order_id, data.selected_pickup_slots || []);
                            }
                          } catch { /* ignore */ }
                        })();
                      }
                    }}
                    className="w-full mt-5 text-center py-2.5 rounded-lg bg-amber-500/10 border border-amber-400/20 text-amber-400 text-sm hover:bg-amber-500/20 transition-colors cursor-pointer"
                  >
                    Order Pending — Edit Pickup Times
                  </button>
                ) : buyerOrderStatus?.status === "confirmed" ? (
                  <div className="mt-5 text-center py-2.5 rounded-lg bg-green-500/10 border border-green-400/20 text-green-400 text-sm">Order Confirmed</div>
                ) : (
                  <Button
                    onClick={() => { setShowBuyModal(true); setPickupDaySelections({}); setBuyTosAgreed(false); }}
                    className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 mt-5"
                  >
                    Buy
                  </Button>
                )
              ) : !isAuthenticated ? (
                <Button
                  onClick={() => { setShowListingDetailModal(false); setPage("signin"); }}
                  className="w-full bg-white/10 hover:bg-white/15 text-white/60 border-0 mt-5"
                >
                  Sign in to Buy
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Buy Confirmation Modal */}
      {showBuyModal && listingDetailData && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowBuyModal(false); setEditingOrderId(null); setPickupDaySelections({}); }}
          />
          <div
            className="relative w-full max-w-md mx-4 rounded-lg border border-white/15 shadow-xl overflow-hidden max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: "#18181b" }}
          >
            <button
              onClick={() => { setShowBuyModal(false); setEditingOrderId(null); setPickupDaySelections({}); }}
              className="absolute top-3 right-3 z-10 size-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="size-3.5 text-white/60" />
            </button>

            <div className="p-5">
              <h3 className="text-lg font-medium mb-4">{editingOrderId ? "Update Pickup Windows" : "Confirm Purchase"}</h3>

              {/* Listing Summary */}
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10 mb-5">
                <img
                  src={listingDetailData.imageUrl}
                  alt={listingDetailData.title}
                  className="size-14 rounded-lg object-cover border border-white/10"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{listingDetailData.title}</p>
                  <p className="text-lg font-semibold text-fuchsia-400">${listingDetailData.price}</p>
                </div>
              </div>

              {/* Pickup Availability */}
              <div className="mb-5">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">When can you pick up?</p>
                <p className="text-[10px] text-white/25 mb-3">Toggle the days you're available, then set your time window</p>

                {(() => {
                  const availableDays = computeAvailablePickupDays(listingDetailData);
                  if (availableDays.length === 0) {
                    return (
                      <div className="text-center py-6">
                        <p className="text-sm text-white/30">This listing has expired</p>
                      </div>
                    );
                  }
                  const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 8 AM to 9 PM
                  const todayDateStr = new Date().toISOString().split("T")[0];
                  const currentHour = new Date().getHours();
                  return (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {availableDays.map((day) => {
                        const sel = pickupDaySelections[day.date];
                        const isToday = day.date === todayDateStr;
                        return (
                          <div
                            key={day.date}
                            className={`rounded-lg border transition-all ${sel ? "border-fuchsia-400/30 bg-fuchsia-500/5" : "border-white/10 bg-white/[0.02]"}`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setPickupDaySelections((prev) => {
                                  if (prev[day.date]) {
                                    const next = { ...prev };
                                    delete next[day.date];
                                    return next;
                                  }
                                  const defaultFrom = isToday ? Math.max(currentHour, 8) : 8;
                                  const defaultTo = isToday ? Math.min(Math.max(currentHour + 1, 9), 21) : 21;
                                  return { ...prev, [day.date]: { slots: [{ from: defaultFrom, to: defaultTo }], dayLabel: day.dayLabel } };
                                });
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                            >
                              <div className={`size-4 rounded border flex items-center justify-center shrink-0 transition-colors ${sel ? "bg-fuchsia-500 border-fuchsia-400" : "border-white/25 bg-white/5"}`}>
                                {sel && <Check className="size-2.5 text-white" />}
                              </div>
                              <span className={`text-xs font-medium flex-1 ${sel ? "text-white" : "text-white/50"}`}>{day.dayLabel}</span>
                              {sel && (
                                <span className="text-[10px] text-fuchsia-300/70">
                                  {sel.slots.map((s, i) => `${formatHour(s.from)} – ${formatHour(s.to)}`).join(", ")}
                                </span>
                              )}
                            </button>
                            {sel && (
                              <div className="px-3 pb-2.5 pt-0 space-y-2">
                                {sel.slots.map((slot, slotIdx) => (
                                  <div key={slotIdx} className="flex items-center gap-2">
                                    <label className="text-[10px] text-white/30">From</label>
                                    <select
                                      value={slot.from}
                                      onChange={(e) => {
                                        const newFrom = Number(e.target.value);
                                        setPickupDaySelections((prev) => {
                                          const updated = { ...prev[day.date] };
                                          const newSlots = [...updated.slots];
                                          newSlots[slotIdx] = { from: newFrom, to: Math.max(newSlots[slotIdx].to, newFrom + 1) };
                                          return { ...prev, [day.date]: { ...updated, slots: newSlots } };
                                        });
                                      }}
                                      className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/15 text-xs text-white focus:outline-none focus:border-fuchsia-400 transition-colors"
                                    >
                                      {HOURS.slice(0, -1).map((h) => (
                                        <option key={h} value={h}>{formatHour(h)}</option>
                                      ))}
                                    </select>
                                    <label className="text-[10px] text-white/30">To</label>
                                    <select
                                      value={slot.to}
                                      onChange={(e) => {
                                        setPickupDaySelections((prev) => {
                                          const updated = { ...prev[day.date] };
                                          const newSlots = [...updated.slots];
                                          newSlots[slotIdx] = { ...newSlots[slotIdx], to: Number(e.target.value) };
                                          return { ...prev, [day.date]: { ...updated, slots: newSlots } };
                                        });
                                      }}
                                      className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/15 text-xs text-white focus:outline-none focus:border-fuchsia-400 transition-colors"
                                    >
                                      {HOURS.filter((h) => h > slot.from).map((h) => (
                                        <option key={h} value={h}>{formatHour(h)}</option>
                                      ))}
                                    </select>
                                    {sel.slots.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPickupDaySelections((prev) => {
                                            const updated = { ...prev[day.date] };
                                            const newSlots = updated.slots.filter((_, i) => i !== slotIdx);
                                            return { ...prev, [day.date]: { ...updated, slots: newSlots } };
                                          });
                                        }}
                                        className="text-white/30 hover:text-red-400 transition-colors"
                                      >
                                        <X className="size-3" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPickupDaySelections((prev) => {
                                      const updated = { ...prev[day.date] };
                                      const lastSlot = updated.slots[updated.slots.length - 1];
                                      const newFrom = Math.min(lastSlot.to, 20);
                                      const newTo = Math.min(newFrom + 1, 21);
                                      if (newFrom >= 20) return prev;
                                      return { ...prev, [day.date]: { ...updated, slots: [...updated.slots, { from: newFrom, to: newTo }] } };
                                    });
                                  }}
                                  className="flex items-center gap-1 text-[10px] text-fuchsia-400/70 hover:text-fuchsia-300 transition-colors"
                                >
                                  <Plus className="size-3" />
                                  Add another time window
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Terms of Service (hidden in edit mode — already agreed) */}
              {!editingOrderId && (
                <div className="space-y-4 mb-5">
                  <p className="text-sm text-white/90 font-semibold">
                    By confirming, I agree to be available for pickup during the time(s) proposed to the seller.
                  </p>

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={buyTosAgreed}
                      onChange={(e) => setBuyTosAgreed(e.target.checked)}
                      className="mt-0.5 size-4 rounded border-white/30 bg-white/5 accent-fuchsia-500 cursor-pointer"
                    />
                    <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors">
                      I agree to the{" "}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowBuyModal(false); setPage("terms"); }}
                        className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors inline-flex items-center gap-1"
                      >
                        Terms & Conditions
                        <ExternalLink className="size-3" />
                      </button>
                    </span>
                  </label>
                </div>
              )}

              {/* Confirm / Update Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={() => { setShowBuyModal(false); setEditingOrderId(null); setPickupDaySelections({}); setBuyTosAgreed(false); }}
                  variant="outline"
                  className="flex-1 border-white/20 text-white/60 hover:text-white hover:bg-white/5"
                >
                  Cancel
                </Button>
                <Button
                  onClick={editingOrderId ? handleUpdatePickupSlots : handleConfirmPurchase}
                  disabled={Object.keys(pickupDaySelections).length === 0 || isSubmittingOrder || (!editingOrderId && !buyTosAgreed)}
                  className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40"
                >
                  {isSubmittingOrder ? <Loader2 className="size-4 animate-spin" /> : editingOrderId ? "Save Changes" : "Confirm Purchase"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Listing Modal (from marketplace detail) */}
      {showEditListingModal && listingDetailData && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowEditListingModal(false)}
          />
          <div
            className="relative w-full max-w-md mx-4 rounded-lg border border-white/15 shadow-xl overflow-hidden max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: "#18181b" }}
          >
            <button
              onClick={() => setShowEditListingModal(false)}
              className="absolute top-3 right-3 z-10 size-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="size-3.5 text-white/60" />
            </button>

            <div className="p-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
                  <Pencil className="size-5 text-fuchsia-400" />
                </div>
                <h3 className="text-lg font-medium">Edit Listing</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/40 mb-1 block">Title</label>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="bg-white/5 border-white/10 text-white text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1 block">Description</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-fuchsia-400/40"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Price</label>
                    <Input
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="bg-white/5 border-white/10 text-white text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Condition</label>
                    <select
                      value={editCondition}
                      onChange={(e) => setEditCondition(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-fuchsia-400/40 appearance-none"
                    >
                      <option value="New">New</option>
                      <option value="Like New">Like New</option>
                      <option value="Good">Good</option>
                      <option value="Fair">Fair</option>
                      <option value="Poor">Poor</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1 block">Location</label>
                  <Input
                    value={editLocation}
                    readOnly
                    disabled
                    className="bg-white/5 border-white/10 text-white/50 text-sm cursor-not-allowed"
                  />
                  <p className="text-[10px] text-white/30 mt-1">Location is synced from your profile</p>
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1 block">Tags</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editTags.map((tag, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-fuchsia-500/10 border border-fuchsia-400/20 text-fuchsia-300">
                        {tag}
                        <button onClick={() => setEditTags(editTags.filter((_, j) => j !== i))} className="hover:text-white">
                          <X className="size-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={editNewTag}
                      onChange={(e) => setEditNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editNewTag.trim()) {
                          e.preventDefault();
                          setEditTags([...editTags, editNewTag.trim()]);
                          setEditNewTag("");
                        }
                      }}
                      placeholder="Add tag..."
                      className="bg-white/5 border-white/10 text-white text-sm flex-1"
                    />
                    <Button
                      onClick={() => {
                        if (editNewTag.trim()) {
                          setEditTags([...editTags, editNewTag.trim()]);
                          setEditNewTag("");
                        }
                      }}
                      size="sm"
                      className="bg-white/10 hover:bg-white/15 text-white/60 border-0"
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={() => setShowEditListingModal(false)}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveListingFromMarket}
                    disabled={isSavingListing || !editTitle.trim() || !editPrice.trim()}
                    className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40"
                  >
                    {isSavingListing ? <Loader2 className="size-4 animate-spin" /> : "Save Changes"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Overlay */}
      {viewingUserId && (
        <UserProfileOverlay
          userId={viewingUserId}
          onClose={() => setViewingUserId(null)}
          onViewUser={(id) => setViewingUserId(id)}
          openListingDetail={openListingDetail}
        />
      )}
    </div>
  );
}
