import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import type { Listing } from "../lib/types";

type Page = "home" | "market" | "terms" | "signin" | "signup" | "account" | "help" | "mission" | "newlisting";

export interface UseWishlistReturn {
  ids: Set<string>;
  items: Listing[];
  isPulsing: (id: string) => boolean;
  toggle: (listingId: string) => Promise<void>;
  clearPulse: (id: string) => void;
  refetchItems: () => Promise<void>;
  reset: () => void;
}

export function useWishlist(token: string | null, page: Page): UseWishlistReturn {
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [pulseSavedIds, setPulseSavedIds] = useState<Set<string>>(new Set());
  const [wishlistItems, setWishlistItems] = useState<Listing[]>([]);

  const fetchWishlist = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/wishlist");
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
      const res = await apiFetch("/api/wishlist/listings");
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
      const res = await apiFetch(`/api/wishlist/${listingId}`, {
        method: "POST",
      });
      if (res.ok) {
        const { wishlisted } = await res.json();
        setWishlist((prev) => {
          const next = new Set(prev);
          wishlisted ? next.add(listingId) : next.delete(listingId);
          return next;
        });
        if (wishlisted) {
          setPulseSavedIds((prev) => {
            const next = new Set(prev);
            next.add(listingId);
            return next;
          });
        }
      }
    } catch (err) {
      console.error("Failed to toggle wishlist:", err);
    }
  };

  useEffect(() => {
    if (token) fetchWishlist();
  }, [token]);

  useEffect(() => {
    if (page === "account" && token) fetchWishlistItems();
  }, [page, token]);

  const isPulsing = (id: string) => pulseSavedIds.has(id);

  const clearPulse = (id: string) => {
    setPulseSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const reset = () => {
    setWishlist(new Set());
    setWishlistItems([]);
  };

  return {
    ids: wishlist,
    items: wishlistItems,
    isPulsing,
    toggle: toggleWishlist,
    clearPulse,
    refetchItems: fetchWishlistItems,
    reset,
  };
}
