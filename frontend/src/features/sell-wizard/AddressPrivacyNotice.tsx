import { ShieldCheck } from "lucide-react";

/**
 * Attention callout for the pickup step: Cosello's address-privacy
 * commitment, stated in the third person. Renders directly beneath the typed
 * step prompt (and above the listing thumbnails in the bulk flow).
 */
export function AddressPrivacyNotice() {
  return (
    <div className="mt-3 flex justify-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary-soft px-3.5 py-1.5">
        <ShieldCheck className="size-4 text-primary shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-ink">
          Cosello never discloses a seller's address without their explicit consent.
        </span>
      </div>
    </div>
  );
}
