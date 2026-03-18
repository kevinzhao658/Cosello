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

interface ProfileData {
  id: number;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
  is_friend: boolean;
  communities: { id: number; name: string; image: string | null; is_mutual: boolean; is_public?: boolean }[];
  mutual_friends: { id: number; display_name: string | null; profile_picture: string | null; neighborhood: string | null }[];
  active_listings: { id: string; title: string; price: string; imageUrl: string; imageUrls?: string[]; condition: string; status: string }[];
  reviews: { rating: number; comment: string | null; reviewer_name: string | null; reviewer_picture: string | null; reviewer_role: string; created_at: string | null }[];
  stats: { total_listings: number; review_count: number; avg_rating: number | null };
  member_since: string | null;
}

interface UserProfileOverlayProps {
  userId: number;
  onClose: () => void;
  onViewUser: (userId: number) => void;
  openListingDetail?: (listing: any) => void;
}

export default function UserProfileOverlay({ userId, onClose, onViewUser, openListingDetail }: UserProfileOverlayProps) {
  const { token } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTogglingFriend, setIsTogglingFriend] = useState(false);

  useEffect(() => {
    if (!token) return;
    setIsLoading(true);
    setData(null);
    fetch(`/api/friends/profile/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
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
        await fetch(`/api/friends/${data.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        setData({ ...data, is_friend: false });
      } else {
        const res = await fetch("/api/friends/add", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
        className={`size-3 ${i < rating ? "text-amber-400 fill-amber-400" : "text-white/15"}`}
      />
    ));
  };

  return (
    <div className="fixed inset-0 z-[300] isolate flex items-start justify-center overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative z-[1] w-full max-w-3xl mx-4 my-8 space-y-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-1 -right-1 z-10 size-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <X className="size-4 text-white/60" />
        </button>

        {isLoading ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
            <Loader2 className="size-8 animate-spin mx-auto text-fuchsia-400" />
          </div>
        ) : data ? (
          <>
            {/* Profile Header */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
              <div className="flex items-center gap-6">
                <div className="relative shrink-0">
                  <div className="size-24 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 border-2 border-white/10 flex items-center justify-center overflow-hidden">
                    {data.profile_picture ? (
                      <img src={data.profile_picture} alt="" className="size-full object-cover" />
                    ) : (
                      <User className="size-10 text-white/60" />
                    )}
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-zinc-900 border-2 border-white/10 rounded-full px-2 py-0.5">
                    <span className="text-xs font-semibold text-white">
                      {(() => {
                        const s = data.stats.avg_seller_rating ?? 5.0;
                        const b = data.stats.avg_buyer_rating ?? 5.0;
                        return ((s + b) / 2).toFixed(1);
                      })()}
                    </span>
                    <Star className="size-2.5 text-amber-400 fill-amber-400" />
                  </div>
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl font-light tracking-wider mb-1">{data.display_name || "User"}</h1>
                  {data.neighborhood && (
                    <p className="text-white/50 text-sm flex items-center gap-1.5">
                      <MapPin className="size-3.5" />
                      {data.neighborhood}
                    </p>
                  )}
                  {data.member_since && (
                    <p className="text-white/30 text-xs mt-1">
                      Member since {new Date(data.member_since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </p>
                  )}
                  {/* Stats */}
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                      <span className="text-xs font-medium">{data.stats.total_listings}</span>
                      <span className="text-[10px] text-white/40">Listings</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                      <Star className="size-3 text-amber-400 fill-amber-400" />
                      <span className="text-xs font-medium">{data.stats.avg_seller_rating ?? 5.0}</span>
                      <span className="text-[10px] text-white/40">
                        Seller{data.stats.seller_review_count > 0 ? ` (${data.stats.seller_review_count})` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                      <Star className="size-3 text-cyan-400 fill-cyan-400" />
                      <span className="text-xs font-medium">{data.stats.avg_buyer_rating ?? 5.0}</span>
                      <span className="text-[10px] text-white/40">
                        Buyer{data.stats.buyer_review_count > 0 ? ` (${data.stats.buyer_review_count})` : ""}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Friend button */}
                <button
                  onClick={toggleFriend}
                  disabled={isTogglingFriend}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
                    data.is_friend
                      ? "bg-cyan-500/15 text-cyan-400 border-cyan-400/20 hover:bg-cyan-500/25"
                      : "bg-white/5 text-white/60 border-white/20 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {isTogglingFriend ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : data.is_friend ? (
                    <UserCheck className="size-3.5" />
                  ) : (
                    <UserPlus className="size-3.5" />
                  )}
                  {data.is_friend ? "Friends" : "Add Friend"}
                </button>
              </div>
            </div>

            {/* Communities */}
            {data.communities.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Communities</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.communities.map((c) => (
                    <span
                      key={c.id}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
                        c.is_mutual
                          ? "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/25"
                          : "bg-white/5 text-white/40 border-white/10"
                      }`}
                    >
                      {c.image ? (
                        <img src={c.image} alt="" className="size-3.5 rounded-full object-cover" />
                      ) : c.is_public !== false ? (
                        <Globe className="size-3" />
                      ) : (
                        <Lock className="size-3" />
                      )}
                      {c.name}
                      {c.is_mutual && <span className="text-[9px] text-fuchsia-400/70">mutual</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Active Listings */}
            {data.active_listings.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Active Listings</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.active_listings.map((listing) => (
                    <button
                      key={listing.id}
                      onClick={() => openListingDetail?.({
                        ...listing,
                        userId: data.id,
                        imageUrls: listing.imageUrls && listing.imageUrls.length > 0 ? listing.imageUrls : [listing.imageUrl],
                      })}
                      className="text-left bg-white/[0.03] border border-white/10 rounded-lg overflow-hidden hover:bg-white/[0.06] transition-colors"
                    >
                      <div className="aspect-square bg-white/5">
                        {listing.imageUrl ? (
                          <img src={listing.imageUrl} alt={listing.title} className="size-full object-cover" />
                        ) : (
                          <div className="size-full flex items-center justify-center text-white/20">
                            <User className="size-8" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-medium truncate">{listing.title}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs font-semibold text-fuchsia-400">${listing.price}</span>
                          <span className="text-[10px] text-white/30 px-1.5 py-0.5 rounded bg-white/5">{listing.condition}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            {data.reviews.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">
                  Reviews ({data.reviews.length})
                </p>
                <div className="space-y-3">
                  {data.reviews.map((review, i) => (
                    <div key={i} className="bg-white/[0.03] border border-white/10 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-0.5">
                          {renderStars(review.rating)}
                        </div>
                        <span className="text-[10px] text-white/20">
                          {review.reviewer_role === "buyer" ? "rated as seller" : "rated as buyer"}
                        </span>
                      </div>
                      {review.comment && (
                        <p className="text-xs text-white/60 mb-2 leading-relaxed">"{review.comment}"</p>
                      )}
                      <div className="flex items-center gap-2">
                        <div className="size-5 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                          {review.reviewer_picture ? (
                            <img src={review.reviewer_picture} alt="" className="size-full object-cover" />
                          ) : (
                            <User className="size-2.5 text-white/50" />
                          )}
                        </div>
                        <span className="text-[10px] text-white/40">{review.reviewer_name || "Anonymous"}</span>
                        {review.created_at && (
                          <span className="text-[10px] text-white/20 ml-auto">
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
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">
                  Mutual Friends ({data.mutual_friends.length})
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {data.mutual_friends.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onViewUser(f.id)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-left"
                    >
                      <div className="size-8 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden shrink-0 border border-white/10">
                        {f.profile_picture ? (
                          <img src={f.profile_picture} alt="" className="size-full object-cover" />
                        ) : (
                          <User className="size-3.5 text-white/50" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white/80 truncate">{f.display_name}</p>
                        {f.neighborhood && (
                          <p className="text-[10px] text-white/25 truncate">{f.neighborhood}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state for no listings/reviews/friends */}
            {data.active_listings.length === 0 && data.reviews.length === 0 && data.mutual_friends.length === 0 && data.communities.length === 0 && (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                <Users className="size-8 text-white/15 mx-auto mb-2" />
                <p className="text-sm text-white/30">No activity yet</p>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
            <p className="text-sm text-white/30">User not found</p>
          </div>
        )}
      </div>
    </div>
  );
}
