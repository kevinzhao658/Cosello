import { useCallback } from "react";
import { apiFetch } from "../../lib/api";
import { formatTitle } from "../../lib/format";
import type { ProductDetails, SellWizardState, SellWizardActions } from "./useSellWizard";

// Converts a price string ("$12.50" or "12.50") to integer cents.
// Returns null if the value is empty, non-numeric, or negative.
// Used exclusively by the post-listing handlers — kept here alongside its callers.
const priceStringToCents = (raw: string): number | null => {
  const cleaned = raw.replace(/^\$/, "").trim();
  if (cleaned === "") return null;
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
};

export interface UsePostListingDeps {
  state: SellWizardState;
  actions: SellWizardActions;
  isAuthenticated: boolean;
  currentDraftId: string | null;
  setCurrentDraftId: (id: string | null) => void;
  selectedCommunityIds: number[];
  onPosted: () => void;
  onPublishedDraft?: (draftId: string | null) => void | Promise<void>;
  onRequestSignIn: () => void;
  clearDraftCreatedAt: () => void;
}

export interface UsePostListingReturn {
  postSingleListing: (override?: { details: ProductDetails; pickupLocation: string }) => Promise<void>;
  postBulk: () => Promise<void>;
  postBulkFromPickup: () => Promise<void>;
}

export function usePostListing({
  state,
  actions,
  isAuthenticated,
  currentDraftId,
  setCurrentDraftId,
  selectedCommunityIds,
  onPosted,
  onPublishedDraft,
  onRequestSignIn,
  clearDraftCreatedAt,
}: UsePostListingDeps): UsePostListingReturn {
  const {
    productDetails,
    uploadedImages,
    postPickupLocation,
    segmentation,
    bulkItems,
    bulkPickupLocation,
  } = state;

  const postSingleListing = useCallback(async (override?: { details: ProductDetails; pickupLocation: string }) => {
    // Override path lets the New Listing page publish in Manual mode without
    // waiting for setProductDetails to flush through React state.
    const details = override?.details ?? productDetails;
    const pickup = override?.pickupLocation ?? postPickupLocation;
    if (!details || uploadedImages.length === 0) return;
    if (!isAuthenticated) { onRequestSignIn(); return; }

    const priceCents = priceStringToCents(details.price);
    if (priceCents === null) { alert("Enter a valid price before posting."); return; }

    try {
      const formData = new FormData();
      const draftUrls = segmentation
        ? segmentation.image_urls.filter(
            (url): url is string => typeof url === "string" && url.length > 0,
          )
        : [];
      if (draftUrls.length > 0) {
        formData.append("draft_urls", JSON.stringify(draftUrls));
      } else {
        uploadedImages.forEach((img) => formData.append("images", img.file));
      }
      const { identifierConfidence: _, retrieval_fallback: _rf, ...rest } = details;
      void _; void _rf;
      const postData = { ...rest, priceCents };
      formData.append("data", JSON.stringify(postData));
      // Seller's community picks from the PickupStep picker (PR 3). Capped to
      // 3 client-side; backend re-validates cap + membership.
      formData.append("communities", selectedCommunityIds.join(","));
      formData.append("visibility", "public");
      formData.append("pickup_location", pickup);

      const res = await apiFetch("/api/listings", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed to post listing");
      await res.json();

      // Cleanup: revoke blob URLs before resetting state.
      for (const img of uploadedImages) URL.revokeObjectURL(img.preview);
      actions.postListingReset();
      onPosted();
      onPublishedDraft?.(currentDraftId);
      setCurrentDraftId(null);
      clearDraftCreatedAt();
    } catch (err) {
      console.error("Post listing failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [productDetails, uploadedImages, isAuthenticated, segmentation, postPickupLocation, selectedCommunityIds, actions, onPosted, onPublishedDraft, currentDraftId, onRequestSignIn, clearDraftCreatedAt]);

  const postBulk = async () => {
    if (bulkItems.length === 0 || uploadedImages.length === 0) return;
    if (!isAuthenticated) { onRequestSignIn(); return; }

    const invalidIdx = bulkItems.findIndex((item) => priceStringToCents(item.price) === null);
    if (invalidIdx !== -1) {
      const offender = bulkItems[invalidIdx];
      alert(`Enter a valid price for "${formatTitle(offender.brand, offender.name)}" before posting.`);
      return;
    }

    actions.setPostingBulk(true);

    try {
      const trimmedBulkDefault = bulkPickupLocation.trim();
      const fallbackPickup = trimmedBulkDefault !== "" ? trimmedBulkDefault : postPickupLocation;

      const results = await Promise.allSettled(
        bulkItems.map(async (item) => {
          const formData = new FormData();
          const draftUrlsForItem = segmentation
            ? item.imageIndices
                .map((i) => segmentation.image_urls[i])
                .filter((url): url is string => typeof url === "string" && url.length > 0)
            : [];
          if (draftUrlsForItem.length > 0) {
            formData.append("draft_urls", JSON.stringify(draftUrlsForItem));
          } else {
            for (const imgIdx of item.imageIndices) {
              if (uploadedImages[imgIdx]) {
                formData.append("images", uploadedImages[imgIdx].file);
              }
            }
          }
          const { imageIndices: _indices, identifierConfidence: _conf, retrieval_fallback: _rf, pickupLocation: _itemPickup, ...rest } = item;
          void _indices; void _conf; void _rf; void _itemPickup;
          const productData = { ...rest, priceCents: priceStringToCents(item.price) as number };
          formData.append("data", JSON.stringify(productData));
          // Bulk items share one community selection from PickupStep.
          formData.append("communities", selectedCommunityIds.join(","));
          formData.append("visibility", "public");
          const itemPickup =
            item.pickupLocation && item.pickupLocation.trim() !== ""
              ? item.pickupLocation
              : fallbackPickup;
          formData.append("pickup_location", itemPickup);

          const res = await apiFetch("/api/listings", { method: "POST", body: formData });
          if (!res.ok) throw new Error(`Failed to post listing: ${formatTitle(item.brand, item.name)}`);
        }),
      );

      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failures.length > 0) {
        const messages = failures
          .map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason)))
          .join("\n");
        throw new Error(messages);
      }

      for (const img of uploadedImages) URL.revokeObjectURL(img.preview);
      actions.postListingReset();
      onPosted();
      onPublishedDraft?.(currentDraftId);
      setCurrentDraftId(null);
      clearDraftCreatedAt();
    } catch (err) {
      console.error("Bulk post failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      actions.setPostingBulk(false);
    }
  };

  const postBulkFromPickup = async () => {
    const trimmedDefault = bulkPickupLocation.trim();
    if (trimmedDefault !== "") {
      actions.setBulkItems(
        bulkItems.map((item) => ({
          ...item,
          pickupLocation:
            item.pickupLocation && item.pickupLocation.trim() !== ""
              ? item.pickupLocation
              : trimmedDefault,
        })),
      );
    }
    await postBulk();
  };

  return { postSingleListing, postBulk, postBulkFromPickup };
}
