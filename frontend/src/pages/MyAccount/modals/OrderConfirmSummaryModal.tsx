import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { X, Check, MapPin } from "lucide-react";
import { formatTitle } from "../../../lib/format";
import type { MyListing, OrderData } from "../../../lib/types";
import { FOCUS_RING, MODAL_TITLE } from "../constants";

export interface ConfirmSummaryData {
  listing: MyListing;
  buyerName: string;
  slot: { date: string; time: string };
  role: "seller" | "buyer";
  confirmedTime?: string;
  pickupAddress?: string | null;
  order: OrderData;
}

export interface OrderConfirmSummaryModalProps {
  open: boolean;
  data: ConfirmSummaryData | null;
  countdownExpired: boolean;
  onClose: () => void;
  onConfirmPickup: () => void;
  onDone: () => void;
}

export function OrderConfirmSummaryModal({
  open, data, countdownExpired, onClose, onConfirmPickup, onDone,
}: OrderConfirmSummaryModalProps) {
  if (!open || !data) return null;

  const hasReviewed = data.role === "buyer" ? data.order.buyer_reviewed : data.order.seller_reviewed;
  const showConfirmPickupButton = countdownExpired && !hasReviewed;

  return (
    <ModalShell open onClose={onClose} z={50}>
      <div className="relative bg-canvas border border-hairline rounded-md max-w-sm w-full mx-4 shadow-overlay">
        <button
          onClick={onClose}
          aria-label="Close"
          className={`absolute top-3 right-3 size-9 rounded-full text-muted hover:text-ink hover:bg-surface-soft inline-flex items-center justify-center ${FOCUS_RING}`}
        >
          <X className="size-5" />
        </button>

        <div className="px-6 pt-6 pb-4">
          <div className="text-center mb-5">
            <div className="size-12 rounded-full bg-primary-soft flex items-center justify-center mx-auto mb-3">
              <Check className="size-6 text-primary" />
            </div>
            <h3 className={`text-xl ${MODAL_TITLE}`}>
              {data.role === "seller" ? "Pickup Confirmed!" : "Order Confirmed!"}
            </h3>
            <p className="text-sm text-muted mt-1">
              {data.role === "seller" ? "The buyer has been notified" : "Your pickup is scheduled"}
            </p>
          </div>

          <div className="bg-surface-card border border-hairline rounded-md p-4 space-y-3">
            <div className="flex items-center gap-3">
              <img
                src={data.listing.imageUrl}
                alt={formatTitle(data.listing.brand, data.listing.name)}
                className="size-12 rounded-md object-cover border border-hairline shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{formatTitle(data.listing.brand, data.listing.name)}</p>
                <p className="text-sm text-primary font-semibold">${data.listing.price}</p>
              </div>
            </div>

            <div className="border-t border-hairline pt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted">{data.role === "seller" ? "Buyer" : "Seller"}</span>
                <span className="text-ink">{data.buyerName}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Pickup Date</span>
                <span className="text-ink">
                  {data.slot.date
                    ? new Date(data.slot.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Pickup Window</span>
                <span className="text-ink">
                  {({ morning: "8 AM – 12 PM", afternoon: "12 – 5 PM", evening: "5 – 9 PM" } as Record<string, string>)[data.slot.time] || data.slot.time || "—"}
                </span>
              </div>
              {data.confirmedTime && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Pickup Time</span>
                  <span className="text-primary font-semibold">{data.confirmedTime}</span>
                </div>
              )}
              {data.pickupAddress && (
                <div className="flex justify-between text-xs gap-2">
                  <span className="text-muted shrink-0">Pickup Location</span>
                  <a
                    href={`https://maps.apple.com/?q=${encodeURIComponent(data.pickupAddress)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-primary hover:text-primary-hover underline underline-offset-2 transition-colors flex items-center gap-1 truncate rounded-sm ${FOCUS_RING}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">{data.pickupAddress}</span>
                  </a>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-muted">Status</span>
                <span className="text-primary font-semibold">Confirmed</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-hairline px-6 py-4 flex items-center justify-end gap-2">
          {showConfirmPickupButton ? (
            <Button onClick={onConfirmPickup} size="sm">
              Confirm Pickup
            </Button>
          ) : (
            <Button onClick={onDone} size="sm">
              Done
            </Button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
