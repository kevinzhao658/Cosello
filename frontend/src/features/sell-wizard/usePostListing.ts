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
  /** Required NYC ZIP for the single-listing pickup step (legacy path). */
  postPickupZip: string;
  /** Required NYC ZIP shared across all bulk items (legacy path). */
  bulkPickupZip: string;
  /** Map pin coords — when set, sent to backend instead of zip-derived coords. */
  pickupPin: { lat: number; lng: number } | null;
  /** Seller-chosen circle radius (0.1–0.4 mi). */
  pickupRadiusMi: number;
  /** Label from the selected autocomplete suggestion (stored as pickup_location). */
  pickupLabel: string;
  onPosted: () => void;
  onPublishedDraft?: (draftId: string | null) => void | Promise<void>;
  onRequestSignIn: () => void;
  clearDraftCreatedAt: () => void;
}

export interface UsePostListingReturn {
  postSingleListing: (override?: { details: ProductDetails; pickupLocation: string; pickupZip: string }) => Promise<void>;
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
  postPickupZip,
  bulkPickupZip,
  pickupPin,
  pickupRadiusMi,
  pickupLabel,
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

  const postSingleListing = useCallback(async (override?: { details: ProductDetails; pickupLocation: string; pickupZip: string }) => {
    // Override path lets the New Listing page publish in Manual mode without
    // waiting for setProductDetails to flush through React state.
    const details = override?.details ?? productDetails;
    const pickup = override?.pickupLocation ?? postPickupLocation;
    const zip = override?.pickupZip ?? postPickupZip;
    if (!details || uploadedImages.length === 0) return;
    if (!isAuthenticated) { onRequestSignIn(); return; }
    // Relax: pin path doesn't need a client ZIP (server derives it via reverse geocode).
    if (!zip && !pickupPin) { alert("Set a pickup location before posting."); return; }

    const priceCents = priceStringToCents(details.price);
    if (priceCents === null) { alert("Enter a valid price before posting."); return; }

    try {
      const formData = new FormData();
      // Build an ordered manifest so that photos added (or reordered) during
      // single review are included and the cover is always uploadedImages[0].
      // segmentation.image_urls is aligned index-wise with uploadedImages:
      //   a non-empty string → draft URL (already on server)
      //   "" / undefined     → added photo with no server URL → upload it
      const draftUrls: string[] = [];
      const orderedImages: File[] = [];
      const imageOrder: string[] = [];
      uploadedImages.forEach((img, i) => {
        const url = segmentation?.image_urls?.[i];
        if (typeof url === "string" && url.length > 0) {
          imageOrder.push(`draft:${draftUrls.length}`);
          draftUrls.push(url);
        } else {
          imageOrder.push(`upload:${orderedImages.length}`);
          orderedImages.push(img.file);
        }
      });
      if (draftUrls.length > 0) {
        formData.append("draft_urls", JSON.stringify(draftUrls));
      }
      for (const file of orderedImages) {
        formData.append("images", file);
      }
      formData.append("image_order", JSON.stringify(imageOrder));
      const { identifierConfidence: _, retrieval_fallback: _rf, ...rest } = details;
      void _; void _rf;
      const postData = { ...rest, priceCents };
      formData.append("data", JSON.stringify(postData));
      // Seller's community picks from the PickupStep picker (PR 3). Capped to
      // 3 client-side; backend re-validates cap + membership.
      formData.append("communities", selectedCommunityIds.join(","));
      formData.append("visibility", "public");
      // Pin path: use the selected label as pickup_location; fallback to legacy pickup.
      formData.append("pickup_location", pickupPin ? (pickupLabel || pickup) : pickup);
      formData.append("pickup_zip", zip);
      if (pickupPin) {
        formData.append("latitude", String(pickupPin.lat));
        formData.append("longitude", String(pickupPin.lng));
        formData.append("map_radius_mi", String(pickupRadiusMi));
      }

      const res = await apiFetch("/api/listings", { method: "POST", body: formData });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ detail: "Failed to post listing" }));
        throw new Error(typeof errBody.detail === "string" ? errBody.detail : "Failed to post listing");
      }
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
  }, [productDetails, uploadedImages, isAuthenticated, segmentation, postPickupLocation, postPickupZip, pickupPin, pickupRadiusMi, pickupLabel, selectedCommunityIds, actions, onPosted, onPublishedDraft, currentDraftId, onRequestSignIn, clearDraftCreatedAt]);

  const postBulk = async () => {
    if (bulkItems.length === 0 || uploadedImages.length === 0) return;
    if (!isAuthenticated) { onRequestSignIn(); return; }
    // Relax: pin path doesn't need a client ZIP (server derives it via reverse geocode).
    if (!bulkPickupZip && !pickupPin) { alert("Set a pickup location before posting."); return; }

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
          const draftUrls: string[] = [];
          const orderedImages: File[] = [];
          const imageOrder: string[] = [];
          for (const imgIdx of item.imageIndices) {
            const url = segmentation?.image_urls?.[imgIdx];
            if (typeof url === "string" && url.length > 0) {
              imageOrder.push(`draft:${draftUrls.length}`);
              draftUrls.push(url);
            } else {
              const file = uploadedImages[imgIdx]?.file;
              if (!file) continue; // missing image — skip; never emit a token for it
              imageOrder.push(`upload:${orderedImages.length}`);
              orderedImages.push(file);
            }
          }
          if (draftUrls.length > 0) formData.append("draft_urls", JSON.stringify(draftUrls));
          for (const file of orderedImages) formData.append("images", file);
          formData.append("image_order", JSON.stringify(imageOrder));
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
          // Pin path: use selected label as pickup_location fallback.
          formData.append("pickup_location", pickupPin ? (pickupLabel || itemPickup) : itemPickup);
          // Shared ZIP for the whole batch — backend requires this field.
          formData.append("pickup_zip", bulkPickupZip);
          if (pickupPin) {
            formData.append("latitude", String(pickupPin.lat));
            formData.append("longitude", String(pickupPin.lng));
            formData.append("map_radius_mi", String(pickupRadiusMi));
          }

          const res = await apiFetch("/api/listings", { method: "POST", body: formData });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({ detail: `Failed to post listing: ${formatTitle(item.brand, item.name)}` }));
            throw new Error(typeof errBody.detail === "string" ? errBody.detail : `Failed to post listing: ${formatTitle(item.brand, item.name)}`);
          }
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
