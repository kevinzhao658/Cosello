import { useEffect, useState } from "react";
import { X, ChevronRight, MapPin, Users, Lock, User, Loader2, Pencil } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ModalShell } from "../../components/ui/ModalShell";
import { formatTitle } from "../../lib/format";
import type { Listing } from "../../lib/types";

export type SellerProfile = {
  id: string;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
  is_friend: boolean;
  communities: { id: number; name: string; image: string | null; is_mutual: boolean; is_public?: boolean }[];
  mutual_friends: { id: string; display_name: string | null; profile_picture: string | null; neighborhood: string | null }[];
};

export type BuyerOrderStatus = { status: string | null; order_id?: number } | null;

type ListingDetailModalProps = {
  open: boolean;
  onClose: () => void;
  listing: Listing | null;
  isAuthenticated: boolean;
  currentUserId: string | undefined;
  sellerProfile: SellerProfile | null;
  isLoadingSeller: boolean;
  buyerOrderStatus: BuyerOrderStatus;
  categorySchemas: Record<string, { label: string }>;
  onOpenUserDashboard: (userId: string) => void;
  onOpenEdit: () => void;
  onOpenBuy: () => void;
  onEditPickupSlots: () => void;
  onSignInPrompt: () => void;
};

export function ListingDetailModal({
  open,
  onClose,
  listing,
  isAuthenticated,
  currentUserId,
  sellerProfile,
  isLoadingSeller,
  buyerOrderStatus,
  categorySchemas,
  onOpenUserDashboard,
  onOpenEdit,
  onOpenBuy,
  onEditPickupSlots,
  onSignInPrompt,
}: ListingDetailModalProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const listingId = listing?.id;
  useEffect(() => {
    setImageIndex(0);
  }, [listingId]);

  if (!open || !listing) return null;

  const images = listing.imageUrls?.length ? listing.imageUrls : [listing.imageUrl];
  // Clamp in case the listing changed under us before the carousel reset.
  const safeIndex = Math.min(imageIndex, images.length - 1);

  return (
    <ModalShell open onClose={onClose} z={200}>
      <div
        className="relative w-full max-w-4xl mx-4 rounded-lg border border-white/15 shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "#18181b" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 size-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
        >
          <X className="size-4 text-white/80" />
        </button>

        {/* Large Image */}
        <div className="relative w-full aspect-square bg-black">
          <img
            src={images[safeIndex]}
            alt={formatTitle(listing.brand, listing.name)}
            className="w-full h-full object-contain"
          />
          {images.length > 1 && (
            <>
              <button
                onClick={() => setImageIndex((safeIndex - 1 + images.length) % images.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80"
              >
                <ChevronRight className="size-4 rotate-180" />
              </button>
              <button
                onClick={() => setImageIndex((safeIndex + 1) % images.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white/80"
              >
                <ChevronRight className="size-4" />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setImageIndex(i)}
                    className={`size-2 rounded-full transition-colors ${i === safeIndex ? "bg-white" : "bg-white/40"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Product Info */}
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h2 className="text-xl font-medium">{formatTitle(listing.brand, listing.name)}</h2>
            <span className="text-xl font-semibold text-fuchsia-400 shrink-0">${listing.price}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/50 mb-3">
            <span className="px-2 py-0.5 rounded bg-white/10 text-xs">{listing.condition}</span>
            <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{listing.location}</span>
          </div>

          {listing.description && (
            <p className="text-sm text-white/60 mb-4 leading-relaxed">{listing.description}</p>
          )}

          {listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {listing.tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-fuchsia-500/10 border border-fuchsia-400/20 text-fuchsia-300">{tag}</span>
              ))}
            </div>
          )}

          {/* Category Attributes (excluding brand/model — those are now
              top-level fields rendered as part of formatTitle above). */}
          {listing.categoryAttributes && Object.keys(listing.categoryAttributes).filter(k => k !== "brand" && k !== "model" && listing.categoryAttributes![k]).length > 0 ? (
            <div className="space-y-1.5 mt-3 mb-4">
              {listing.category && listing.category !== "other" && (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-fuchsia-500/10 border border-fuchsia-400/20 text-fuchsia-300 mb-2">
                  {categorySchemas[listing.category]?.label || listing.category}
                </span>
              )}
              {Object.entries(listing.categoryAttributes).map(([key, value]) => {
                if (!value) return null;
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
          ) : isAuthenticated && listing.userId === currentUserId && listing.status !== "sold" ? (
            <div className="mt-3 mb-4 p-3 rounded-lg border border-cyan-400/20 bg-cyan-500/5">
              <p className="text-xs text-cyan-300/70">Add category details like brand, size, or condition specifics to help buyers find your listing and increase your chances of selling.</p>
            </div>
          ) : null}

          {listing.mutualCommunities && listing.mutualCommunities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {listing.mutualCommunities.map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-white/5 border border-white/10 text-white/40 inline-flex items-center gap-1">
                  {c.is_public ? <Users className="size-2.5" /> : <Lock className="size-2.5" />}{c.name}
                </span>
              ))}
            </div>
          )}

          {/* Seller Section */}
          {isLoadingSeller ? (
            <div className="py-6 text-center border-t border-white/10">
              <Loader2 className="size-5 animate-spin mx-auto text-fuchsia-400" />
            </div>
          ) : sellerProfile ? (
            <div className="border-t border-white/10 pt-4 mt-4">
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-3">Seller</p>
              <button
                onClick={() => onOpenUserDashboard(sellerProfile.id)}
                className="flex items-center gap-3 mb-3 hover:opacity-80 transition-opacity w-full text-left"
              >
                <div className="size-10 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden border border-white/10">
                  {sellerProfile.profile_picture ? (
                    <img src={sellerProfile.profile_picture} alt="" className="size-full object-cover" />
                  ) : (
                    <User className="size-4 text-white/50" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{sellerProfile.display_name || "User"}</p>
                  {sellerProfile.neighborhood && (
                    <p className="text-xs text-white/40 flex items-center gap-1"><MapPin className="size-3" />{sellerProfile.neighborhood}</p>
                  )}
                </div>
                {sellerProfile.is_friend && (
                  <span className="ml-auto text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-full border border-cyan-400/20">Friend</span>
                )}
              </button>

              {sellerProfile.communities.filter((c) => c.is_mutual).length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] text-white/25 mb-1.5">Shared communities</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sellerProfile.communities.filter((c) => c.is_mutual).map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-400/20">
                        {c.is_public !== false ? <Users className="size-2.5" /> : <Lock className="size-2.5" />}{c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sellerProfile.mutual_friends.length > 0 && (
                <div>
                  <p className="text-[10px] text-white/25 mb-1.5">Mutual friends ({sellerProfile.mutual_friends.length})</p>
                  <div className="flex -space-x-2">
                    {sellerProfile.mutual_friends.slice(0, 5).map((f) => (
                      <div key={f.id} className="size-7 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden border-2 border-[#18181b]" title={f.display_name || ""}>
                        {f.profile_picture ? (
                          <img src={f.profile_picture} alt="" className="size-full object-cover" />
                        ) : (
                          <User className="size-3 text-white/50" />
                        )}
                      </div>
                    ))}
                    {sellerProfile.mutual_friends.length > 5 && (
                      <div className="size-7 rounded-full bg-white/10 flex items-center justify-center border-2 border-[#18181b] text-[10px] text-white/50">
                        +{sellerProfile.mutual_friends.length - 5}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Buy / Edit Button */}
          {isAuthenticated && listing.userId === currentUserId ? (
            listing.status === "sold" ? (
              <div className="mt-5 text-center py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/40 text-sm">Sold</div>
            ) : (
              <Button
                onClick={onOpenEdit}
                className="w-full bg-white/10 hover:bg-white/15 text-white border border-white/10 mt-5 gap-2"
              >
                <Pencil className="size-4" />
                Edit Listing
              </Button>
            )
          ) : isAuthenticated && listing.userId !== currentUserId ? (
            listing.status === "sold" ? (
              <div className="mt-5 text-center py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/40 text-sm">Sold</div>
            ) : buyerOrderStatus?.status === "declined" ? (
              <div className="mt-5 text-center py-2.5 rounded-lg bg-red-500/10 border border-red-400/20 text-red-400/70 text-sm">Your order was declined</div>
            ) : buyerOrderStatus?.status === "pending" ? (
              <button
                onClick={onEditPickupSlots}
                className="w-full mt-5 text-center py-2.5 rounded-lg bg-amber-500/10 border border-amber-400/20 text-amber-400 text-sm hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                Order Pending — Edit Pickup Times
              </button>
            ) : buyerOrderStatus?.status === "confirmed" ? (
              <div className="mt-5 text-center py-2.5 rounded-lg bg-green-500/10 border border-green-400/20 text-green-400 text-sm">Order Confirmed</div>
            ) : (
              <Button
                onClick={onOpenBuy}
                className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 mt-5"
              >
                Buy
              </Button>
            )
          ) : !isAuthenticated ? (
            <Button
              onClick={onSignInPrompt}
              className="w-full bg-white/10 hover:bg-white/15 text-white/60 border-0 mt-5"
            >
              Sign in to Buy
            </Button>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}
