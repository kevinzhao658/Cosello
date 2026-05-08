import { TrendingUp, Search, Menu, User, DollarSign, ArrowRight, Upload, X, XCircle, Plus, Loader2, MapPin, Globe, Settings, ChevronRight, ExternalLink, FileText, Shield, AlertTriangle, Scale, Ban, CreditCard, MessageSquare, RefreshCw, UserCheck, Eye, EyeOff, LogOut, HelpCircle, Type, Contrast, Minimize2, Zap, Sparkles, Leaf, Users, Recycle, Heart, Bell, UserPlus, CheckCircle, Check, Lock, Pencil, Clock, Package, ShoppingBag, Star } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { PriceInput } from "./components/ui/price-input";
import { useSettings } from "./contexts/SettingsContext";
import React, { useState, useEffect, useRef, Fragment, startTransition, useCallback, useMemo, memo } from "react";
import { useAuth, type AuthUser } from "./contexts/AuthContext";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import MyAccountPage from "./pages/MyAccountPage";
import UserProfileOverlay from "./pages/UserProfilePage";
import { CategorySelector, CategoryAttributeFields } from "./components/CategoryFields";
import { MarketplaceSidebar } from "./components/MarketplaceSidebar";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { formatTitle } from "./lib/format";
import { logView, logSearch, logInteraction, type ViewSource } from "./lib/events";

const SIDEBAR_STORAGE_KEY = "cosello.marketSidebar.collapsed";

type CategorySlug = "clothing" | "furniture" | "electronics" | "sports" | "collectibles" | "other";

interface CategoryField {
  key: string;
  label: string;
  type: "text" | "select";
  required: boolean;
  options?: string[];
  tooltip?: string;
}

interface CategorySchema {
  label: string;
  fields: CategoryField[];
}

interface ProductDetails {
  // brand + name replace the old computed `title` field. Display title is
  // composed at render time via `formatTitle(brand, name)`.
  brand: string;
  name: string;
  description: string;
  price: string;
  condition: string;
  location: string;
  tags: string[];
  category?: CategorySlug;
  categoryAttributes?: Record<string, string>;
  identifierConfidence?: "high" | "medium" | "low";
  retrieval_fallback?: boolean;
}

interface BulkItemDetails extends ProductDetails {
  imageIndices: number[];
  // Per-group failure marker from /api/generate-listings: when set, the item rendered as a
  // placeholder and the user is offered a "Regenerate this item" affordance.
  _error?: string;
  // Optional per-item pickup override. When empty/missing, the Step 5 batch-level
  // bulkPickupLocation default is used at post time. Per-card pickup edits at
  // Step 4 (when wired) write here.
  pickupLocation?: string;
}

interface SegmentationResult {
  groupings: number[][];
  image_urls: string[];
  vision_signals: unknown[]; // opaque, pass through
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
  category?: CategorySlug;
  categoryAttributes?: Record<string, string>;
  // Server still returns a stored `title` column for legacy clients during
  // the transition; modern UI ignores it and recomputes via formatTitle.
  title?: string;
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

function TypedInstruction({ bulkReviewPhase, exiting }: {
  bulkReviewPhase: "review" | "reason" | "cards" | "pickup" | null;
  exiting: boolean;
}) {
  const [typedInstruction, setTypedInstruction] = useState("");

  useEffect(() => {
    if (
      bulkReviewPhase !== "review" &&
      bulkReviewPhase !== "reason" &&
      bulkReviewPhase !== "cards" &&
      bulkReviewPhase !== "pickup"
    ) {
      setTypedInstruction("");
      return;
    }
    const full = bulkReviewPhase === "review"
      ? "What are you selling?"
      : bulkReviewPhase === "reason"
        ? "Why are you selling?"
        : bulkReviewPhase === "pickup"
          ? "Where do you want to meet?"
          : "Confirm the listing details below.";
    let i = 0;
    setTypedInstruction("");
    let intervalId: ReturnType<typeof setInterval>;
    const delayId = setTimeout(() => {
      intervalId = setInterval(() => {
        i++;
        setTypedInstruction(full.slice(0, i));
        if (i >= full.length) clearInterval(intervalId);
      }, 28);
    }, 320);
    return () => { clearTimeout(delayId); clearInterval(intervalId); };
  }, [bulkReviewPhase]);

  if (
    bulkReviewPhase !== "review" &&
    bulkReviewPhase !== "reason" &&
    bulkReviewPhase !== "cards" &&
    bulkReviewPhase !== "pickup"
  ) return null;

  return (
    <p
      className="mt-3 text-4xl font-light text-white leading-snug tracking-wide text-center"
      style={{
        animation: exiting
          ? "wizardStepOut 300ms ease-in forwards"
          : "wizardStepIn 300ms ease-out both",
      }}
    >
      {typedInstruction}
      {!typedInstruction.endsWith("?") && !typedInstruction.endsWith(".") && <span className="animate-pulse">|</span>}
    </p>
  );
}

function wrapAt(text: string, maxLen = 20): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + " " + word).length <= maxLen) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

