// Seller-side pending-order picker — lifted out of MyAccountPage in R-5.7.3
// so the `purchase` notification can open it in place from any page instead
// of routing through /account.
//
// The component is intentionally self-contained: it owns slot selection,
// confirm-time, and the two action handlers (confirm + decline). Refetch
// hooks (myListings / mySellerOrders / punchlist) live in MyAccountPage and
// are surfaced through OrderModalsContext's `fireAfterAction`, which the
// MyAccountPage `subscribeAfterAction` effect already subscribes to. When a
// user opens the modal while NOT on the account page no refetch fires —
// that's fine because the data isn't on screen anyway and refetches happen
// naturally when MyAccount mounts.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, User, X } from "lucide-react";
import { ModalShell } from "../../components/ui/ModalShell";
import { ListingImage } from "../../components/ui/ListingImage";
import { apiFetch } from "../../lib/api";
import { formatTitle } from "../../lib/format";
import { buildSlotTarget, parseSlotEndHour } from "../../lib/pickupTime";
import { FOCUS_RING } from "../../pages/MyAccount/constants";
import type { MyListing, OrderData } from "../../lib/types";
import type { ConfirmSummaryData } from "../../pages/MyAccount/modals/OrderConfirmSummaryModal";

const TIME_LABELS: Record<string, string> = {
  morning: "8 AM – 12 PM",
  afternoon: "12 – 5 PM",
  evening: "5 – 9 PM",
};

function isSlotExpired(slot: { date: string; time: string }): boolean {
  const endHour = parseSlotEndHour(slot.time) ?? 18;
  const slotEnd = buildSlotTarget(slot.date, endHour);
  return new Date() > slotEnd;
}

function generateTimeOptions(timeWindow: string): string[] {
  const parseHour = (s: string): number => {
    const m = s.trim().match(/^(\d{1,2})\s*(AM|PM)$/i);
    if (!m) return 0;
    let h = parseInt(m[1]);
    if (m[2].toUpperCase() === "PM" && h !== 12) h += 12;
    if (m[2].toUpperCase() === "AM" && h === 12) h = 0;
    return h;
  };
  const label = TIME_LABELS[timeWindow] || timeWindow;
  const parts = label.split("–").map((s) => s.trim());
  if (parts.length !== 2) return [];
  const startH = parseHour(parts[0]);
  const endH = parseHour(parts[1]);
  const options: string[] = [];
  for (let h = startH; h < endH; h++) {
    for (const m of [0, 30]) {
      const hour = h % 12 || 12;
      const ampm = h >= 12 ? "PM" : "AM";
      options.push(`${hour}:${m.toString().padStart(2, "0")} ${ampm}`);
    }
  }
  const endHour = endH % 12 || 12;
  const endAmpm = endH >= 12 ? "PM" : "AM";
  options.push(`${endHour}:00 ${endAmpm}`);
  return options;
}

type OrderManagementModalProps = {
  open: boolean;
  listing: MyListing | null;
  onClose: () => void;
  onConfirmedSummary: (data: ConfirmSummaryData) => void;
  onAfterAction: () => void;
  onViewUser?: (userId: string) => void;
  onListingSold?: (listing: MyListing) => void;
};

