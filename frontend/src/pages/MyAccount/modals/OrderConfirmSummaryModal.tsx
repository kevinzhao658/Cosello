import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { X, Check, MapPin } from "lucide-react";
import { formatTitle } from "../../../lib/format";
import type { MyListing } from "../../../lib/types";

export interface OrderConfirmSummaryOrder {
  buyer_reviewed: boolean;
  seller_reviewed: boolean;
}

export interface ConfirmSummaryData {
  listing: MyListing;
  buyerName: string;
  slot: { date: string; time: string };
  role: "seller" | "buyer";
  confirmedTime?: string;
  pickupAddress?: string | null;
  order: OrderConfirmSummaryOrder;
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
      <div className="relative border border-white/15 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
        >
          <X className="size-5" />
        </button>

        <div className="text-center mb-5">
          <div className="size-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
            <Check className="size-6 text-green-400" />
          </div>
          <h3 className="text-sm font-medium">
            {data.role === "seller" ? "Pickup Confirmed!" : "Order Confirmed!"}
          </h3>
          <p className="text-[10px] text-white/40 mt-1">
            {data.role === "seller" ? "The buyer has been notified" : "Your pickup is scheduled"}
          </p>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={data.listing.imageUrl}
              alt={formatTitle(data.listing.brand, data.listing.name)}
              className="size-12 rounded-lg object-cover border border-white/10 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{formatTitle(data.listing.brand, data.listing.name)}</p>
              <p className="text-sm text-fuchsia-400 font-medium">${data.listing.price}</p>
            </div>
          </div>

          <div className="border-t border-white/5 pt-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-white/40">{data.role === "seller" ? "Buyer" : "Seller"}</span>
              <span className="text-white/80">{data.buyerName}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Pickup Date</span>
              <span className="text-white/80">
                {data.slot.date
                  ? new Date(data.slot.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Pickup Window</span>
              <span className="text-white/80">
                {({ morning: "8 AM – 12 PM", afternoon: "12 – 5 PM", evening: "5 – 9 PM" } as Record<string, string>)[data.slot.time] || data.slot.time || "—"}
              </span>
            </div>
            {data.confirmedTime && (
              <div className="flex justify-between text-xs">
                <span className="text-white/40">Pickup Time</span>
                <span className="text-green-400 font-medium">{data.confirmedTime}</span>
              </div>
            )}
            {data.pickupAddress && (
              <div className="flex justify-between text-xs">
                <span className="text-white/40">Pickup Location</span>
                <a
                  href={`https://maps.apple.com/?q=${encodeURIComponent(data.pickupAddress)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MapPin className="size-3" />
                  {data.pickupAddress}
                </a>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-white/40">Status</span>
              <span className="text-green-400 font-medium">Confirmed</span>
            </div>
          </div>
        </div>

        {showConfirmPickupButton ? (
          <Button
            onClick={onConfirmPickup}
            className="w-full mt-4 bg-green-500/20 hover:bg-green-500/30 border border-green-400/20 text-green-400 text-xs"
            size="sm"
          >
            Confirm Pickup
          </Button>
        ) : (
          <Button
            onClick={onDone}
            className="w-full mt-4 bg-fuchsia-500 hover:bg-fuchsia-600 border-0 text-white text-xs"
            size="sm"
          >
            Done
          </Button>
        )}
      </div>
    </ModalShell>
  );
}
