import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X, Check, CheckCircle } from "lucide-react";
import {
  getNotificationVisuals,
  isClickableNotification,
  type Notification,
} from "../../lib/notifications";
import {
  formatCountdown,
  parseAddressReleasedMessage,
  PIN_WINDOW_MS,
} from "../../lib/pickupTime";

type NotificationsPanelProps = {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onAction: (id: number, action: "accept" | "reject") => void;
  onNotifClick: (notificationId: number, type: string, listingId: string | null) => void;
  onConfirmPickup: (listingId: string | null) => void;
  onOpenUserDashboard: (userId: string) => void;
};

// Memoized so unrelated state changes in App don't re-render the notification
// list. countdownTick is only passed as non-zero for address_released items so
// the 60s timer only re-renders those rows.
const NotificationItem = memo(function NotificationItem({
  n, countdownTick, onOpenUserDashboard, onAction, onClick, onConfirmPickup,
}: {
  n: Notification;
  countdownTick: number;
  onOpenUserDashboard: (userId: string) => void;
  onAction: (id: number, action: "accept" | "reject") => void;
  onClick: () => void;
  onConfirmPickup: () => void;
}) {
  const countdownContent = useMemo(() => {
    if (n.type !== "address_released") return null;
    const parts = parseAddressReleasedMessage(n.message);
    if (!parts) return null;
    void countdownTick;
    const target = new Date(parts.targetIso);
    const diff = target.getTime() - Date.now();
    if (diff > 0) {
      const { label } = formatCountdown(diff);
      return <>{parts.baseText} <span className="text-cyan-400 font-semibold">{label}</span> until pickup at {parts.pickupTimeDisplay}.</>;
    }
    return <>{parts.baseText}</>;
  }, [n, countdownTick]);

  const isPickupReady = useMemo(() => {
    if (n.type !== "address_released") return false;
    const parts = parseAddressReleasedMessage(n.message);
    if (!parts) return false;
    void countdownTick;
    const target = new Date(parts.targetIso);
    return !isNaN(target.getTime()) && Date.now() >= target.getTime();
  }, [n, countdownTick]);

  const isClickable = isClickableNotification(n.type);
  const visuals = getNotificationVisuals(n.type);
  const Icon = visuals.Icon;

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-white/5 transition-colors ${n.is_read ? "opacity-40" : ""} ${isClickable && n.listing_id ? "cursor-pointer hover:bg-white/5" : ""}`}
      onClick={onClick}
    >
      {n.type === "join_request" && n.related_user_picture ? (
        <img src={n.related_user_picture} alt="" className="size-7 rounded-full object-cover shrink-0 mt-0.5" />
      ) : (
        <div className={`size-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${visuals.bgClass}`}>
          <Icon className={visuals.iconClass} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-relaxed ${n.is_read ? "text-white/60" : "text-white font-medium"}`}>
          {n.type === "join_request" && n.related_user_name ? (
            <>
              <button onClick={(e) => { e.stopPropagation(); n.related_user_id && onOpenUserDashboard(n.related_user_id); }} className="font-medium text-white hover:underline">
                {n.related_user_name}
              </button>
              {" "}{n.message.replace(n.related_user_name, "").trimStart()}
            </>
          ) : countdownContent ?? n.message}
        </p>
        {n.type === "join_request" && n.join_request_status === "pending" && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <button onClick={() => onAction(n.id, "accept")} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"><Check className="size-3" />Accept</button>
            <button onClick={() => onAction(n.id, "reject")} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"><X className="size-3" />Deny</button>
          </div>
        )}
        {n.type === "join_request" && n.join_request_status === "accepted" && <p className="text-[10px] text-green-400 mt-1">Accepted</p>}
        {n.type === "join_request" && n.join_request_status === "rejected" && <p className="text-[10px] text-red-400 mt-1">Denied</p>}
        {isPickupReady && (
          <button onClick={(e) => { e.stopPropagation(); onConfirmPickup(); }} className="flex items-center gap-1 mt-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">
            <CheckCircle className="size-3" />Confirm Pickup
          </button>
        )}
        {n.created_at && <p className="text-[10px] text-white/25 mt-0.5">{new Date(n.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>}
      </div>
    </div>
  );
});

export function NotificationsPanel({
  open,
  onClose,
  notifications,
  unreadCount,
  onMarkAllRead,
  onAction,
  onNotifClick,
  onConfirmPickup,
  onOpenUserDashboard,
}: NotificationsPanelProps) {
  // 60s countdown tick — only schedule when at least one address_released
  // notification is pinned/active. Lives inside the panel because nothing
  // outside it consumes the tick.
  const [notifCountdownTick, setNotifCountdownTick] = useState(0);
  const hasActivePickupNotif = notifications.some(
    (n) => n.type === "address_released" && n.message.includes("||"),
  );
  useEffect(() => {
    if (!hasActivePickupNotif) return;
    const timer = setInterval(() => setNotifCountdownTick((p) => p + 1), 60000);
    return () => clearInterval(timer);
  }, [hasActivePickupNotif]);

  // Sort comparator depends on Date.now() via isActivePickup, so notifCountdownTick
  // must stay in the dep array — without it, a pickup crossing the 1-hour boundary
  // wouldn't re-pin until the next state change.
  const sortedNotifications = useMemo(() => {
    return [...notifications].sort((a, b) => {
      const isActivePickup = (n: Notification) => {
        if (n.type !== "address_released" || n.is_read) return false;
        const parts = parseAddressReleasedMessage(n.message);
        if (!parts) return false;
        const target = new Date(parts.targetIso);
        if (isNaN(target.getTime())) return false;
        const diff = target.getTime() - Date.now();
        return diff <= PIN_WINDOW_MS;
      };
      const aPin = isActivePickup(a);
      const bPin = isActivePickup(b);
      if (aPin && !bPin) return -1;
      if (!aPin && bPin) return 1;
      return 0;
    });
  }, [notifications, notifCountdownTick]);

  // Close on Escape — same close path as backdrop/X (parent's onClose handles
  // mark-read side effect).
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop — dims the rest of the UI; clicking it closes the panel.
          Rendered via portal so it escapes the nav's `backdrop-blur` stacking
          context (which otherwise traps fixed-positioned children below z-50). */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[299] animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Side panel — full viewport height, anchored to the right edge */}
      <div
        className="fixed top-0 right-0 bottom-0 w-full max-w-md border-l border-white/15 shadow-2xl overflow-hidden flex flex-col z-[300] animate-in slide-in-from-right duration-200"
        style={{ backgroundColor: '#18181b' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <p className="text-sm font-medium">Notifications</p>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white/70 transition-colors"
              aria-label="Close notifications"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-16 text-center">
              <Bell className="size-6 text-white/15 mx-auto mb-3" />
              <p className="text-xs text-white/30">No notifications</p>
            </div>
          ) : (
            sortedNotifications.map((n) => (
              <NotificationItem
                key={n.id}
                n={n}
                countdownTick={n.type === "address_released" ? notifCountdownTick : 0}
                onOpenUserDashboard={onOpenUserDashboard}
                onAction={onAction}
                onClick={() => onNotifClick(n.id, n.type, n.listing_id)}
                onConfirmPickup={() => onConfirmPickup(n.listing_id)}
              />
            ))
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