// ─── GroupCard ────────────────────────────────────────────────────────────────
// Memoized so typing in one group's brand/name input only re-renders that card,
// not the entire grid.
const GroupCard = memo(function GroupCard({
  group, groupIdx, isDropTarget, isActiveCard, dragImageState,
  uploadedImages, imageUrls, bulkReviewPhase, brandHint, nameHint, bulkItemTitle,
  onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd,
  onDeleteMouseDown, onDeleteClick, onBrandChange, onNameChange, onCardSelect,
}: {
  group: number[];
  groupIdx: number;
  isDropTarget: boolean;
  isActiveCard: boolean;
  dragImageState: { imageIndex: number; sourceGroup: number } | null;
  uploadedImages: { file?: File; preview: string }[];
  imageUrls: string[];
  bulkReviewPhase: "review" | "reason" | "cards" | "summary" | "pickup" | null;
  brandHint: string;
  nameHint: string;
  bulkItemTitle: string;
  onDragOver: (e: React.DragEvent, groupIndex: number) => void;
  onDragLeave: () => void;
  onDrop: (groupIndex: number) => void;
  onDragStart: (imageIndex: number, sourceGroup: number) => void;
  onDragEnd: () => void;
  onDeleteMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteClick: (index: number) => void;
  onBrandChange: (groupIdx: number, value: string) => void;
  onNameChange: (groupIdx: number, value: string) => void;
  onCardSelect: (groupIdx: number) => void;
}) {
  return (
    <div
      className={`inline-flex flex-col items-center gap-1 rounded-lg p-1 transition-colors ${
        bulkReviewPhase === "review" && isDropTarget ? "bg-fuchsia-500/10 ring-1 ring-fuchsia-400/60" : ""
      } ${
        bulkReviewPhase === "cards" || bulkReviewPhase === "pickup"
          ? `cursor-pointer hover:bg-white/5 ${isActiveCard ? "bg-fuchsia-500/10 ring-1 ring-fuchsia-400/60" : ""}`
          : ""
      }`}
      onClick={bulkReviewPhase === "cards" || bulkReviewPhase === "pickup" ? () => onCardSelect(groupIdx) : undefined}
      onDragOver={bulkReviewPhase === "review" ? (e) => onDragOver(e, groupIdx) : undefined}
      onDragLeave={bulkReviewPhase === "review" ? onDragLeave : undefined}
      onDrop={bulkReviewPhase === "review" ? () => onDrop(groupIdx) : undefined}
    >
      <span className="text-xs text-white/40 leading-none pl-0.5">{groupIdx + 1}</span>
      <div className="flex flex-nowrap items-center gap-1">
        {group.map((imgIdx) => {
          const img = uploadedImages[imgIdx];
          const previewSrc = img?.preview || imageUrls[imgIdx];
          if (!previewSrc) return null;
          const isDragging = dragImageState?.imageIndex === imgIdx;
          return (
            <div
              key={imgIdx}
              draggable={bulkReviewPhase === "review"}
              onDragStart={bulkReviewPhase === "review" ? () => onDragStart(imgIdx, groupIdx) : undefined}
              onDragEnd={bulkReviewPhase === "review" ? onDragEnd : undefined}
              className={`relative size-16 rounded-lg border border-white/20 transition-opacity shrink-0 ${
                bulkReviewPhase === "review" ? "cursor-grab active:cursor-grabbing" : ""
              } ${isDragging ? "opacity-40" : "opacity-100"}`}
            >
              <img src={previewSrc} alt={`Photo ${imgIdx + 1}`} className="size-full object-cover rounded-lg" draggable={false} />
              {bulkReviewPhase === "review" && (
                <button
                  type="button"
                  aria-label={`Delete photo ${imgIdx + 1}`}
                  onMouseDown={onDeleteMouseDown}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteClick(imgIdx); }}
                  className="absolute -top-2 -right-2 size-5 flex items-center justify-center rounded-full bg-black/40 text-white/60 hover:bg-black/70 hover:text-white focus:outline-none focus:ring-1 focus:ring-white/60 transition-colors"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {bulkReviewPhase === "reason" ? (
        <p className="text-xs text-white text-center mt-1">
          {[brandHint, nameHint].filter(Boolean).join(" ") || "—"}
        </p>
      ) : bulkReviewPhase === "cards" || bulkReviewPhase === "pickup" ? (
        <p className="text-xs text-white text-center mt-1 whitespace-pre-line">{bulkItemTitle ? wrapAt(bulkItemTitle) : "—"}</p>
      ) : (
        <div className="flex items-start gap-3 w-full justify-center">
          <div className="flex flex-col items-center gap-0.5">
            <input
              id={`brand-hint-${groupIdx}`}
              type="text"
              value={brandHint ?? ""}
              onChange={(e) => onBrandChange(groupIdx, e.target.value)}
              placeholder="—"
              maxLength={80}
              aria-label={`Brand for item ${groupIdx + 1}`}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              className="min-w-[3rem] max-w-[10rem] bg-transparent border-b border-white/40 pb-0.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white transition-colors text-center"
            />
            <label htmlFor={`brand-hint-${groupIdx}`} className="text-[10px] text-white/40 uppercase leading-none">Brand</label>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <input
              id={`name-hint-${groupIdx}`}
              type="text"
              value={nameHint ?? ""}
              onChange={(e) => onNameChange(groupIdx, e.target.value)}
              placeholder="—"
              maxLength={120}
              aria-label={`Name for item ${groupIdx + 1}`}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              className="min-w-[3rem] max-w-[10rem] bg-transparent border-b border-white/40 pb-0.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white transition-colors text-center"
            />
            <label htmlFor={`name-hint-${groupIdx}`} className="text-[10px] text-white/40 uppercase leading-none">Name</label>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── NotificationItem ─────────────────────────────────────────────────────────
// Memoized so unrelated state changes in App don't re-render the notification
// list. countdownTick is only passed as non-zero for address_released items so
// the 60s timer only re-renders those rows.
const NotificationItem = memo(function NotificationItem({
  n, countdownTick, onOpenUserDashboard, onAction, onClick, onConfirmPickup,
}: {
  n: { id: number; type: string; message: string; is_read: boolean; related_user_id: number | null; related_user_name: string | null; related_user_picture: string | null; join_request_status: string | null; listing_id: string | null; created_at: string | null };
  countdownTick: number;
  onOpenUserDashboard: (userId: number) => void;
  onAction: (id: number, action: "accept" | "reject") => void;
  onClick: () => void;
  onConfirmPickup: () => void;
}) {
  const countdownContent = useMemo(() => {
    if (n.type !== "address_released" || !n.message.includes("||")) return null;
    void countdownTick;
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
      const label = days > 0 ? `${days}d ${hours}h ${mins}m` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return <>{baseText} <span className="text-cyan-400 font-semibold">{label}</span> until pickup at {pickupTimeDisplay}.</>;
    }
    return <>{baseText}</>;
  }, [n, countdownTick]);

  const isPickupReady = useMemo(() => {
    if (n.type !== "address_released" || !n.message.includes("||")) return false;
    void countdownTick;
    const targetIso = n.message.split("||")[2] || "";
    const target = new Date(targetIso);
    return !isNaN(target.getTime()) && Date.now() >= target.getTime();
  }, [n, countdownTick]);

  const isClickable = n.type === "purchase" || n.type === "order_confirmed" || n.type === "order_declined" || n.type === "review_submitted" || n.type === "address_released" || n.type === "order_withdrawn" || n.type === "order_cancelled" || n.type === "order_updated" || n.type === "order_completed" || n.type === "order_expired";

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-white/5 transition-colors ${n.is_read ? "opacity-40" : ""} ${isClickable && n.listing_id ? "cursor-pointer hover:bg-white/5" : ""}`}
      onClick={onClick}
    >
      {n.type === "join_request" && n.related_user_picture ? (
        <img src={n.related_user_picture} alt="" className="size-7 rounded-full object-cover shrink-0 mt-0.5" />
      ) : (
        <div className={`size-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          n.type === "join_request" ? "bg-amber-500/15" :
          n.type === "purchase" || n.type === "order_updated" ? "bg-cyan-500/15" :
          n.type === "order_declined" || n.type === "order_cancelled" ? "bg-red-500/15" :
          n.type === "order_withdrawn" || n.type === "order_expired" ? "bg-amber-500/15" :
          n.type === "order_completed" || n.type === "review_submitted" ? "bg-fuchsia-500/15" :
          "bg-green-500/15"
        }`}>
          {n.type === "join_request" ? <UserPlus className="size-3.5 text-amber-400" /> :
           n.type === "purchase" || n.type === "order_updated" ? <ShoppingBag className="size-3.5 text-cyan-400" /> :
           n.type === "order_declined" || n.type === "order_cancelled" ? <XCircle className="size-3.5 text-red-400" /> :
           n.type === "order_withdrawn" || n.type === "order_expired" ? <XCircle className="size-3.5 text-amber-400" /> :
           n.type === "order_completed" ? <CheckCircle className="size-3.5 text-fuchsia-400" /> :
           n.type === "review_submitted" ? <Star className="size-3.5 text-fuchsia-400" /> :
           n.type === "address_released" ? <MapPin className="size-3.5 text-green-400" /> :
           <CheckCircle className="size-3.5 text-green-400" />}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-relaxed ${n.is_read ? "text-white/60" : "text-white font-medium"}`}>
          {n.type === "join_request" && n.related_user_name ? (
            <>
              <button onClick={(e) => { e.stopPropagation(); n.related_user_id && onOpenUserDashboard(n.related_user_id); }} className="font-medium text-white hover:underline">
                {n.related_user_name}
              </button>
              {" "}{n.message.replace(n.related_user_name, "").trimStart()}
            </>
          ) : countdownContent ?? n.message}
        </p>
        {n.type === "join_request" && n.join_request_status === "pending" && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <button onClick={() => onAction(n.id, "accept")} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"><Check className="size-3" />Accept</button>
            <button onClick={() => onAction(n.id, "reject")} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"><X className="size-3" />Deny</button>
          </div>
        )}
        {n.type === "join_request" && n.join_request_status === "accepted" && <p className="text-[10px] text-green-400 mt-1">Accepted</p>}
        {n.type === "join_request" && n.join_request_status === "rejected" && <p className="text-[10px] text-red-400 mt-1">Denied</p>}
        {isPickupReady && (
          <button onClick={(e) => { e.stopPropagation(); onConfirmPickup(); }} className="flex items-center gap-1 mt-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">
            <CheckCircle className="size-3" />Confirm Pickup
          </button>
        )}
        {n.created_at && <p className="text-[10px] text-white/25 mt-0.5">{new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>}
      </div>
    </div>
  );
});

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

  const sellPrompt = "Upload single or multiple items, and we'll do the rest";
  const [sellDisplayText, setSellDisplayText] = useState("");
  const [sellLetterIndex, setSellLetterIndex] = useState(-1);

  const [uploadedImages, setUploadedImages] = useState<{ file: File; preview: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [productDetails, setProductDetails] = useState<ProductDetails | null>(null);

  const [bulkItems, setBulkItems] = useState<BulkItemDetails[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  // Wizard step state. Step 1 (upload) is `null`; once segmentation lands the
  // user steps through review → reason → cards → pickup (→ summary) in order.
  // Step 5 ("pickup") prompts for a default meet location applied to every
  // posted item that hasn't set its own per-card pickup override.
  const [bulkReviewPhase, setBulkReviewPhase] = useState<"review" | "reason" | "cards" | "pickup" | null>(null);
  // Step 5 default pickup location. Pre-filled from user.pickup_address when the
  // user enters the "pickup" phase (see effect below). Per-card overrides on
  // BulkItemDetails.pickupLocation win — this is the fallback applied to every
  // item where pickupLocation is empty/missing at post time.
  const [bulkPickupLocation, setBulkPickupLocation] = useState<string>("");
  // Segmentation (pass 1) result — held across the review screen, then forwarded to generate-listings.
  const [segmentation, setSegmentation] = useState<SegmentationResult | null>(null);
  // Per-group brand hints, length-aligned with segmentation.groupings.
  const [brandHints, setBrandHints] = useState<string[]>([]);
  // Per-group name hints, also length-aligned with segmentation.groupings.
  // Optional like brandHints — empty entries are sent as "" to the backend.
  const [names, setNames] = useState<string[]>([]);
  // Batch-level rationale for the generation call. Empty string == not picked.
  // "Other" surfaces a free-text input stored in rationaleOther.
  const [rationale, setRationale] = useState<string>("");
  const [rationaleOther, setRationaleOther] = useState<string>("");
  const [instructionExiting, setInstructionExiting] = useState(false);
  // Inline error surfaced on the upload screen if /api/segment-photos fails.
  const [segmentationError, setSegmentationError] = useState<string | null>(null);
  const [isPostingBulk, setIsPostingBulk] = useState(false);
  const [dragImageState, setDragImageState] = useState<{ imageIndex: number; sourceGroup: number } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<number | null>(null);
  const [dragOverGap, setDragOverGap] = useState<number | null>(null);
  const [groupingsModified, setGroupingsModified] = useState(false);
  const [modifiedGroupIndices, setModifiedGroupIndices] = useState<Set<number>>(new Set());
  const bulkPhotoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Anchor the wizard subheader so we can smooth-scroll into view ONLY when
  // the user enters Step 5 (pickup). Earlier steps are already centered when
  // the user gets to them; Step 5 introduces new content below Step 4 and
  // benefits from being centered explicitly.
  const wizardAnchorRef = useRef<HTMLDivElement>(null);
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

  // Edit listing modal state (from marketplace detail).
  // Brand + name replace the old single Title input — title is computed via
  // formatTitle on render, never stored as an editable field.
  const [showEditListingModal, setShowEditListingModal] = useState(false);
  const [editBrand, setEditBrand] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCondition, setEditCondition] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editNewTag, setEditNewTag] = useState("");
  const [editCategory, setEditCategory] = useState<CategorySlug>("other");
  const [editCategoryAttributes, setEditCategoryAttributes] = useState<Record<string, string>>({});
  const [isSavingListing, setIsSavingListing] = useState(false);

  const openEditFromDetail = () => {
    if (!listingDetailData) return;
    setEditBrand(listingDetailData.brand || "");
    setEditName(listingDetailData.name || "");
    setEditDescription(listingDetailData.description || "");
    setEditPrice(listingDetailData.price);
    setEditCondition(listingDetailData.condition);
    setEditLocation(user?.neighborhood || listingDetailData.location || "");
    setEditTags(listingDetailData.tags || []);
    setEditNewTag("");
    setEditCategory(listingDetailData.category || "other");
    // Strip legacy brand/model keys when loading: they're now top-level
    // fields, and we don't want them resurrected in the saved attributes
    // payload after the edit is submitted.
    const sanitizedAttrs = { ...(listingDetailData.categoryAttributes || {}) };
    delete sanitizedAttrs.brand;
    delete sanitizedAttrs.model;
    setEditCategoryAttributes(sanitizedAttrs);
    setShowEditListingModal(true);
  };

  const handleSaveListingFromMarket = async () => {
    if (!listingDetailData || !token) return;
    setIsSavingListing(true);
    try {
      const formData = new FormData();
      formData.append("data", JSON.stringify({
        brand: editBrand,
        name: editName,
        description: editDescription,
        price: editPrice,
        condition: editCondition,
        location: editLocation,
        tags: editTags,
        category: editCategory,
        categoryAttributes: editCategoryAttributes,
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

  const listingViewSourceRef = useRef<ViewSource>("direct");

  const openListingDetail = async (listing: Listing, source: ViewSource = "direct") => {
    listingViewSourceRef.current = source;
    setShowListingDetailModal(true);
    setListingDetailData(listing);
    setListingDetailSellerProfile(null);
    setBuyerOrderStatus(null);
    setListingDetailImageIndex(0);
    addToHistory({ id: listing.id, title: formatTitle(listing.brand, listing.name), imageUrl: listing.imageUrls?.[0] || listing.imageUrl, price: listing.price, type: "viewed" });
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
      addToHistory({ id: listingDetailData.id, title: formatTitle(listingDetailData.brand, listingDetailData.name), imageUrl: listingDetailData.imageUrls?.[0] || listingDetailData.imageUrl, price: listingDetailData.price, type: "purchased" });
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

  // Smooth-scroll the wizard subheader into view ONLY when entering Step 5
  // (pickup). Earlier steps don't trigger this — Step 5 is the one place
  // where the page benefits from explicit re-centering since it appears
  // below Step 4's existing content. Defer to next frame so the new
  // step has rendered before we measure.
  useEffect(() => {
    if (bulkReviewPhase === "pickup") {
      const id = requestAnimationFrame(() => {
        wizardAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return () => cancelAnimationFrame(id);
    }
  }, [bulkReviewPhase]);

  // Reset bulk state when switching away from sell mode
  useEffect(() => {
    if (tradeMode !== "sell") {
      setBulkItems([]);
      setBulkReviewPhase(null);
      setCurrentCardIndex(0);
    }
  }, [tradeMode]);

  useEffect(() => { setEditingTitle(null); }, [currentCardIndex]);

  // Step 5 prefill: when entering the "pickup" phase, default the input to the
  // seller's saved pickup_address — but ONLY if the user hasn't already typed
  // something. Re-entering the step (back from cards → forward again) preserves
  // their typed value.
  useEffect(() => {
    if (bulkReviewPhase === "pickup" && bulkPickupLocation === "") {
      setBulkPickupLocation(user?.pickup_address || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkReviewPhase]);


  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    e.target.value = "";

    // Step 2 (review): re-run segmentation in place with the combined photo
    // set. The user STAYS on Step 2 — newly added photos appear in the
    // cluster bar after the re-segmentation completes. Per-group brand/name
    // hints reset (groupings shape changes); per-batch rationale persists.
    // Errors render inline within Step 2's chrome — no bounce back to Step 1.
    if (bulkReviewPhase === "review") {
      const updatedImages = [...uploadedImages, ...newImages];
      setUploadedImages(updatedImages);
      setSegmentationError(null);
      setIsGenerating(true);
      segmentationAbortRef.current?.abort();
      const controller = new AbortController();
      segmentationAbortRef.current = controller;
      try {
        const result = await segmentPhotos(updatedImages.map((img) => img.file), controller.signal);
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.groupings) || result.groupings.length === 0) {
          throw new Error("Segmentation returned no groupings");
        }
        setSegmentation(result);
        setBrandHints(result.groupings.map(() => ""));
        setNames(result.groupings.map(() => ""));
        // Rationale is per-batch, not per-group, so it survives a re-segmentation.
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Re-segment after +Add failed:", err);
        setSegmentationError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        if (segmentationAbortRef.current === controller) {
          segmentationAbortRef.current = null;
          setIsGenerating(false);
        }
      }
      return;
    }

    // Step 1 (null) — flat upload state. Just append; segmentation runs when
    // the user clicks the submit arrow.
    setUploadedImages((prev) => [...prev, ...newImages]);
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  /**
   * Single source-of-truth helper for removing one photo from the in-flight
   * seller upload state. Keeps every parallel array consistent in one
   * transaction:
   *
   *   • uploadedImages          — entry removed at originalIndex
   *   • segmentation.image_urls — entry removed at originalIndex
   *   • segmentation.vision_signals — entry removed at originalIndex
   *   • segmentation.groupings  — index filtered + remaining indices remapped;
   *                               any group that empties is dropped
   *   • brandHints              — group-aligned: when a group empties, its
   *                               brandHint slot is dropped at the same group
   *                               position to stay length-aligned
   *   • bulkItems               — same filter+remap; an item with no images
   *                               left is dropped entirely
   *
   * If uploadedImages becomes empty, the create flow is reset to the initial
   * "no photos uploaded" state.
   *
   * The blob URL for the removed preview is revoked before the entry drops
   * out of state.
   *
   * Idempotent under rapid clicks: each call works on the current state
   * snapshot and React batches updates normally.
   */
  const deletePhoto = useCallback((originalIndex: number) => {
    // Snapshot the preview URL up front so we can revoke it after state
    // updates settle. Guard against out-of-range indices (race with a
    // previous click that already shifted the array).
    const removed = uploadedImages[originalIndex];
    if (!removed) return;

    // Helper: shift any index strictly greater than the removed slot down by 1.
    const remap = (i: number): number => (i > originalIndex ? i - 1 : i);

    const nextImages = uploadedImages.filter((_, i) => i !== originalIndex);

    // If this was the last photo, reset everything to the empty upload state.
    if (nextImages.length === 0) {
      URL.revokeObjectURL(removed.preview);
      setUploadedImages([]);
      setProductDetails(null);
      setBulkItems([]);
      setBulkReviewPhase(null);
      setCurrentCardIndex(0);
      setSegmentation(null);
      setBrandHints([]);
      setNames([]);
      setRationale("");
      setRationaleOther("");
      setBulkPickupLocation("");
      setSegmentationError(null);
      setGroupingsModified(false);
      setModifiedGroupIndices(new Set());
      return;
    }

    // Track which group positions empty out so we can drop their brandHints.
    const emptiedGroupPositions: number[] = [];

    if (segmentation) {
      const nextGroupings: number[][] = [];
      segmentation.groupings.forEach((group, gIdx) => {
        const filtered = group.filter((i) => i !== originalIndex).map(remap);
        if (filtered.length === 0) {
          emptiedGroupPositions.push(gIdx);
        } else {
          nextGroupings.push(filtered);
        }
      });
      const nextImageUrls = segmentation.image_urls.filter((_, i) => i !== originalIndex);
      const nextVisionSignals = segmentation.vision_signals.filter((_, i) => i !== originalIndex);
      setSegmentation({
        ...segmentation,
        groupings: nextGroupings,
        image_urls: nextImageUrls,
        vision_signals: nextVisionSignals,
      });
    }

    // brandHints + names are group-aligned; drop entries for groups that emptied.
    if (emptiedGroupPositions.length > 0) {
      const emptiedSet = new Set(emptiedGroupPositions);
      setBrandHints((prev) => prev.filter((_, idx) => !emptiedSet.has(idx)));
      setNames((prev) => prev.filter((_, idx) => !emptiedSet.has(idx)));
    }

    // bulkItems: filter+remap each item's imageIndices; drop items with none left.
    if (bulkItems.length > 0) {
      let bulkChanged = false;
      const nextBulk: BulkItemDetails[] = [];
      bulkItems.forEach((item) => {
        if (!item.imageIndices.includes(originalIndex)) {
          // Even untouched items need their indices remapped down.
          const remapped = item.imageIndices.map(remap);
          if (remapped.some((v, i) => v !== item.imageIndices[i])) {
            bulkChanged = true;
            nextBulk.push({ ...item, imageIndices: remapped });
          } else {
            nextBulk.push(item);
          }
          return;
        }
        bulkChanged = true;
        const filtered = item.imageIndices.filter((i) => i !== originalIndex).map(remap);
        if (filtered.length > 0) {
          nextBulk.push({ ...item, imageIndices: filtered });
        }
        // else: item dropped entirely
      });
      if (bulkChanged) {
        setBulkItems(nextBulk);
        // Keep currentCardIndex in range when items get dropped.
        if (nextBulk.length === 0) {
          setBulkReviewPhase(null);
          setCurrentCardIndex(0);
        } else if (currentCardIndex >= nextBulk.length) {
          setCurrentCardIndex(nextBulk.length - 1);
        }
      }
    }

    // Finally update uploadedImages and revoke the freed blob URL.
    URL.revokeObjectURL(removed.preview);
    setUploadedImages(nextImages);
  }, [uploadedImages, bulkItems, segmentation, currentCardIndex]);

  /**
   * Stable click handler factory for thumbnail delete buttons. Stops
   * propagation/default on both onMouseDown and onClick so the parent
   * draggable thumbnail does not start a drag when the delete button is
   * pressed (drag fires on mousedown).
   */
  const handleDeletePhotoClick = (originalIndex: number) =>
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      deletePhoto(originalIndex);
    };

  const handleDeletePhotoMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const updateBulkItem = useCallback((index: number, field: string, value: unknown) => {
    setBulkItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

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

  const handleGroupDragLeave = useCallback(() => setDragOverGroup(null), []);
  const handleCardSelect = useCallback((idx: number) => setCurrentCardIndex(idx), []);
  const handleNotifClick = useCallback((type: string, listingId: string | null) => {
    const withListing = ["purchase","order_withdrawn","order_updated","order_confirmed","review_submitted","address_released","order_completed"].includes(type);
    const noListing = ["order_declined","order_cancelled","order_expired"].includes(type);
    if (withListing && listingId) {
      setNotificationsOpen(false);
      setPendingListingId(listingId);
      setPage("account");
    } else if (noListing) {
      setNotificationsOpen(false);
      setPage("account");
    }
  }, []);
  const handleNotifConfirmPickup = useCallback((listingId: string | null) => {
    setNotificationsOpen(false);
    if (listingId) setPendingListingId(listingId);
    setPage("account");
  }, []);

  const handleDragStart = useCallback((imageIndex: number, sourceGroup: number) => {
    setDragImageState({ imageIndex, sourceGroup });
  }, []);

  const handleGroupDragOver = useCallback((e: React.DragEvent, groupIndex: number) => {
    e.preventDefault();
    setDragOverGroup(groupIndex);
  }, []);

  const handleDrop = (targetGroup: number) => {
    setDragOverGroup(null);
    if (!dragImageState) return;
    const { imageIndex, sourceGroup } = dragImageState;
    setDragImageState(null);
    if (sourceGroup === targetGroup) return;

    // Review phase operates on segmentation.groupings + brandHints, not bulkItems.
    if (bulkReviewPhase === "review") {
      reviewReassignImage(imageIndex, sourceGroup, targetGroup);
      return;
    }

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

    // Review phase operates on segmentation.groupings + brandHints, not bulkItems.
    if (bulkReviewPhase === "review") {
      reviewSplitImageToNewGroup(imageIndex, sourceGroup, gapIndex);
      return;
    }

    if (bulkItems[sourceGroup].imageIndices.length <= 1) return;

    setBulkItems((prev) => {
      const updated = prev.map((item, idx) => {
        if (idx === sourceGroup) {
          return { ...item, imageIndices: item.imageIndices.filter((i) => i !== imageIndex) };
        }
        return item;
      });
      const newItem: BulkItemDetails = {
        brand: "",
        name: "",
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

  const handleDragEnd = useCallback(() => {
    setDragImageState(null);
    setDragOverGroup(null);
    setDragOverGap(null);
  }, []);

  // ---- Two-pass review-and-edit listing flow ----
  //
  // Pass 1: POST /api/segment-photos → returns groupings + image_urls + vision_signals.
  //         User edits groupings + types per-group brand hints in the review screen.
  // Pass 2: POST /api/generate-listings → returns final listing dicts (same shape as today).
  //
  // vision_signals is opaque — passed back to /api/generate-listings unchanged.

  const segmentationAbortRef = useRef<AbortController | null>(null);

  const segmentPhotos = async (files: File[], signal?: AbortSignal): Promise<SegmentationResult> => {
    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));
    const res = await fetch("/api/segment-photos", {
      method: "POST",
      body: formData,
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Server error" }));
      throw new Error(err.detail || "Failed to segment photos");
    }
    return (await res.json()) as SegmentationResult;
  };

  const clearAllUploads = useCallback(() => {
    segmentationAbortRef.current?.abort();
    segmentationAbortRef.current = null;
    setUploadedImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.preview));
      return [];
    });
    setProductDetails(null);
    setBulkItems([]);
    setBulkReviewPhase(null);
    setCurrentCardIndex(0);
    setNewTag("");
    setGroupingsModified(false);
    setModifiedGroupIndices(new Set());
    setSegmentation(null);
    setBrandHints([]);
    setNames([]);
    setRationale("");
    setRationaleOther("");
    setBulkPickupLocation("");
    setSegmentationError(null);
    setIsGenerating(false);
  }, []);

  const generateListings = async (payload: {
    groupings: number[][];
    image_urls: string[];
    vision_signals: unknown[];
    brand_hints: string[];
    names: string[];
    rationale: string;
    rationale_other: string;
  }): Promise<BulkItemDetails[]> => {
    const res = await fetch("/api/generate-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Server error" }));
      throw new Error(err.detail || "Failed to generate listings");
    }
    return (await res.json()) as BulkItemDetails[];
  };

  // Triggered by the upload form's submit button (handles both single + multi photo uploads).
  // Calls /api/segment-photos and transitions to the review phase. The review screen always
  // renders, even for a single photo — UX consistency, ~5s overhead is acceptable.
  const handleSellSubmit = async () => {
    if (uploadedImages.length === 0) return;
    setProductDetails(null);
    setSegmentationError(null);
    setIsGenerating(true);
    segmentationAbortRef.current?.abort();
    const controller = new AbortController();
    segmentationAbortRef.current = controller;
    try {
      const result = await segmentPhotos(uploadedImages.map((img) => img.file), controller.signal);
      if (controller.signal.aborted) return;
      // Defensive: server should always return a non-empty groupings array; bail if not.
      if (!Array.isArray(result.groupings) || result.groupings.length === 0) {
        throw new Error("Segmentation returned no groupings");
      }
      setSegmentation(result);
      setBrandHints(result.groupings.map(() => ""));
      setNames(result.groupings.map(() => ""));
      // Step 3 state lives across the wizard but resets on each fresh
      // segmentation pass — user picks rationale per upload batch.
      setRationale("");
      setRationaleOther("");
      setBulkItems([]);
      setCurrentCardIndex(0);
      setBulkReviewPhase("review");
      setGroupingsModified(false);
      setModifiedGroupIndices(new Set());
      setPostPickupLocation(user?.pickup_address || "");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Segment photos failed:", err);
      setSegmentationError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (segmentationAbortRef.current === controller) {
        segmentationAbortRef.current = null;
        setIsGenerating(false);
      }
    }
  };

  // Triggered by the "Generate Listings" button on the rationale (Step 3) screen.
  // Forwards user-edited groupings + brand/name hints + batch rationale + the
  // opaque vision_signals from segmentation.
  const handleGenerateListings = async () => {
    if (!segmentation) return;
    // Validation: every group must be non-empty (every image is already covered by drag/split logic).
    if (segmentation.groupings.some((g) => g.length === 0)) return;
    // Rationale === "Other" requires the free-text input to be non-empty.
    if (rationale === "Other" && rationaleOther.trim() === "") return;
    setIsGenerating(true);
    try {
      const items = await generateListings({
        groupings: segmentation.groupings,
        image_urls: segmentation.image_urls,
        vision_signals: segmentation.vision_signals,
        brand_hints: brandHints,
        names: names,
        rationale: rationale,
        rationale_other: rationaleOther,
      });
      // Backfill imageIndices from the user-confirmed groupings (server may not echo them).
      const sellerNeighborhood = user?.neighborhood;
      items.forEach((item, i) => {
        if (!item.imageIndices || item.imageIndices.length === 0) {
          item.imageIndices = segmentation.groupings[i] || [];
        }
        if (sellerNeighborhood) item.location = sellerNeighborhood;
        if (!item.category) item.category = "other";
        if (!item.categoryAttributes) item.categoryAttributes = {};
        if (!item.identifierConfidence) item.identifierConfidence = "low";
        if (item.retrieval_fallback === undefined) item.retrieval_fallback = false;
        // Defensive: response shape is {name, brand, ...} — coerce missing
        // fields to "" rather than letting `undefined` bubble into formatTitle.
        if (item.brand === undefined || item.brand === null) item.brand = "";
        if (item.name === undefined || item.name === null) item.name = "";
      });

      if (items.length === 1) {
        // Single item — drop into the existing single-item edit form for UX continuity.
        setProductDetails({
          brand: items[0].brand || "",
          name: items[0].name || "",
          description: items[0].description,
          price: items[0].price,
          condition: items[0].condition,
          location: user?.neighborhood || items[0].location,
          tags: items[0].tags,
          category: items[0].category || "other",
          categoryAttributes: items[0].categoryAttributes || {},
          identifierConfidence: items[0].identifierConfidence || "low",
          retrieval_fallback: items[0].retrieval_fallback === true,
        });
        setBulkItems([]);
        setBulkReviewPhase(null);
      } else {
        setBulkItems(items);
        setCurrentCardIndex(0);
        setBulkReviewPhase("cards");
      }
      setGroupingsModified(false);
      setModifiedGroupIndices(new Set());
    } catch (err) {
      console.error("Generate listings failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  // Per-item regenerate from the review-cards phase: re-runs /api/generate-listings for a
  // single group when its first attempt returned a placeholder dict with `_error`.
  // Sends the slice of brand/name hints for the single group plus the same
  // batch-level rationale used in the original generate call.
  const regenerateBulkItem = async (groupIdx: number) => {
    if (!segmentation || !segmentation.groupings[groupIdx]) return;
    setIsGenerating(true);
    try {
      const items = await generateListings({
        groupings: [segmentation.groupings[groupIdx]],
        image_urls: segmentation.image_urls,
        vision_signals: segmentation.vision_signals,
        brand_hints: [brandHints[groupIdx] || ""],
        names: [names[groupIdx] || ""],
        rationale: rationale,
        rationale_other: rationaleOther,
      });
      if (items.length === 0) throw new Error("No listing returned");
      const fresh = items[0];
      if (!fresh.imageIndices || fresh.imageIndices.length === 0) {
        fresh.imageIndices = segmentation.groupings[groupIdx];
      }
      if (user?.neighborhood) fresh.location = user.neighborhood;
      if (!fresh.category) fresh.category = "other";
      if (!fresh.categoryAttributes) fresh.categoryAttributes = {};
      if (!fresh.identifierConfidence) fresh.identifierConfidence = "low";
      if (fresh.retrieval_fallback === undefined) fresh.retrieval_fallback = false;
      if (fresh.brand === undefined || fresh.brand === null) fresh.brand = "";
      if (fresh.name === undefined || fresh.name === null) fresh.name = "";
      setBulkItems((prev) => {
        const updated = [...prev];
        if (updated[groupIdx]) updated[groupIdx] = fresh;
        return updated;
      });
    } catch (err) {
      console.error("Regenerate item failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  // ---- Review-screen group editors (operate on segmentation.groupings + brandHints) ----

  const reviewReassignImage = (imageIndex: number, sourceGroup: number, targetGroup: number) => {
    if (!segmentation || sourceGroup === targetGroup) return;
    const groupings = segmentation.groupings;
    const isLastInSource = groupings[sourceGroup].length <= 1;
    let next = groupings.map((g, idx) => {
      if (idx === sourceGroup) return g.filter((i) => i !== imageIndex);
      if (idx === targetGroup) return [...g, imageIndex];
      return g;
    });
    let nextHints = brandHints;
    let nextNames = names;
    if (isLastInSource) {
      next = next.filter((_, idx) => idx !== sourceGroup);
      nextHints = brandHints.filter((_, idx) => idx !== sourceGroup);
      nextNames = names.filter((_, idx) => idx !== sourceGroup);
    }
    setSegmentation({ ...segmentation, groupings: next });
    setBrandHints(nextHints);
    setNames(nextNames);
  };

  const reviewSplitImageToNewGroup = (imageIndex: number, sourceGroup: number, gapIndex: number) => {
    if (!segmentation) return;
    const groupings = segmentation.groupings;
    if (groupings[sourceGroup].length <= 1) return;
    // Brand-hint + name policy on split: the lower-index (existing) group keeps its values;
    // the new split-off group's brand and name default to "".
    const next = groupings.map((g, idx) =>
      idx === sourceGroup ? g.filter((i) => i !== imageIndex) : g,
    );
    next.splice(gapIndex, 0, [imageIndex]);
    const nextHints = [...brandHints];
    nextHints.splice(gapIndex, 0, "");
    const nextNames = [...names];
    nextNames.splice(gapIndex, 0, "");
    setSegmentation({ ...segmentation, groupings: next });
    setBrandHints(nextHints);
    setNames(nextNames);
  };

  // Merge sourceGroup INTO destGroup: destGroup keeps its brand+name; source's are dropped.
  const reviewMergeGroups = (sourceGroup: number, destGroup: number) => {
    if (!segmentation || sourceGroup === destGroup) return;
    const groupings = segmentation.groupings;
    if (sourceGroup < 0 || sourceGroup >= groupings.length) return;
    if (destGroup < 0 || destGroup >= groupings.length) return;
    const merged = groupings.map((g, idx) => {
      if (idx === destGroup) return [...g, ...groupings[sourceGroup]];
      return g;
    }).filter((_, idx) => idx !== sourceGroup);
    const nextHints = brandHints.filter((_, idx) => idx !== sourceGroup);
    const nextNames = names.filter((_, idx) => idx !== sourceGroup);
    setSegmentation({ ...segmentation, groupings: merged });
    setBrandHints(nextHints);
    setNames(nextNames);
  };

  const updateBrandHint = useCallback((groupIdx: number, value: string) => {
    setBrandHints((prev) => {
      const next = [...prev];
      next[groupIdx] = value;
      return next;
    });
  }, []);

  const updateName = useCallback((groupIdx: number, value: string) => {
    setNames((prev) => {
      const next = [...prev];
      next[groupIdx] = value;
      return next;
    });
  }, []);

  // Backend POST /api/listings requires priceCents (non-negative int, cents).
  // The wizard edits price as a free-text dollar string, so convert here.
  // Mirrors the backend PATCH fallback: strip "$", parseFloat, round to cents.
  const priceStringToCents = (raw: string): number | null => {
    const cleaned = raw.replace(/^\$/, "").trim();
    if (cleaned === "") return null;
    const dollars = Number.parseFloat(cleaned);
    if (!Number.isFinite(dollars) || dollars < 0) return null;
    return Math.round(dollars * 100);
  };

  const handlePostListing = async () => {
    if (!productDetails || uploadedImages.length === 0) return;

    if (!isAuthenticated) {
      setPage("signin");
      return;
    }

    const priceCents = priceStringToCents(productDetails.price);
    if (priceCents === null) {
      alert("Enter a valid price before posting.");
      return;
    }

    try {
      const formData = new FormData();
      uploadedImages.forEach((img) => formData.append("images", img.file));
      const { identifierConfidence: _, retrieval_fallback: _rf, ...rest } = productDetails;
      const postData = { ...rest, priceCents };
      formData.append("data", JSON.stringify(postData));

      // All listings are public per MVP scope. Backend auto-attaches the
      // poster's communities when `communities` is empty + visibility=public.
      formData.append("communities", "");
      formData.append("visibility", "public");
      formData.append("pickup_location", postPickupLocation);

      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to post listing");
      const posted = await res.json();
      if (posted?.id) {
        addToHistory({ id: posted.id, title: formatTitle(productDetails.brand, productDetails.name), imageUrl: posted.imageUrl || "", price: productDetails.price, type: "listed" });
      }

      setProductDetails(null);
      setUploadedImages([]);
      setPostPickupLocation("");
      setBulkPickupLocation("");
      // Reset wizard inputs that may have been left over from a single-item flow.
      setNames([]);
      setRationale("");
      setRationaleOther("");

      setTradeMode("buy");
      setPage("market");
    } catch (err) {
      console.error("Post listing failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  // Step 5 entrypoint: persist the batch-level Step 5 default into per-item
  // pickupLocation for any item that doesn't already have one (preserving
  // per-card overrides), then invoke the existing bulk-post pipeline.
  // handleBulkPostListing has its own fallback that uses bulkPickupLocation
  // directly, so this helper is robust to the React state-update timing —
  // the per-item write is for clarity and forward-compat with future per-card
  // pickup edits at Step 4.
  const handleBulkPostFromPickupStep = async () => {
    const trimmedDefault = bulkPickupLocation.trim();
    if (trimmedDefault !== "") {
      setBulkItems((prev) =>
        prev.map((item) => ({
          ...item,
          pickupLocation:
            item.pickupLocation && item.pickupLocation.trim() !== ""
              ? item.pickupLocation
              : trimmedDefault,
        })),
      );
    }
    await handleBulkPostListing();
  };

  const handleBulkPostListing = async () => {
    if (bulkItems.length === 0 || uploadedImages.length === 0) return;

    if (!isAuthenticated) {
      setPage("signin");
      return;
    }

    const invalidIdx = bulkItems.findIndex((item) => priceStringToCents(item.price) === null);
    if (invalidIdx !== -1) {
      const offender = bulkItems[invalidIdx];
      alert(`Enter a valid price for "${formatTitle(offender.brand, offender.name)}" before posting.`);
      return;
    }

    setIsPostingBulk(true);

    try {
      // All listings are public per MVP scope. Backend auto-attaches the
      // poster's communities when `communities` is empty + visibility=public.

      // Step 5 default — applied per-item only when the item has no per-card
      // pickupLocation override. Falls back to the legacy postPickupLocation
      // for any code path that posted via the old summary surface.
      const trimmedBulkDefault = bulkPickupLocation.trim();
      const fallbackPickup = trimmedBulkDefault !== "" ? trimmedBulkDefault : postPickupLocation;

      for (const item of bulkItems) {
        const formData = new FormData();
        for (const imgIdx of item.imageIndices) {
          if (uploadedImages[imgIdx]) {
            formData.append("images", uploadedImages[imgIdx].file);
          }
        }
        const { imageIndices: _indices, identifierConfidence: _conf, retrieval_fallback: _rf, pickupLocation: _itemPickup, ...rest } = item;
        const productData = { ...rest, priceCents: priceStringToCents(item.price) as number };
        formData.append("data", JSON.stringify(productData));
        formData.append("communities", "");
        formData.append("visibility", "public");
        const itemPickup =
          item.pickupLocation && item.pickupLocation.trim() !== ""
            ? item.pickupLocation
            : fallbackPickup;
        formData.append("pickup_location", itemPickup);

        const res = await fetch("/api/listings", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) throw new Error(`Failed to post listing: ${formatTitle(item.brand, item.name)}`);
      }

      setBulkItems([]);
      setBulkReviewPhase(null);
      setCurrentCardIndex(0);
      setProductDetails(null);
      setUploadedImages([]);
      setPostPickupLocation("");
      setBulkPickupLocation("");
      // Wizard reset on successful bulk publish.
      setSegmentation(null);
      setBrandHints([]);
      setNames([]);
      setRationale("");
      setRationaleOther("");

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
    setSelectedMarketCommunities([]);
    setHomeSearch("");
    setMarketSearch("");
    setTradeMode("buy");
    setMarketSort("newest");
    setMyOrderStatuses({});
    setProductDetails(null);
    setUploadedImages([]);
    setBulkItems([]);
    setBulkReviewPhase(null);
    setSegmentation(null);
    setBrandHints([]);
    setNames([]);
    setRationale("");
    setRationaleOther("");
    setBulkPickupLocation("");
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
      }
    } catch (err) {
      console.error("Failed to fetch communities:", err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchFilterCommunities();
  }, [isAuthenticated, page]);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => setCategorySchemas(data))
      .catch((err) => console.error("Failed to fetch category schemas:", err));
  }, []);

  const fetchListings = async () => {
    if (showMyListings && isAuthenticated && token) {
      try {
        const res = await fetch(`/api/listings/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setListings(await res.json());
      } catch (err) {
        console.error("Failed to fetch my listings:", err);
      }
      return;
    }

    const params = new URLSearchParams();
    if (marketSearch) params.set("search", marketSearch);
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

  const handleNotForMe = (listingId: string) => {
    setListings((prev) => prev.filter((l) => l.id !== listingId));
    logInteraction({ listing_id: listingId, action: "not_interested" });
  };

  useEffect(() => {
    if (page === "market") fetchListings();
  }, [page, marketSearch, selectedMarketCommunities, marketSort, selectedCategories, isAuthenticated, showMyListings]);

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
              <button onClick={() => setPage("home")} className={`flex items-center gap-2 bg-transparent border-none cursor-pointer transition-opacity duration-500 ${(bulkReviewPhase === "review" || bulkReviewPhase === "reason") ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
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
                            <NotificationItem
                              key={n.id}
                              n={n}
                              countdownTick={n.type === "address_released" ? notifCountdownTick : 0}
                              onOpenUserDashboard={openUserDashboard}
                              onAction={handleNotificationAction}
                              onClick={() => handleNotifClick(n.type, n.listing_id)}
                              onConfirmPickup={() => handleNotifConfirmPickup(n.listing_id)}
                            />
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
      )}

      {/* Sign Up Page */}
      {page === "signup" && pendingSignupToken && (
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
      )}

      {page === "home" && (
        <>
      {/* Hero Section */}
      <section className="min-h-[calc(100vh-64px)] flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-7xl mx-auto w-full">
          <div className={`text-center transition-all duration-300 overflow-hidden ${(bulkReviewPhase === "review" || bulkReviewPhase === "reason" || bulkReviewPhase === "cards" || bulkReviewPhase === "pickup") ? "max-h-0 mb-0 opacity-0" : "max-h-64 mb-12 opacity-100"}`}>
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
                  <div className={`relative flex items-center gap-2 transition-all duration-300 overflow-hidden ${(bulkReviewPhase === "review" || bulkReviewPhase === "reason" || bulkReviewPhase === "cards" || bulkReviewPhase === "pickup") ? "max-h-0 mb-0 opacity-0 pointer-events-none" : "max-h-32 mb-2 opacity-100"}`}>
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
                        className="h-[52px] px-4 rounded-none text-sm text-white/60 hover:text-white hover:bg-white/5"
                      >
                        Buy
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setTradeMode("sell")}
                        className="h-[52px] px-4 rounded-none text-sm bg-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/30"
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

                  {/*
                    Unified photo bar — single visual slot that morphs across phases:
                      • bulkReviewPhase === null              → flat thumbnail row + "+Add"
                      • bulkReviewPhase === "review"          → cluster row with thin
                                                                 dividers + per-cluster
                                                                 brand bubbles (replaces
                                                                 the old standalone
                                                                 "Review groupings" section)
                      • bulkReviewPhase === "cards"           → legacy grouped scroll row
                                                                 used by the cards flow
                    All states share the same vertical slot so the upload-bar visually
                    rhymes across phases — no separate review section is rendered below.
                  */}
                  {uploadedImages.length > 0 && (
                    <>
                      {(bulkReviewPhase === "review" || bulkReviewPhase === "reason" || bulkReviewPhase === "cards" || bulkReviewPhase === "pickup") && segmentation ? (
                        /*
                          Review phase: inline cluster layout. Each group is an
                          inline-flex column (thumbs on top, brand bubble below).
                          Clusters are separated by a thin vertical divider that
                          sits BETWEEN cluster wrappers (never at the start of a
                          wrapped line). The whole row wraps when it runs out of
                          horizontal space. Trailing drop target captures
                          drag-to-end-of-row for creating a new group. Clear-all
                          / +Add controls live alongside so the bar stays
                          self-contained (no separate review chrome).
                        */
                        <>
                        {/*
                          Wizard progress indicator — minimal "Step N of 4" +
                          step name. No bar, no chrome. Sits above the
                          cluster row across both Step 2 ("review") and Step
                          3 ("reason") so the user always knows where they
                          are in the flow.
                        */}
                        <div ref={wizardAnchorRef} className="mt-3 flex items-center justify-center gap-2 text-xs text-white/40 uppercase tracking-wider">
                          <button
                            type="button"
                            onClick={() => {
                              // Back arrow:
                              //  • Step 5 → Step 4 (typed pickup persists in state)
                              //  • Step 4 → Step 3 (rationale + listings persist; user
                              //    re-enters the rationale screen with state intact)
                              //  • Step 3 → Step 2 (rationale persists in state)
                              //  • Step 2 → Step 1 (drop segmentation; brand/name are about to
                              //    be invalidated by re-segmentation anyway)
                              if (bulkReviewPhase === "pickup") {
                                setInstructionExiting(true);
                                setTimeout(() => {
                                  startTransition(() => {
                                    setInstructionExiting(false);
                                    setBulkReviewPhase("cards");
                                  });
                                }, 300);
                              } else if (bulkReviewPhase === "cards") {
                                setInstructionExiting(true);
                                setTimeout(() => {
                                  startTransition(() => {
                                    setInstructionExiting(false);
                                    setBulkReviewPhase("reason");
                                  });
                                }, 300);
                              } else if (bulkReviewPhase === "reason") {
                                setInstructionExiting(true);
                                setTimeout(() => {
                                  startTransition(() => {
                                    setInstructionExiting(false);
                                    setBulkReviewPhase("review");
                                  });
                                }, 300);
                              } else if (bulkReviewPhase === "review") {
                                setBulkReviewPhase(null);
                                setSegmentation(null);
                                setBrandHints([]);
                                setNames([]);
                                setRationale("");
                                setRationaleOther("");
                              }
                            }}
                            aria-label="Back"
                            className="size-6 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                          >
                            <ChevronRight className="size-3.5 rotate-180" />
                          </button>
                          <span>
                            {bulkReviewPhase === "review"
                              ? "Step 2 of 5 — Optional"
                              : bulkReviewPhase === "reason"
                                ? "Step 3 of 5 — Optional"
                                : bulkReviewPhase === "cards"
                                  ? "Step 4 of 5 — Review"
                                  : "Step 5 of 5 — Pickup Location"}
                          </span>
                        </div>
                        <TypedInstruction bulkReviewPhase={bulkReviewPhase} exiting={instructionExiting} />
                        <div className={`flex flex-wrap items-stretch justify-center gap-x-3 gap-y-5 mt-8 mb-2 transition-opacity duration-500 ${bulkReviewPhase === "reason" || bulkReviewPhase === "pickup" ? "opacity-30" : "opacity-100"}`}>
                          {segmentation.groupings.map((group, groupIdx) => (
                            <Fragment key={groupIdx}>
                              {groupIdx > 0 && (
                                <div aria-hidden="true" className="self-stretch border-l border-white/10" />
                              )}
                              <GroupCard
                                group={group}
                                groupIdx={groupIdx}
                                isDropTarget={dragOverGroup === groupIdx}
                                isActiveCard={currentCardIndex === groupIdx}
                                dragImageState={dragImageState}
                                uploadedImages={uploadedImages}
                                imageUrls={segmentation.image_urls}
                                bulkReviewPhase={bulkReviewPhase}
                                brandHint={brandHints[groupIdx] ?? ""}
                                nameHint={names[groupIdx] ?? ""}
                                bulkItemTitle={
                                  formatTitle(bulkItems[groupIdx]?.brand, bulkItems[groupIdx]?.name)
                                  || [brandHints[groupIdx], names[groupIdx]].filter(Boolean).join(" ")
                                }
                                onDragOver={handleGroupDragOver}
                                onDragLeave={handleGroupDragLeave}
                                onDrop={handleDrop}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                onDeleteMouseDown={handleDeletePhotoMouseDown}
                                onDeleteClick={deletePhoto}
                                onBrandChange={updateBrandHint}
                                onNameChange={updateName}
                                onCardSelect={handleCardSelect}
                              />
                            </Fragment>
                          ))}

                          {/*
                            End-of-row drop target — creates a new group when a
                            photo is dragged to the trailing edge. Visible only
                            while a drag is active so it doesn't add chrome to
                            the resting state.
                          */}
                          {dragImageState && (
                            <div
                              className={`self-stretch min-w-[5rem] rounded-lg border border-dashed flex items-center justify-center text-[11px] px-3 transition-all ${
                                dragOverGap === segmentation.groupings.length
                                  ? "border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-200"
                                  : "border-white/15 text-white/40"
                              }`}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDragOverGap(segmentation.groupings.length);
                                setDragOverGroup(null);
                              }}
                              onDragLeave={() => setDragOverGap(null)}
                              onDrop={() => handleDropNewGroup(segmentation.groupings.length)}
                            >
                              New group
                            </div>
                          )}

                          {/*
                            Bar-local controls — kept inline so the review-phase
                            bar carries its own +Add / Clear-all (no separate
                            wrapper section). +Add invalidates segmentation
                            (handled in handleImageUpload) so newly added photos
                            don't desync from existing groupings.
                          */}
                          {/*
                            +Add / Clear all live only at Step 2 ("review").
                            From Step 3 onward, the question content is anchored
                            to the locked groupings — adding or removing photos
                            would invalidate the seller's typed answers and
                            (at Step 4) the AI-generated listings.
                          */}
                          {bulkReviewPhase === "review" && (
                            <div className="ml-auto self-center shrink-0 flex flex-col gap-1">
                              <button
                                onClick={() => fileInputRef.current?.click()}
                                className="size-8 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-white/40 hover:text-white/60 hover:border-white/40 transition-all"
                                aria-label="Add more photos"
                              >
                                <Plus className="size-4" />
                              </button>
                              <button
                                onClick={clearAllUploads}
                                className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors px-2 py-1 rounded border border-transparent hover:border-red-400/20 hover:bg-red-500/10"
                              >
                                Clear all
                              </button>
                            </div>
                          )}
                        </div>
                        </>
                      ) : bulkReviewPhase && bulkItems.length > 0 ? (
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
                                        className={`relative size-16 rounded-lg border border-white/20 cursor-grab active:cursor-grabbing transition-opacity ${
                                          isDragging ? "opacity-40" : "opacity-100"
                                        }`}
                                      >
                                        <img
                                          src={img.preview}
                                          alt={`Upload ${imgIdx + 1}`}
                                          className="size-full object-cover rounded-lg"
                                          draggable={false}
                                        />
                                        <button
                                          type="button"
                                          aria-label={`Delete photo ${imgIdx + 1}`}
                                          onMouseDown={handleDeletePhotoMouseDown}
                                          onClick={handleDeletePhotoClick(imgIdx)}
                                          className="absolute -top-2 -right-2 size-5 flex items-center justify-center rounded-full bg-black/40 text-white/60 hover:bg-black/70 hover:text-white focus:outline-none focus:ring-1 focus:ring-white/60 transition-colors"
                                        >
                                          <X className="size-3" />
                                        </button>
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
                              onClick={clearAllUploads}
                              className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors px-2 py-1 rounded border border-transparent hover:border-red-400/20 hover:bg-red-500/10"
                            >
                              Clear all
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Flat view — default upload thumbnails */
                        <div className="flex items-center gap-2 mt-3 mb-2">
                          {uploadedImages.map((img, index) => (
                            <div key={index} className="relative">
                              <img
                                src={img.preview}
                                alt={`Upload ${index + 1}`}
                                className="size-16 object-cover rounded-lg border border-white/20"
                              />
                              <button
                                type="button"
                                aria-label={`Delete photo ${index + 1}`}
                                onMouseDown={handleDeletePhotoMouseDown}
                                onClick={handleDeletePhotoClick(index)}
                                className="absolute -top-2 -right-2 size-5 flex items-center justify-center rounded-full bg-black/40 text-white/60 hover:bg-black/70 hover:text-white focus:outline-none focus:ring-1 focus:ring-white/60 transition-colors"
                              >
                                <X className="size-3" />
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
                              onClick={clearAllUploads}
                              className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors px-2 py-1 rounded border border-transparent hover:border-red-400/20 hover:bg-red-500/10"
                            >
                              Clear all
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Inline error from /api/segment-photos — user stays on upload screen and can retry. */}
                  {segmentationError && !isGenerating && (
                    <div className="mt-3 flex items-start gap-3 p-3 rounded-lg border border-red-400/40 bg-red-500/10 text-red-200">
                      <AlertTriangle className="size-4 shrink-0 mt-0.5 text-red-300" />
                      <div className="flex-1 text-xs">
                        <div className="font-medium text-red-100">Couldn't analyze your photos</div>
                        <div className="mt-1 text-red-200/90">{segmentationError}</div>
                      </div>
                      <button
                        onClick={() => { setSegmentationError(null); handleSellSubmit(); }}
                        className="shrink-0 text-[11px] text-red-100 hover:text-white px-2 py-1 rounded border border-red-300/30 hover:bg-red-500/20"
                      >
                        Retry
                      </button>
                    </div>
                  )}


                  {/* Auto-Generated Product Details */}
                  {isGenerating && (
                    <div className="mt-6 p-6 bg-white/5 rounded-lg border border-white/10 text-center">
                      <Loader2 className="size-6 text-fuchsia-400 animate-spin mx-auto mb-3" />
                      <p className="text-white/60 text-sm">Analyzing your images...</p>
                    </div>
                  )}

                  {/*
                    Wizard panel — single fixed slot below the cluster bar.
                    Step 2 ("review") shows a Continue button; Step 3
                    ("reason") shows the rationale radio group + Generate
                    Listings. Both panels share an outer wrapper that
                    cross-fades + slides on phase change.

                    Transition:
                      • outgoing step: opacity 1 → 0, translateY 0 → -8px
                      • incoming step: opacity 0 → 1, translateY 8px → 0
                      • duration 300ms, eased with the default Tailwind
                        ease-out curve
                    Implementation: a single container with key={phase} so
                    React unmounts/remounts when the step changes; an inline
                    keyframe class drives the entry animation. CSS only,
                    no animation library.
                  */}
                  {(bulkReviewPhase === "review" || bulkReviewPhase === "reason" || bulkReviewPhase === "pickup") && !isGenerating && segmentation && (
                    <div
                      key={bulkReviewPhase}
                      className="mt-4 wizard-step-enter"
                      style={{
                        animation: "wizardStepIn 300ms ease-out both",
                      }}
                    >
                      {bulkReviewPhase === "review" ? (
                        <Button
                          onClick={() => {
                            setInstructionExiting(true);
                            setTimeout(() => {
                              startTransition(() => {
                                setInstructionExiting(false);
                                setBulkReviewPhase("reason");
                              });
                            }, 300);
                          }}
                          disabled={
                            segmentation.groupings.length === 0 ||
                            segmentation.groupings.some((g) => g.length === 0)
                          }
                          className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0"
                        >
                          {`Continue (${segmentation.groupings.length} ${segmentation.groupings.length === 1 ? "item" : "items"})`}
                        </Button>
                      ) : bulkReviewPhase === "reason" ? (
                        // Step 3 — rationale radio group + Generate trigger.
                        <div className="p-6 bg-white/5 rounded-lg border border-white/10 space-y-4 text-left">
                          <div className="space-y-2">
                            {[
                              "Moving",
                              "Upgrading",
                              "No longer fits",
                              "Gift never used",
                              "Decluttering",
                              "Other",
                            ].map((opt) => {
                              const isSelected = rationale === opt;
                              return (
                                <label
                                  key={opt}
                                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                                    isSelected
                                      ? "bg-fuchsia-500/10 border-fuchsia-400/40 text-fuchsia-100"
                                      : "bg-white/5 border-white/15 text-white/70 hover:bg-white/[0.07] hover:border-white/25"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="sell-rationale"
                                    value={opt}
                                    checked={isSelected}
                                    onChange={() => {
                                      setRationale(opt);
                                      // Clear the free-text input when leaving "Other"
                                      // so a stale value doesn't get sent on the next call.
                                      if (opt !== "Other") setRationaleOther("");
                                    }}
                                    className="size-4 accent-fuchsia-500 shrink-0"
                                  />
                                  <span className="text-sm">{opt}</span>
                                </label>
                              );
                            })}
                          </div>
                          {rationale === "Other" && (
                            <div>
                              <label className="text-xs text-white/40 uppercase tracking-wider">Tell us briefly why</label>
                              <Input
                                value={rationaleOther}
                                onChange={(e) => setRationaleOther(e.target.value)}
                                placeholder="Tell us briefly why"
                                maxLength={200}
                                className="mt-1 bg-white/5 border-white/20 text-white"
                              />
                            </div>
                          )}
                          <Button
                            onClick={handleGenerateListings}
                            disabled={
                              isGenerating ||
                              (rationale === "Other" && rationaleOther.trim() === "")
                            }
                            className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0"
                          >
                            {isGenerating ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              `Generate Listings (${segmentation.groupings.length})`
                            )}
                          </Button>
                        </div>
                      ) : (
                        // Step 5 — pickup confirmation. Single text input prefilled
                        // from user.pickup_address. "Post all" applies the value as
                        // a default to every bulk item that hasn't set its own
                        // per-card pickup override, then fires the existing bulk
                        // post pipeline.
                        <div className="space-y-4 max-w-md mx-auto">
                          <div>
                            <label className="text-xs text-white/40 uppercase tracking-wider">Pickup location</label>
                            <Input
                              value={bulkPickupLocation}
                              onChange={(e) => setBulkPickupLocation(e.target.value)}
                              placeholder="e.g. Lower East Side, NYC"
                              maxLength={200}
                              className="mt-1 bg-white/5 border-white/20 text-white"
                            />
                            <p className="text-[10px] text-white/30 mt-1.5 leading-relaxed">
                              Your address will not be shared until pickup is confirmed.
                            </p>
                          </div>
                          <Button
                            onClick={() => {
                              if (!isAuthenticated) { setPage("signin"); return; }
                              handleBulkPostFromPickupStep();
                            }}
                            disabled={isPostingBulk}
                            className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isPostingBulk ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : isAuthenticated ? (
                              `Post all (${bulkItems.length})`
                            ) : (
                              "Sign in to Post"
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {productDetails && !isGenerating && (
                    <div className="mt-6 p-6 bg-white/5 rounded-lg border border-white/10 space-y-4 text-left">
                      {productDetails.retrieval_fallback === true && (
                        <div className="flex gap-3 p-3 rounded-lg border border-yellow-400/40 bg-yellow-500/10 text-yellow-200">
                          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-yellow-300" />
                          <div className="text-xs">
                            <div className="font-medium text-yellow-100">Listing created with limited enrichment</div>
                            <div className="mt-1 text-yellow-200/90">We couldn't reach our product lookup service, so this listing was generated from the photo alone. Double-check the brand, model, and price before posting.</div>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-white/40 uppercase tracking-wider">Brand</label>
                          <Input
                            value={productDetails.brand}
                            onChange={(e) => setProductDetails({ ...productDetails, brand: e.target.value })}
                            className="mt-1 bg-white/5 border-white/20 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-white/40 uppercase tracking-wider">Name</label>
                          <Input
                            value={productDetails.name}
                            onChange={(e) => setProductDetails({ ...productDetails, name: e.target.value })}
                            className="mt-1 bg-white/5 border-white/20 text-white"
                          />
                        </div>
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
                          <PriceInput
                            value={productDetails.price}
                            onChange={(next) => setProductDetails({ ...productDetails, price: next })}
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
                      {/* Category */}
                      {Object.keys(categorySchemas).length > 0 && (
                        <>
                          <CategorySelector
                            category={productDetails.category || "other"}
                            schemas={categorySchemas}
                            onChange={(slug) => setProductDetails({ ...productDetails, category: slug, categoryAttributes: productDetails.categoryAttributes || {} })}
                          />
                          <CategoryAttributeFields
                            category={productDetails.category || "other"}
                            schemas={categorySchemas}
                            attributes={productDetails.categoryAttributes || {}}
                            identifierConfidence={productDetails.identifierConfidence}
                            onChange={(key, value) => setProductDetails({
                              ...productDetails,
                              categoryAttributes: { ...(productDetails.categoryAttributes || {}), [key]: value },
                            })}
                          />
                        </>
                      )}
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
                        className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 mt-2"
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
                        {/*
                          Step 4 image strip — read-only thumbnails. Adding or
                          removing photos here would change the locked groupings
                          and invalidate the AI-generated listing content, so
                          the +Add button and per-photo delete X are intentionally
                          omitted at this stage. To change groupings, the user
                          goes back to Step 2.
                        */}
                        <div className="flex items-center gap-2 mb-1">
                          {bulkItems[currentCardIndex].imageIndices.map((imgIdx) => (
                            <div key={imgIdx} className="relative">
                              <img
                                src={uploadedImages[imgIdx]?.preview}
                                alt="Item"
                                className="size-16 object-cover rounded-lg border border-white/20"
                              />
                            </div>
                          ))}
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

                        {bulkItems[currentCardIndex]._error && (
                          <div className="flex items-start gap-3 p-3 rounded-lg border border-red-400/40 bg-red-500/10 text-red-200">
                            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-red-300" />
                            <div className="flex-1 text-xs">
                              <div className="font-medium text-red-100">This item failed to generate</div>
                              <div className="mt-1 text-red-200/90">{bulkItems[currentCardIndex]._error}</div>
                            </div>
                            <button
                              onClick={() => regenerateBulkItem(currentCardIndex)}
                              disabled={isGenerating}
                              className="shrink-0 text-[11px] text-red-100 hover:text-white px-2 py-1 rounded border border-red-300/30 hover:bg-red-500/20 disabled:opacity-40"
                            >
                              {isGenerating ? <Loader2 className="size-3 animate-spin" /> : "Regenerate this item"}
                            </button>
                          </div>
                        )}
                        {bulkItems[currentCardIndex].retrieval_fallback === true && (
                          <div className="flex gap-3 p-3 rounded-lg border border-yellow-400/40 bg-yellow-500/10 text-yellow-200">
                            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-yellow-300" />
                            <div className="text-xs">
                              <div className="font-medium text-yellow-100">Listing created with limited enrichment</div>
                              <div className="mt-1 text-yellow-200/90">We couldn't reach our product lookup service, so this listing was generated from the photo alone. Double-check the brand, model, and price before posting.</div>
                            </div>
                          </div>
                        )}
                        {/*
                          Step 4 review surface: collapse Brand + Name into a
                          single Title input. On edit, split back into brand +
                          name using brand-prefix logic — if the typed title
                          still starts with the existing brand (case-insensitive),
                          strip the prefix to update name and keep brand. Otherwise
                          the full title becomes name and brand is cleared.
                          formatTitle stays the canonical display helper.
                        */}
                        <div>
                          <label className="text-xs text-white/40 uppercase tracking-wider">Title</label>
                          <Input
                            value={editingTitle ?? formatTitle(bulkItems[currentCardIndex].brand, bulkItems[currentCardIndex].name)}
                            onFocus={() => setEditingTitle(formatTitle(bulkItems[currentCardIndex].brand, bulkItems[currentCardIndex].name))}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => {
                              if (editingTitle === null) return;
                              const newTitle = editingTitle.trim();
                              const currentBrand = (bulkItems[currentCardIndex].brand || "").trim();
                              setBulkItems((prev) => {
                                const updated = [...prev];
                                const item = { ...updated[currentCardIndex] };
                                if (currentBrand && newTitle.toLowerCase().startsWith(currentBrand.toLowerCase() + " ")) {
                                  item.name = newTitle.slice(currentBrand.length + 1).trim();
                                } else {
                                  item.name = newTitle;
                                  item.brand = "";
                                }
                                updated[currentCardIndex] = item;
                                return updated;
                              });
                              setEditingTitle(null);
                            }}
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
                            <PriceInput
                              value={bulkItems[currentCardIndex].price}
                              onChange={(next) => updateBulkItem(currentCardIndex, "price", next)}
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
                        {/* Category */}
                        {Object.keys(categorySchemas).length > 0 && (
                          <>
                            <CategorySelector
                              category={bulkItems[currentCardIndex].category || "other"}
                              schemas={categorySchemas}
                              onChange={(slug) => {
                                const updated = [...bulkItems];
                                updated[currentCardIndex] = { ...updated[currentCardIndex], category: slug };
                                setBulkItems(updated);
                              }}
                            />
                            <CategoryAttributeFields
                              category={bulkItems[currentCardIndex].category || "other"}
                              schemas={categorySchemas}
                              attributes={bulkItems[currentCardIndex].categoryAttributes || {}}
                              identifierConfidence={bulkItems[currentCardIndex].identifierConfidence}
                              onChange={(key, value) => {
                                const updated = [...bulkItems];
                                updated[currentCardIndex] = {
                                  ...updated[currentCardIndex],
                                  categoryAttributes: { ...(updated[currentCardIndex].categoryAttributes || {}), [key]: value },
                                };
                                setBulkItems(updated);
                              }}
                            />
                          </>
                        )}
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
                              // Step 4 → Step 5 transition. Match the same
                              // fade+slide pattern used by other wizard
                              // transitions (review → reason, reason → cards).
                              setInstructionExiting(true);
                              setTimeout(() => {
                                startTransition(() => {
                                  setInstructionExiting(false);
                                  setBulkReviewPhase("pickup");
                                });
                              }, 300);
                            }
                          }}
                          className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0"
                        >
                          {currentCardIndex < bulkItems.length - 1 ? "Next Item" : "Continue"}
                        </Button>
                      </div>
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
                  handlePostListing();
                }}
                className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm & Post
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
                    alt={formatTitle(listingDetailData.brand, listingDetailData.name)}
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
                <h2 className="text-xl font-medium">{formatTitle(listingDetailData.brand, listingDetailData.name)}</h2>
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

              {/* Category Attributes (excluding brand/model — those are now
                  top-level fields rendered as part of formatTitle above). */}
              {listingDetailData.categoryAttributes && Object.keys(listingDetailData.categoryAttributes).filter(k => k !== "brand" && k !== "model" && listingDetailData.categoryAttributes![k]).length > 0 ? (
                <div className="space-y-1.5 mt-3 mb-4">
                  {listingDetailData.category && listingDetailData.category !== "other" && (
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-fuchsia-500/10 border border-fuchsia-400/20 text-fuchsia-300 mb-2">
                      {categorySchemas[listingDetailData.category]?.label || listingDetailData.category}
                    </span>
                  )}
                  {Object.entries(listingDetailData.categoryAttributes).map(([key, value]) => {
                    if (!value) return null;
                    // brand and model are top-level on the listing now and
                    // surface in the formatted title — skip them in the
                    // attributes list so legacy rows don't double-render.
                    if (key === "brand" || key === "model") return null;
                    const label = key === "carry_difficulty" ? "Carry Difficulty"
                      : key === "brand_or_creator" ? "Brand / Creator"
                      : key === "style_code" ? "Style Code"
                      : key.charAt(0).toUpperCase() + key.slice(1);
                    return (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        <span className="text-white/40">{label}:</span>
                        <span className={`text-white/80 ${key === "carry_difficulty" ? "font-medium text-amber-300" : ""}`}>{value}</span>
                      </div>
                    );
                  })}
                </div>
              ) : isAuthenticated && listingDetailData.userId === user?.id && listingDetailData.status !== "sold" ? (
                <div className="mt-3 mb-4 p-3 rounded-lg border border-cyan-400/20 bg-cyan-500/5">
                  <p className="text-xs text-cyan-300/70">Add category details like brand, size, or condition specifics to help buyers find your listing and increase your chances of selling.</p>
                </div>
              ) : null}

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
                  alt={formatTitle(listingDetailData.brand, listingDetailData.name)}
                  className="size-14 rounded-lg object-cover border border-white/10"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{formatTitle(listingDetailData.brand, listingDetailData.name)}</p>
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
                {/*
                  Brand + Name replace the old single Title input. The
                  buyer-facing title is computed via formatTitle on render
                  and never stored as an editable field.
                */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Brand</label>
                    <Input
                      value={editBrand}
                      onChange={(e) => setEditBrand(e.target.value)}
                      className="bg-white/5 border-white/10 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Name</label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="bg-white/5 border-white/10 text-white text-sm"
                    />
                  </div>
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
                    <PriceInput
                      value={editPrice}
                      onChange={setEditPrice}
                      className="bg-white/5 border-white/10 text-white text-sm"
                      placeholder="0"
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

                {/* Category */}
                {Object.keys(categorySchemas).length > 0 && (
                  <>
                    <CategorySelector
                      category={editCategory}
                      schemas={categorySchemas}
                      onChange={(slug) => setEditCategory(slug)}
                    />
                    <CategoryAttributeFields
                      category={editCategory}
                      schemas={categorySchemas}
                      attributes={editCategoryAttributes}
                      onChange={(key, value) => setEditCategoryAttributes({
                        ...editCategoryAttributes,
                        [key]: value,
                      })}
                    />
                  </>
                )}

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
                    disabled={isSavingListing || (!editBrand.trim() && !editName.trim()) || !editPrice.trim()}
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
