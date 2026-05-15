export type CategorySlug =
  | "clothing"
  | "furniture"
  | "electronics"
  | "sports"
  | "collectibles"
  | "other";

export interface ListingCommunity {
  name: string;
  is_public: boolean;
  is_mutual: boolean;
  is_neighborhood?: boolean;
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
