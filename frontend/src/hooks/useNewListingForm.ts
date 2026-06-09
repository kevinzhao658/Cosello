import { useState, useEffect, useRef, useCallback } from "react";
import type { AuthUser } from "../contexts/AuthContext";
import type { SellWizardHandle } from "../features/sell-wizard/SellWizard";
import type { ProductDetails, BulkPreview } from "../features/sell-wizard/useSellWizard";
import type { CategorySlug } from "../lib/types";
import { NYC_ZIP_SET } from "../lib/nycZips";

type Page = "home" | "market" | "terms" | "signin" | "signup" | "account" | "help" | "mission" | "newlisting";

interface UseNewListingFormDeps {
  sellWizardRef: React.RefObject<SellWizardHandle | null>;
  isAuthenticated: boolean;
  user: AuthUser | null;
  page: Page;
  onRequireSignIn: () => void;
  onRequireAiConfirm: () => void;
}

export function useNewListingForm({
  sellWizardRef,
  isAuthenticated,
  user,
  page,
  onRequireSignIn,
  onRequireAiConfirm,
}: UseNewListingFormDeps) {
  // AI-surfaced state — mirrors wizard-internal values for the preview column.
  // The wizard fires onPhaseChange / onImagesChange / onProductDetailsChange /
  // onCoverImageChange / onBulkPreviewChange; App.tsx forwards those callbacks
  // down to SellWizard as props.
  const [wizardPhase, setWizardPhase] = useState<"review" | "reason" | "cards" | "pickup" | null>(null);
  const [imageCount, setImageCount] = useState(0);
  const [aiProductDetails, setAiProductDetails] = useState<ProductDetails | null>(null);
  const [aiCoverImageUrl, setAiCoverImageUrl] = useState<string | null>(null);
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [checklistSignals, setChecklistSignals] = useState({ communitySelected: false, pickupLocationSet: false });

  // New Listing page state (R-4.1). Mode toggles between the existing AI wizard
  // flow and a blank-form manual flow. Manual form fields live here so the page
  // owns the publish payload; the wizard owns the photo state and the publish
  // network call (called via the imperative handle after seeding productDetails).
  const [mode, setMode] = useState<"ai" | "manual">("ai");

  // User-supplied draft name, edited via the "New listing" heading on the page.
  // Lives here (App owns both the heading and the wizard) and threads into the
  // wizard's autosave as Draft.name. Empty string = unnamed (heading shows a
  // placeholder; gallery falls back to an item-count label).
  const [draftName, setDraftName] = useState("");

  // Below lg: the preview/checklist column collapses into a floating overlay
  // that the user opens via a jade circle button — keeps mid-flow vertical
  // space clear and stops the preview from pushing the form below the fold.
  const [overlayOpen, setOverlayOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState<string>("Good");
  const [category, setCategory] = useState<CategorySlug>("other");
  const [pickup, setPickup] = useState("");
  /** Required NYC ZIP for the manual listing's pickup step. */
  const [pickupZip, setPickupZip] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [categoryAttributes, setCategoryAttributes] = useState<Record<string, string>>({});
  const [isPublishing, setIsPublishing] = useState(false);

  // Reset the New Listing form back to defaults — called after a successful
  // publish so a follow-up listing starts blank.
  const reset = useCallback(() => {
    setMode("ai");
    setDraftName("");
    setBrand("");
    setName("");
    setDescription("");
    setPrice("");
    setCondition("Good");
    setCategory("other");
    setPickup("");
    setPickupZip("");
    setTags([]);
    setTagInput("");
    setCategoryAttributes({});
    setImageCount(0);
    setAiProductDetails(null);
    setAiCoverImageUrl(null);
    setChecklistSignals({ communitySelected: false, pickupLocationSet: false });
  }, []);

  // Manual-mode publish. Seeds the wizard's productDetails from the page-level
  // form fields, then calls the wizard's existing single-publish handler (which
  // already wires images + categories + pickup + auth gates correctly).
  const publish = useCallback(async () => {
    if (!isAuthenticated) {
      onRequireSignIn();
      return;
    }
    if (mode === "ai") {
      // AI mode publish happens via the wizard's own flow — Publish in the
      // page toolbar is disabled until the wizard has produced a productDetails
      // (single) or bulkItems (multi). For single, we route through the same
      // confirm modal the home flow uses.
      onRequireAiConfirm();
      return;
    }
    if (imageCount === 0) {
      alert("Add at least one photo before publishing.");
      return;
    }
    const priceNumber = Number.parseInt(price, 10);
    if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
      alert("Enter a valid price before publishing.");
      return;
    }
    if (!brand.trim() && !name.trim()) {
      alert("Add a brand or item name before publishing.");
      return;
    }
    // Resolve zip: prefer explicit selection, then profile ZIP if valid.
    const resolvedZip =
      pickupZip !== ""
        ? pickupZip
        : user?.zip_code && NYC_ZIP_SET.has(user.zip_code)
          ? user.zip_code
          : "";
    if (!resolvedZip) {
      alert("Select a pickup ZIP code before publishing.");
      return;
    }
    const wizard = sellWizardRef.current;
    if (!wizard) return;

    setIsPublishing(true);
    try {
      const details = {
        brand: brand.trim(),
        name: name.trim(),
        description: description.trim(),
        price: price,
        condition: condition,
        location: user?.neighborhood || "",
        tags: tags,
        category: category,
        categoryAttributes: categoryAttributes,
        identifierConfidence: "high" as const,
        retrieval_fallback: false,
      };
      const pickupLocation = pickup.trim() || user?.pickup_address || "";
      await wizard.postSingleListing({ details, pickupLocation, pickupZip: resolvedZip });
      reset();
    } finally {
      setIsPublishing(false);
    }
  }, [
    isAuthenticated,
    mode,
    imageCount,
    brand,
    name,
    description,
    price,
    condition,
    category,
    categoryAttributes,
    pickup,
    pickupZip,
    tags,
    user,
    sellWizardRef,
    reset,
    onRequireSignIn,
    onRequireAiConfirm,
  ]);

  // Preview overlay (New Listing, below lg:) — ESC closes, focus moves to the
  // close button on open and back to the toggle on close. Effect short-circuits
  // when the overlay isn't open so the listeners don't sit live on other pages.
  useEffect(() => {
    if (!overlayOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOverlayOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    const focusFrame = requestAnimationFrame(() => {
      closeRef.current?.focus();
    });
    return () => {
      window.removeEventListener("keydown", handleKey);
      cancelAnimationFrame(focusFrame);
      toggleRef.current?.focus();
    };
  }, [overlayOpen]);

  // Auto-close the preview overlay when leaving the New Listing page so it
  // doesn't reopen with stale state next time the user lands there.
  useEffect(() => {
    if (page !== "newlisting" && overlayOpen) setOverlayOpen(false);
  }, [page, overlayOpen]);

  return {
    // Mode
    mode,
    setMode,
    // Draft name
    draftName,
    setDraftName,
    // Manual form fields
    brand,
    setBrand,
    name,
    setName,
    description,
    setDescription,
    price,
    setPrice,
    condition,
    setCondition,
    category,
    setCategory,
    pickup,
    setPickup,
    pickupZip,
    setPickupZip,
    tags,
    setTags,
    tagInput,
    setTagInput,
    categoryAttributes,
    setCategoryAttributes,
    // Publish state
    isPublishing,
    // AI-surfaced wizard mirrors
    wizardPhase,
    setWizardPhase,
    imageCount,
    setImageCount,
    aiProductDetails,
    setAiProductDetails,
    aiCoverImageUrl,
    setAiCoverImageUrl,
    bulkPreview,
    setBulkPreview,
    // Checklist signals from wizard (community + pickup)
    checklistSignals,
    setChecklistSignals,
    // Preview overlay
    overlayOpen,
    setOverlayOpen,
    toggleRef,
    closeRef,
    // Handlers
    reset,
    publish,
  };
}