export function OrderManagementModal({
  open,
  listing,
  onClose,
  onConfirmedSummary,
  onAfterAction,
  onViewUser,
  onListingSold,
}: OrderManagementModalProps) {
  const [listingOrders, setListingOrders] = useState<OrderData[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [confirmingOrderId, setConfirmingOrderId] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ orderId: number; slot: { date: string; time: string }; order: OrderData } | null>(null);
  const [confirmTime, setConfirmTime] = useState("");
  const [decliningOrderId, setDecliningOrderId] = useState<number | null>(null);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState<number | null>(null);

  const listingId = listing?.id ?? null;

  // Reset transient state on close/open transition + fetch pending orders for
  // the just-opened listing.
  useEffect(() => {
    if (!open || !listingId) {
      setSelectedSlot(null);
      setConfirmTime("");
      setShowDeclineConfirm(null);
      return;
    }
    let cancelled = false;
    setIsLoadingOrders(true);
    setListingOrders([]);
    (async () => {
      try {
        const res = await apiFetch("/api/orders");
        if (!res.ok) return;
        const allOrders: OrderData[] = await res.json();
        if (cancelled) return;
        setListingOrders(
          allOrders.filter((o) => o.listing_id === listingId && o.role === "seller" && o.status === "pending"),
        );
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsLoadingOrders(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, listingId]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDeclineOrder = useCallback(async (orderId: number) => {
    setDecliningOrderId(orderId);
    try {
      const res = await apiFetch(`/api/orders/${orderId}/decline`, { method: "POST" });
      if (res.ok) {
        setListingOrders((prev) => prev.filter((o) => o.id !== orderId));
        setShowDeclineConfirm(null);
        onAfterAction();
      }
    } catch {
      // ignore
    } finally {
      setDecliningOrderId(null);
    }
  }, [onAfterAction]);

  const handleConfirmSlot = useCallback(async (orderId: number, slot: { date: string; time: string }, order: OrderData, confirmedTime: string) => {
    if (!listing) return;
    setConfirmingOrderId(orderId);
    try {
      const res = await apiFetch(`/api/orders/${orderId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed_slot: slot, confirmed_time: confirmedTime }),
      });
      if (res.ok) {
        onClose();
        setSelectedSlot(null);
        setConfirmTime("");
        onConfirmedSummary({
          listing,
          buyerName: order.buyer_name,
          slot,
          role: "seller",
          confirmedTime,
          order,
        });
        onListingSold?.(listing);
        onAfterAction();
      }
    } catch {
      // ignore
    } finally {
      setConfirmingOrderId(null);
    }
  }, [listing, onClose, onConfirmedSummary, onAfterAction, onListingSold]);

  const showModal = open && !!listing;

  const headerTitle = useMemo(() => (listing ? formatTitle(listing.brand, listing.name) : ""), [listing]);

  if (!showModal || !listing) return null;

  return (
    <ModalShell open onClose={handleClose} z={50}>
      <div className="relative border border-hairline rounded-md p-6 max-w-md w-full mx-4 shadow-overlay max-h-[85vh] overflow-y-auto bg-canvas">
        <button
          onClick={handleClose}
          className={`absolute top-4 right-4 text-muted hover:text-ink transition-colors ${FOCUS_RING} rounded`}
          aria-label="Close"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <ListingImage
            src={listing.imageUrl}
            alt={headerTitle}
            size="modalPreview"
            className="size-12 rounded-md object-cover border border-hairline shrink-0"
          />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink truncate">{headerTitle}</h3>
            <p className="text-xs text-primary font-semibold">${listing.price}</p>
          </div>
        </div>

        <p className="text-[10px] text-muted mb-3">Pending orders</p>

        {isLoadingOrders ? (
          <div className="py-8 text-center"><Loader2 className="size-5 animate-spin mx-auto text-primary" /></div>
        ) : listingOrders.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-muted">No pending orders</p>
          </div>
        ) : (
          <div className="space-y-4">
            {listingOrders.map((order) => {
              const isSelected = selectedSlot?.orderId === order.id;
              return (
                <div key={order.id} className="bg-surface-soft border border-hairline rounded-md p-4">
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={() => onViewUser?.(order.buyer_id)}
                      className={`flex items-center gap-2.5 hover:opacity-80 transition-opacity ${FOCUS_RING} rounded`}
                    >
                      <div className="size-8 rounded-full bg-canvas border border-hairline flex items-center justify-center overflow-hidden shrink-0">
                        {order.buyer_picture ? <img src={order.buyer_picture} alt="" className="size-full object-cover" /> : <User className="size-3.5 text-muted" />}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-ink">{order.buyer_name}</p>
                        {order.created_at && (
                          <p className="text-[11px] text-muted mt-0.5">
                            {new Date(order.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      {showDeclineConfirm !== order.id && (
                        <button
                          onClick={() => setShowDeclineConfirm(order.id)}
                          className={`text-[11px] text-error hover:underline ${FOCUS_RING} rounded`}
                        >
                          Decline
                        </button>
                      )}
                      <span className="text-[10px] text-primary bg-primary-soft px-2 py-0.5 rounded-full border border-primary/20">Pending</span>
                    </div>
                  </div>

                  {showDeclineConfirm === order.id ? (
                    <div className="bg-error/5 border border-error/20 rounded-md p-3">
                      <p className="text-xs text-body mb-3">Decline this order?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowDeclineConfirm(null)}
                          className={`flex-1 text-xs h-8 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft ${FOCUS_RING}`}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDeclineOrder(order.id)}
                          disabled={decliningOrderId === order.id}
                          className={`flex-1 text-xs h-8 rounded-md bg-error text-on-primary font-semibold hover:bg-error/90 disabled:opacity-50 ${FOCUS_RING}`}
                        >
                          {decliningOrderId === order.id ? <Loader2 className="size-3 animate-spin mx-auto" /> : "Decline"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[10px] text-muted mb-2">Select pickup window</p>
                      <div className="space-y-1.5">
                        {order.selected_pickup_slots.map((slot, i) => {
                          const dateStr = new Date(slot.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                          const isThisSelected = isSelected && selectedSlot.slot.date === slot.date && selectedSlot.slot.time === slot.time;
                          const expired = isSlotExpired(slot);
                          return (
                            <button
                              key={i}
                              onClick={() => {
                                if (expired) return;
                                if (isThisSelected) {
                                  setSelectedSlot(null);
                                  setConfirmTime("");
                                } else {
                                  setSelectedSlot({ orderId: order.id, slot, order });
                                  setConfirmTime("");
                                }
                              }}
                              disabled={expired}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-left transition-colors ${FOCUS_RING} ${
                                expired
                                  ? "border-hairline-soft bg-surface-soft opacity-50 cursor-not-allowed"
                                  : isThisSelected
                                    ? "border-primary bg-primary-soft"
                                    : "border-hairline bg-canvas hover:border-primary hover:bg-primary-soft/50"
                              }`}
                            >
                              <div>
                                <p className={`text-xs ${expired ? "text-muted line-through" : "text-ink"}`}>{dateStr}</p>
                                <p className={`text-[11px] ${expired ? "text-muted-soft" : "text-muted"}`}>{TIME_LABELS[slot.time] || slot.time}</p>
                              </div>
                              {expired ? (
                                <span className="text-[10px] text-muted italic">Expired</span>
                              ) : (
                                <div className={`size-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isThisSelected ? "border-primary bg-primary" : "border-border-strong"}`}>
                                  {isThisSelected && <Check className="size-2.5 text-on-primary" />}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {isSelected && (() => {
                        const timeOptions = generateTimeOptions(selectedSlot.slot.time);
                        const slotDateStr = new Date(selectedSlot.slot.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                        return (
                          <div className="mt-3 pt-3 border-t border-hairline">
                            <p className="text-[10px] text-muted mb-2">Choose exact pickup time</p>
                            <p className="text-xs text-muted mb-2">{slotDateStr} — {TIME_LABELS[selectedSlot.slot.time] || selectedSlot.slot.time}</p>
                            <select
                              value={confirmTime}
                              onChange={(e) => setConfirmTime(e.target.value)}
                              className={`w-full px-3 py-2 rounded-md bg-canvas border border-hairline text-sm text-ink ${FOCUS_RING} mb-3`}
                            >
                              <option value="">Select a time…</option>
                              {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <button
                              onClick={() => handleConfirmSlot(selectedSlot.orderId, selectedSlot.slot, selectedSlot.order, confirmTime)}
                              disabled={!confirmTime || confirmingOrderId === order.id}
                              className={`w-full h-9 rounded-md text-sm font-semibold bg-primary text-on-primary hover:bg-primary-hover transition-colors disabled:opacity-50 ${FOCUS_RING}`}
                            >
                              {confirmingOrderId === order.id ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Confirm pickup"}
                            </button>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
