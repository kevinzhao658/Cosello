import { useState, useEffect } from "react";
import {
  User,
  Globe,
  MapPin,
  X,
  Loader2,
  Lock,
  Star,
  UserPlus,
  UserCheck,
  Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { formatTitle } from "../lib/format";
import { apiFetch } from "../lib/api";
import { ModalShell } from "../components/ui/ModalShell";
import { Button } from "../components/ui/button";
import { ListingImage } from "../components/ui/ListingImage";
import { FOCUS_RING, PANEL_TITLE } from "./MyAccount/constants";
import type { Listing } from "../lib/types";

interface ProfileData {
  id: string;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
  is_friend: boolean;
  communities: { id: number; name: string; image: string | null; is_mutual: boolean; is_public?: boolean }[];
  mutual_friends: { id: string; display_name: string | null; profile_picture: string | null; neighborhood: string | null }[];
  // brand + name replace the old computed `title`. Display title is composed
  // via formatTitle on render. `title` may still arrive from older API
  // responses during the rollout — keep it optional for back-compat.
  active_listings: { id: string; brand: string; name: string; title?: string; price: string; imageUrl: string; imageUrls?: string[]; condition: string; status: string }[];
  reviews: { rating: number; comment: string | null; reviewer_name: string | null; reviewer_picture: string | null; reviewer_role: string; created_at: string | null }[];
  stats: { total_listings: number; review_count: number; avg_rating: number | null };
  member_since: string | null;
}

interface UserProfileOverlayProps {
  userId: string;
  onClose: () => void;
  onViewUser: (userId: string) => void;
  openListingDetail?: (listing: Listing) => void;
}

const SECTION_CARD = "bg-canvas border border-hairline rounded-md shadow-card";
const SECTION_LABEL = "text-[10px] text-muted-soft uppercase tracking-wider mb-3";
const AVATAR_SURFACE = "bg-surface-soft border border-hairline";

export default function UserProfileOverlay({ userId, onClose, onViewUser, openListingDetail }: UserProfileOverlayProps) {
  const { token } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTogglingFriend, setIsTogglingFriend] = useState(false);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    setData(null);
    apiFetch(`/api/friends/profile/${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [userId, token]);

  const toggleFriend = async () => {
    if (!token || !data) return;
    setIsTogglingFriend(true);
    try {
      if (data.is_friend) {
        await apiFetch(`/api/friends/${data.id}`, {
          method: "DELETE",
        });
        setData({ ...data, is_friend: false });
      } else {
        const res = await apiFetch("/api/friends/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: data.id }),
        });
        if (res.ok) setData({ ...data, is_friend: true });
      }
    } catch {
      // ignore
    } finally {
      setIsTogglingFriend(false);
    }
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`size-3 ${i < rating ? "text-warning fill-warning" : "text-hairline"}`}
      />
    ));
  };

  return (
    <ModalShell open onClose={onClose} z={300} align="start">
      <div className="relative z-[1] w-full max-w-3xl mx-4 my-8 space-y-4">
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close profile"
          className={`absolute -top-1 -right-1 z-10 size-8 rounded-full bg-canvas border border-hairline text-muted hover:text-ink hover:shadow-hover transition-colors flex items-center justify-center ${FOCUS_RING}`}
        >
          <X className="size-4" />
        </button>

        {isLoading ? (
          <div className={`${SECTION_CARD} p-16 text-center`}>
            <Loader2 className="size-8 motion-safe:animate-spin mx-auto text-primary" />
          </div>
        ) : data ? (
          <>
            {/* Profile Header */}
            <div className={`${SECTION_CARD} p-8`}>
              <div className="flex items-center gap-6">
                <div className="relative shrink-0">
                  <div className={`size-24 rounded-full ${AVATAR_SURFACE} flex items-center justify-center overflow-hidden`}>
                    {data.profile_picture ? (
                      <img src={data.profile_picture} alt="" className="size-full object-cover" />
                    ) : (
                      <User className="size-10 text-muted-soft" />
                    )}
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-canvas border border-hairline rounded-full px-2 py-0.5 shadow-card">
                    <span className="text-xs font-semibold text-ink">
                      {(() => {
                        const s = data.stats.avg_seller_rating ?? 5.0;
                        const b = data.stats.avg_buyer_rating ?? 5.0;
                        return ((s + b) / 2).toFixed(1);
                      })()}
                    </span>
                    <Star className="size-2.5 text-warning fill-warning" />
                  </div>
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl font-extrabold text-ink tracking-display mb-1">{data.display_name || "User"}</h1>
                  {data.neighborhood && (
                    <p className="text-sm text-muted flex items-center gap-1.5">
                      <MapPin className="size-3.5" />
                      {data.neighborhood}
                    </p>
                  )}
                  {data.member_since && (
                    <p className="text-xs text-muted-soft mt-1">
                      Member since {new Date(data.member_since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </p>
                  )}
                  {/* Stats */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-surface-soft border border-hairline rounded-md px-3 py-1.5">
                      <span className="text-xs font-semibold text-ink">{data.stats.total_listings}</span>
                      <span className="text-[10px] text-muted">Listings</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-surface-soft border border-hairline rounded-md px-3 py-1.5">
                      <Star className="size-3 text-warning fill-warning" />
                      <span className="text-xs font-semibold text-ink">{data.stats.avg_seller_rating ?? 5.0}</span>
                      <span className="text-[10px] text-muted">
                        Seller{data.stats.seller_review_count > 0 ? ` (${data.stats.seller_review_count})` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-surface-soft border border-hairline rounded-md px-3 py-1.5">
                      <Star className="size-3 text-warning fill-warning" />
                      <span className="text-xs font-semibold text-ink">{data.stats.avg_buyer_rating ?? 5.0}</span>
                      <span className="text-[10px] text-muted">
                        Buyer{data.stats.buyer_review_count > 0 ? ` (${data.stats.buyer_review_count})` : ""}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Friend button */}
                <Button
                  onClick={toggleFriend}
                  disabled={isTogglingFriend}
                  variant={data.is_friend ? "outline" : "default"}
                  size="sm"
                  className="shrink-0"
                >
                  {isTogglingFriend ? (
                    <Loader2 className="size-3.5 motion-safe:animate-spin" />
                  ) : data.is_friend ? (
                    <UserCheck className="size-3.5" />
                  ) : (
                    <UserPlus className="size-3.5" />
                  )}
                  {data.is_friend ? "Friends" : "Add Friend"}
                </Button>
              </div>
            </div>

            {/* Communities */}
            {data.communities.length > 0 && (
              <div className={`${SECTION_CARD} p-6`}>
                <p className={SECTION_LABEL}>Communities</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.communities.map((c) => (
                    <span
                      key={c.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
                        c.is_mutual
                          ? "bg-primary-soft text-primary border-primary/20"
                          : "bg-surface-soft text-muted border-hairline"
                      }`}
                    >
                      {c.image ? (
                        <ListingImage src={c.image} alt="" size="small" className="size-3.5 rounded-full object-cover" />
                      ) : c.is_public !== false ? (
                        <Globe className="size-3" />
                      ) : (
                        <Lock className="size-3" />
                      )}
                      {c.name}
                      {c.is_mutual && <span className="text-[9px] text-primary/70">mutual</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Active Listings */}
            {data.active_listings.length > 0 && (
              <div className={`${SECTION_CARD} p-6`}>
                <p className={SECTION_LABEL}>Active Listings</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.active_listings.map((listing) => (
                    <button
                      key={listing.id}
                      onClick={() => openListingDetail?.({
                        ...listing,
                        description: "",
                        location: "",
                        tags: [],
                        postedAt: 0,
                        userId: data.id,
                        imageUrls: listing.imageUrls && listing.imageUrls.length > 0 ? listing.imageUrls : [listing.imageUrl],
                      })}
                      className={`text-left bg-surface-card border border-hairline rounded-md overflow-hidden hover:shadow-hover hover:border-border-strong transition-colors ${FOCUS_RING}`}
                    >
                      <div className="aspect-square bg-surface-soft">
                        {listing.imageUrl ? (
                          <ListingImage src={listing.imageUrl} alt={formatTitle(listing.brand, listing.name)} size="card" className="size-full object-cover" />
                        ) : (
                          <div className="size-full flex items-center justify-center text-muted-soft">
                            <User className="size-8" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-semibold text-ink truncate">{formatTitle(listing.brand, listing.name)}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs font-semibold text-primary">${listing.price}</span>
                          <span className="text-[10px] text-muted px-1.5 py-0.5 rounded bg-surface-soft border border-hairline">{listing.condition}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            {data.reviews.length > 0 && (
              <div className={`${SECTION_CARD} p-6`}>
                <p className={SECTION_LABEL}>
                  Reviews ({data.reviews.length})
                </p>
                <div className="space-y-3">
                  {data.reviews.map((review, i) => (
                    <div key={i} className="bg-surface-card border border-hairline rounded-md p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-0.5">
                          {renderStars(review.rating)}
                        </div>
                        <span className="text-[10px] text-muted-soft">
                          {review.reviewer_role === "buyer" ? "rated as seller" : "rated as buyer"}
                        </span>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-body mb-2 leading-relaxed">"{review.comment}"</p>
                      )}
                      <div className="flex items-center gap-2">
                        <div className={`size-5 rounded-full ${AVATAR_SURFACE} flex items-center justify-center overflow-hidden shrink-0`}>
                          {review.reviewer_picture ? (
                            <img src={review.reviewer_picture} alt="" className="size-full object-cover" />
                          ) : (
                            <User className="size-2.5 text-muted-soft" />
                          )}
                        </div>
                        <span className="text-[10px] text-muted">{review.reviewer_name || "Anonymous"}</span>
                        {review.created_at && (
                          <span className="text-[10px] text-muted-soft ml-auto">
                            {new Date(review.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mutual Friends */}
            {data.mutual_friends.length > 0 && (
              <div className={`${SECTION_CARD} p-6`}>
                <p className={SECTION_LABEL}>
                  Mutual Friends ({data.mutual_friends.length})
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {data.mutual_friends.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onViewUser(f.id)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-surface-soft transition-colors text-left ${FOCUS_RING}`}
                    >
                      <div className={`size-8 rounded-full ${AVATAR_SURFACE} flex items-center justify-center overflow-hidden shrink-0`}>
                        {f.profile_picture ? (
                          <img src={f.profile_picture} alt="" className="size-full object-cover" />
                        ) : (
                          <User className="size-3.5 text-muted-soft" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${PANEL_TITLE} truncate`}>{f.display_name}</p>
                        {f.neighborhood && (
                          <p className="text-[10px] text-muted-soft truncate">{f.neighborhood}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state for no listings/reviews/friends */}
            {data.active_listings.length === 0 && data.reviews.length === 0 && data.mutual_friends.length === 0 && data.communities.length === 0 && (
              <div className={`${SECTION_CARD} p-8 text-center`}>
                <Users className="size-8 text-muted-soft mx-auto mb-2" />
                <p className="text-sm text-muted">No activity yet</p>
              </div>
            )}
          </>
        ) : (
          <div className={`${SECTION_CARD} p-16 text-center`}>
            <p className="text-sm text-muted">User not found</p>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
