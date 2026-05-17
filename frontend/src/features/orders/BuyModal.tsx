import { useEffect, useState } from "react";
import { X, Check, Plus, Loader2, ExternalLink } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ModalShell } from "../../components/ui/ModalShell";
import { apiFetch } from "../../lib/api";
import { formatTitle } from "../../lib/format";
import { parseHourPeriod } from "../../lib/pickupTime";
import type { Listing } from "../../lib/types";

type PickupSelections = Record<string, { slots: { from: number; to: number }[]; dayLabel: string }>;

export type EditingOrderSeed = {
  id: number;
  existingSlots: { date: string; time: string }[];
};

type BuyModalProps = {
  open: boolean;
  onClose: () => void;
  listing: Listing | null;
  editingOrder: EditingOrderSeed | null;
  onConfirmed: (orderId: number, listing: Listing) => void;
  onUpdated: () => void;
  onNavigateToTerms: () => void;
};

const formatHour = (h: number) => h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`;

function computeAvailablePickupDays(listing: Listing) {
  const now = new Date();
  const postedAt = new Date(listing.postedAt * 1000);
  const expiresAt = new Date(postedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const days: { date: string; dayLabel: string }[] = [];
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  const todayStr = startDate.toISOString().split("T")[0];
  const currentHour = now.getHours();
  for (let d = new Date(startDate); d <= expiresAt; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    if (dateStr === todayStr && currentHour >= 20) continue;
    const dayLabel = dateStr === todayStr
      ? "Today"
      : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    days.push({ date: dateStr, dayLabel });
  }
  return days;
}

function seedSelectionsFromExisting(existingSlots: { date: string; time: string }[]): PickupSelections {
  const selections: PickupSelections = {};
  for (const slot of existingSlots) {
    const parts = slot.time.split("–").map((s: string) => s.trim());
    if (parts.length === 2) {
      if (!selections[slot.date]) {
        selections[slot.date] = { slots: [], dayLabel: slot.date };
      }
      selections[slot.date].slots.push({
        from: parseHourPeriod(parts[0]) ?? 10,
        to: parseHourPeriod(parts[1]) ?? 10,
      });
    }
  }
  return selections;
}

export function BuyModal({
  open,
  onClose,
  listing,
  editingOrder,
  onConfirmed,
  onUpdated,
  onNavigateToTerms,
}: BuyModalProps) {
  const [pickupDaySelections, setPickupDaySelections] = useState<PickupSelections>({});
  const [buyTosAgreed, setBuyTosAgreed] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  const editingOrderId = editingOrder?.id ?? null;

  // Seed selection state whenever the modal opens. Edit mode pre-fills from
  // the existing order; new-purchase mode resets to a clean slate.
  useEffect(() => {
    if (!open) return;
    if (editingOrder) {
      setPickupDaySelections(seedSelectionsFromExisting(editingOrder.existingSlots));
      setBuyTosAgreed(true);
    } else {
      setPickupDaySelections({});
      setBuyTosAgreed(false);
    }
  }, [open, editingOrder]);

  const handleClose = () => {
    setPickupDaySelections({});
    setBuyTosAgreed(false);
    onClose();
  };

  const handleConfirmPurchase = async () => {
    const dayEntries = Object.entries(pickupDaySelections);
    if (!listing || dayEntries.length === 0) return;
    setIsSubmittingOrder(true);
    try {
      const slots = dayEntries.flatMap(([date, { slots: timeSlots }]) =>
        timeSlots.map(({ from, to }) => ({
          date,
          time: `${formatHour(from)} – ${formatHour(to)}`,
        }))
      );
      const res = await apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: listing.id,
          selected_pickup_slots: slots,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to create order" }));
        throw new Error(err.detail || "Failed to create order");
      }
      const orderData = await res.json();
      onConfirmed(orderData.id, listing);
      setPickupDaySelections({});
      setBuyTosAgreed(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleUpdatePickupSlots = async () => {
    const dayEntries = Object.entries(pickupDaySelections);
    if (!editingOrderId || dayEntries.length === 0) return;
    setIsSubmittingOrder(true);
    try {
      const slots = dayEntries.flatMap(([date, { slots: timeSlots }]) =>
        timeSlots.map(({ from, to }) => ({
          date,
          time: `${formatHour(from)} – ${formatHour(to)}`,
        }))
      );
      const res = await apiFetch(`/api/orders/${editingOrderId}/update-slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_pickup_slots: slots }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to update" }));
        throw new Error(err.detail || "Failed to update pickup windows");
      }
      onUpdated();
      setPickupDaySelections({});
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  if (!open || !listing) return null;

  return (
    <ModalShell open onClose={handleClose} z={250}>
      <div
        className="relative w-full max-w-md mx-4 rounded-lg border border-white/15 shadow-xl overflow-hidden max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "#18181b" }}
      >
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 size-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <X className="size-3.5 text-white/60" />
        </button>

        <div className="p-5">
          <h3 className="text-lg font-medium mb-4">{editingOrderId ? "Update Pickup Windows" : "Confirm Purchase"}</h3>

          {/* Listing Summary */}
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10 mb-5">
            <img
              src={listing.imageUrl}
              alt={formatTitle(listing.brand, listing.name)}
              className="size-20 max-w-[400px] max-h-[40vh] rounded-lg object-contain border border-white/10 bg-black/30 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{formatTitle(listing.brand, listing.name)}</p>
              <p className="text-lg font-semibold text-fuchsia-400">${listing.price}</p>
            </div>
          </div>

          {/* Pickup Availability */}
          <div className="mb-5">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">When can you pick up?</p>
            <p className="text-[10px] text-white/25 mb-3">Toggle the days you're available, then set your time window</p>

            {(() => {
              const availableDays = computeAvailablePickupDays(listing);
              if (availableDays.length === 0) {
                return (
                  <div className="text-center py-6">
                    <p className="text-sm text-white/30">This listing has expired</p>
                  </div>
                );
              }
              const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 8 AM to 9 PM
              const todayDateStr = new Date().toISOString().split("T")[0];
              const currentHour = new Date().getHours();
              return (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {availableDays.map((day) => {
                    const sel = pickupDaySelections[day.date];
                    const isToday = day.date === todayDateStr;
                    return (
                      <div
                        key={day.date}
                        className={`rounded-lg border transition-all ${sel ? "border-fuchsia-400/30 bg-fuchsia-500/5" : "border-white/10 bg-white/[0.02]"}`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setPickupDaySelections((prev) => {
                              if (prev[day.date]) {
                                const next = { ...prev };
                                delete next[day.date];
                                return next;
                              }
                              const defaultFrom = isToday ? Math.min(Math.max(currentHour, 8), 19) : 8;
                              const defaultTo = isToday ? Math.min(Math.max(defaultFrom + 1, 9), 21) : 21;
                              return { ...prev, [day.date]: { slots: [{ from: defaultFrom, to: defaultTo }], dayLabel: day.dayLabel } };
                            });
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                        >
                          <div className={`size-4 rounded border flex items-center justify-center shrink-0 transition-colors ${sel ? "bg-fuchsia-500 border-fuchsia-400" : "border-white/25 bg-white/5"}`}>
                            {sel && <Check className="size-2.5 text-white" />}
                          </div>
                          <span className={`text-xs font-medium flex-1 ${sel ? "text-white" : "text-white/50"}`}>{day.dayLabel}</span>
                          {sel && (
                            <span className="text-[10px] text-fuchsia-300/70">
                              {sel.slots.map((s) => `${formatHour(s.from)} – ${formatHour(s.to)}`).join(", ")}
                            </span>
                          )}
                        </button>
                        {sel && (
                          <div className="px-3 pb-2.5 pt-0 space-y-2">
                            {sel.slots.map((slot, slotIdx) => (
                              <div key={slotIdx} className="flex items-center gap-2">
                                <label className="text-[10px] text-white/30">From</label>
                                <select
                                  value={slot.from}
                                  onChange={(e) => {
                                    const newFrom = Number(e.target.value);
                                    setPickupDaySelections((prev) => {
                                      const updated = { ...prev[day.date] };
                                      const newSlots = [...updated.slots];
                                      newSlots[slotIdx] = { from: newFrom, to: Math.max(newSlots[slotIdx].to, newFrom + 1) };
                                      return { ...prev, [day.date]: { ...updated, slots: newSlots } };
                                    });
                                  }}
                                  className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/15 text-xs text-white focus:outline-none focus:border-fuchsia-400 transition-colors"
                                >
                                  {isToday ? (
                                    <>
                                      <option value={currentHour}>{`Now (${formatHour(currentHour)})`}</option>
                                      {HOURS.slice(0, -1).filter((h) => h > currentHour).map((h) => (
                                        <option key={h} value={h}>{formatHour(h)}</option>
                                      ))}
                                    </>
                                  ) : (
                                    HOURS.slice(0, -1).map((h) => (
                                      <option key={h} value={h}>{formatHour(h)}</option>
                                    ))
                                  )}
                                </select>
                                <label className="text-[10px] text-white/30">To</label>
                                <select
                                  value={slot.to}
                                  onChange={(e) => {
                                    setPickupDaySelections((prev) => {
                                      const updated = { ...prev[day.date] };
                                      const newSlots = [...updated.slots];
                                      newSlots[slotIdx] = { ...newSlots[slotIdx], to: Number(e.target.value) };
                                      return { ...prev, [day.date]: { ...updated, slots: newSlots } };
                                    });
                                  }}
                                  className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/15 text-xs text-white focus:outline-none focus:border-fuchsia-400 transition-colors"
                                >
                                  {HOURS.filter((h) => h > slot.from).map((h) => (
                                    <option key={h} value={h}>{formatHour(h)}</option>
                                  ))}
                                </select>
                                {sel.slots.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPickupDaySelections((prev) => {
                                        const updated = { ...prev[day.date] };
                                        const newSlots = updated.slots.filter((_, i) => i !== slotIdx);
                                        return { ...prev, [day.date]: { ...updated, slots: newSlots } };
                                      });
                                    }}
                                    className="text-white/30 hover:text-red-400 transition-colors"
                                  >
                                    <X className="size-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                            {(() => {
                              const lastSlot = sel.slots[sel.slots.length - 1];
                              const dayIsFull = lastSlot.to >= 21;
                              return (
                                <button
                                  type="button"
                                  disabled={dayIsFull}
                                  onClick={() => {
                                    setPickupDaySelections((prev) => {
                                      const updated = { ...prev[day.date] };
                                      const last = updated.slots[updated.slots.length - 1];
                                      if (last.to >= 21) return prev;
                                      const newFrom = last.to;
                                      const newTo = Math.min(newFrom + 1, 21);
                                      return { ...prev, [day.date]: { ...updated, slots: [...updated.slots, { from: newFrom, to: newTo }] } };
                                    });
                                  }}
                                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-dashed border-fuchsia-400/40 text-xs font-medium text-fuchsia-300 hover:text-fuchsia-200 hover:border-fuchsia-400/70 hover:bg-fuchsia-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-fuchsia-300 disabled:hover:border-fuchsia-400/40 disabled:hover:bg-transparent"
                                >
                                  <Plus className="size-3.5" />
                                  {dayIsFull ? "Day is full" : "Add another time window"}
                                </button>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Terms of Service (hidden in edit mode — already agreed) */}
          {!editingOrderId && (
            <div className="space-y-4 mb-5">
              <p className="text-sm text-white/90 font-semibold">
                By confirming, I agree to be available for pickup during the time(s) proposed to the seller.
              </p>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={buyTosAgreed}
                  onChange={(e) => setBuyTosAgreed(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-white/30 bg-white/5 accent-fuchsia-500 cursor-pointer"
                />
                <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors">
                  I agree to the{" "}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onNavigateToTerms(); }}
                    className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors inline-flex items-center gap-1"
                  >
                    Terms & Conditions
                    <ExternalLink className="size-3" />
                  </button>
                </span>
              </label>
            </div>
          )}

          {/* Confirm / Update Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex-1 border-white/20 text-white/60 hover:text-white hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={editingOrderId ? handleUpdatePickupSlots : handleConfirmPurchase}
              disabled={Object.keys(pickupDaySelections).length === 0 || isSubmittingOrder || (!editingOrderId && !buyTosAgreed)}
              className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40"
            >
              {isSubmittingOrder ? <Loader2 className="size-4 animate-spin" /> : editingOrderId ? "Save Changes" : "Confirm Purchase"}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
