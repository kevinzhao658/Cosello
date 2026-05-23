import { ModalShell } from "../../../components/ui/ModalShell";
import { X, Trash2, Loader2 } from "lucide-react";
import { formatTitle } from "../../../lib/format";
import { FOCUS_RING, MODAL_TITLE } from "../constants";

export interface RemoveListingConfirmModalProps {
  open: boolean;
  listing: { id: string; brand: string | null; name: string | null; imageUrl: string | null } | null;
  pendingOrderCount: number;
  isRemoving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function RemoveListingConfirmModal({
  open, listing, pendingOrderCount, isRemoving, onClose, onConfirm,
}: RemoveListingConfirmModalProps) {
  if (!open || !listing) return null;

  const title = formatTitle(listing.brand ?? "", listing.name ?? "");
  const pendingCopy =
    pendingOrderCount > 0
      ? `Confirming will cancel ${pendingOrderCount} pending ${pendingOrderCount === 1 ? "order" : "orders"} and notify the ${pendingOrderCount === 1 ? "buyer" : "buyers"}.`
      : "Any pending offers will be cancelled.";

  return (
    <ModalShell open onClose={isRemoving ? () => undefined : onClose} z={50}>
      <div className="relative bg-canvas border border-hairline rounded-md max-w-sm w-full mx-4 shadow-overlay">
        <button
          onClick={onClose}
          aria-label="Close"
          disabled={isRemoving}
          className={`absolute top-3 right-3 size-9 rounded-full text-muted hover:text-ink hover:bg-surface-soft inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
        >
          <X className="size-5" />
        </button>

        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-10 rounded-full bg-error/10 flex items-center justify-center">
              <Trash2 className="size-5 text-error" />
            </div>
            <h3 className={`text-xl ${MODAL_TITLE}`}>Remove this listing?</h3>
          </div>

          <div className="flex items-center gap-3 mb-4 bg-surface-soft border border-hairline rounded-md p-3">
            {listing.imageUrl ? (
              <img
                src={listing.imageUrl}
                alt=""
                className="size-12 rounded-md object-cover border border-hairline shrink-0"
              />
            ) : (
              <div className="size-12 rounded-md bg-surface-strong border border-hairline shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{title || "Untitled listing"}</p>
            </div>
          </div>

          <p className="text-sm text-body leading-relaxed">
            This will permanently remove the listing from Cosello. {pendingCopy}{" "}
            <span className="font-semibold text-error">This cannot be undone.</span>
          </p>
        </div>

        <div className="border-t border-hairline px-6 py-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isRemoving}
            className={`inline-flex items-center justify-center h-9 px-4 rounded-md border border-border-strong text-sm font-semibold text-ink bg-canvas hover:bg-surface-soft transition-colors disabled:opacity-50 ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRemoving}
            className={`inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md border border-error/40 text-sm font-semibold text-error bg-canvas hover:bg-error/10 hover:text-error transition-colors disabled:opacity-50 ${FOCUS_RING}`}
          >
            {isRemoving ? (
              <Loader2 className="size-4 motion-safe:animate-spin" />
            ) : (
              <>
                <Trash2 className="size-4" />
                Remove
              </>
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
