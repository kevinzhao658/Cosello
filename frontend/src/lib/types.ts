export type CategorySlug =
  | "clothing"
  | "furniture"
  | "electronics"
  | "sports"
  | "collectibles"
  | "other";

export interface CommunitySummary {
  id: number;
  name: string;
  neighborhood?: string;
  is_public?: boolean;
}

export interface ListingCommunity {
  name: string;
  is_public: boolean;
  is_mutual: boolean;
  is_neighborhood?: boolean;
  image?: string | null;
}

export interface MutualCommunity {
  name: string;
  is_public: boolean;
}

export interface Listing {
  id: string;
  userId?: string;
  brand: string;
  name: string;
  description: string;
  price: string;
  condition: string;
  location: string;
  tags: string[];
  imageUrl: string;
  imageUrls?: string[];
  postedAt: number;
  mutualCommunityNames?: string[];
  mutualCommunities?: MutualCommunity[];
  allCommunities?: ListingCommunity[];
  visibility?: "public" | "private";
  tier?: number;
  status?: string;
  seller_name?: string | null;
  seller_picture?: string | null;
  category?: CategorySlug;
  categoryAttributes?: Record<string, string>;
  identifierConfidence?: "high" | "medium" | "low";
  retrieval_fallback?: boolean;
  latitude: number | null;
  longitude: number | null;
  zip_code: string;
  distance_miles: number | null;
  /** Walking estimate in whole minutes from the buyer's ZIP centroid to the
   *  listing's fuzzed center. Populated by GET /api/listings/{id} (detail
   *  endpoint only — NOT the feed). null when MAPBOX_TOKEN is unset, the
   *  buyer is unauthenticated / has no ZIP, the listing has no coords, or
   *  Mapbox errored. */
  walk_minutes?: number | null;
  // Server still returns a stored `title` column for legacy clients during
  // the transition; modern UI ignores it and recomputes via formatTitle.
  title?: string;
}

export type MyListing = Pick<
  Listing,
  "id" | "brand" | "name" | "title" | "description" | "price" | "condition" | "location" | "tags" | "imageUrl" | "imageUrls" | "postedAt" | "status"
> & {
  pendingOrderCount?: number;
  latestOrderAt?: string | null;
};

export type WishlistListing = Pick<
  Listing,
  "id" | "brand" | "name" | "title" | "price" | "imageUrl" | "imageUrls" | "status"
>;

export interface CategoryField {
  key: string;
  label: string;
  type: "text" | "select";
  required: boolean;
  options?: string[];
  tooltip?: string;
}

export interface CategorySchema {
  label: string;
  fields: CategoryField[];
}

// Payload shape for PUT /api/listings/:id. Category fields are optional so
// the MyAccountPage call site (which doesn't surface category editing) can
// omit them; both keys are sent together when present so the backend never
// sees a half-updated category.
export interface ListingUpdatePatch {
  brand: string;
  name: string;
  description: string;
  price: string;
  condition: string;
  location: string;
  tags: string[];
  category?: CategorySlug;
  categoryAttributes?: Record<string, string>;
}

// Order payload returned by `GET /api/orders` (and the per-order shapes used by
// the seller-confirm, buyer-confirm summary, attestation, and rating modals).
// Lifted out of MyAccountPage so App-level notification → modal handlers can
// fetch and pass the same shape.
export interface OrderData {
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
