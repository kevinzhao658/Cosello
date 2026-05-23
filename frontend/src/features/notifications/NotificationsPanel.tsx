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
import { NotificationItemSkeleton } from "../../components/NotificationItemSkeleton";

type NotificationsPanelProps = {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  notificationsLoaded: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onAction: (id: number, action: "accept" | "reject") => void;
  onNotifClick: (notificationId: number, type: string, listingId: string | null) => void;
  onConfirmPickup: (listingId: string | null) => void;
  onOpenUserDashboard: (userId: string) => void;
};

// Short relative-time label for the row meta line. Falls back to a static date
// once the event is more than a week old.
function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
      return (
        <>
          {parts.baseText} <span className="text-primary font-semibold">{label}</span> until pickup at {parts.pickupTimeDisplay}.
        </>
      );
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
  const isJoinRequest = n.type === "join_request";
  const isUnread = !n.is_read;
  const rowClickable = isClickable && !!n.listing_id;

  return (
    <div
      className={`relative flex gap-3 px-4 py-3 border-b border-hairline transition-colors ${
        isUnread ? "bg-canvas" : "bg-surface-soft"
      } ${rowClickable ? "cursor-pointer hover:bg-surface-strong" : "hover:bg-surface-strong"}`}
      onClick={onClick}
    >
      {isUnread && (
        <span
          aria-hidden="true"
          className="absolute top-3 right-3 size-2 rounded-full bg-primary"
        />
      )}
      {/* Icon tile or avatar */}
      {isJoinRequest && n.related_user_picture ? (
        <img
          src={n.related_user_picture}
          alt=""
          className="size-9 rounded-md object-cover shrink-0"
        />
      ) : (
        <div className={`size-9 rounded-md flex items-center justify-center shrink-0 ${visuals.bgClass}`}>
          <Icon className={visuals.iconClass} />
        </div>
      )}
      <div className="flex-1 min-w-0 pr-4">
        <p className={`text-sm font-semibold line-clamp-1 ${isUnread ? "text-ink" : "text-muted"}`}>{n.title}</p>
        <p className={`text-sm line-clamp-2 mt-0.5 ${isUnread ? "text-body" : "text-muted"}`}>
          {isJoinRequest && n.related_user_name ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (n.related_user_id) onOpenUserDashboard(n.related_user_id);
                }}
                className="font-semibold text-ink hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded"
              >
                {n.related_user_name}
              </button>
              {" "}
              {n.message.replace(n.related_user_name, "").trimStart()}
            </>
          ) : countdownContent ?? n.message}
        </p>
        {n.created_at && (
          <p className="text-xs text-muted mt-1">{formatRelativeTime(n.created_at)}</p>
        )}

        {/* join_request inline actions */}
        {isJoinRequest && n.join_request_status === "pending" && (
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAction(n.id, "accept"); }}
              className="inline-flex items-center gap-1 h-7 px-3 rounded-md text-xs font-semibold bg-primary text-on-primary hover:bg-primary-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <Check className="size-3" />Accept
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAction(n.id, "reject"); }}
              className="inline-flex items-center gap-1 h-7 px-3 rounded-md text-xs font-semibold border border-border-strong text-ink bg-canvas hover:bg-surface-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <X className="size-3" />Reject
            </button>
          </div>
        )}
        {isJoinRequest && n.join_request_status === "accepted" && (
          <p className="text-xs text-primary font-semibold mt-1">Accepted</p>
        )}
        {isJoinRequest && n.join_request_status === "rejected" && (
          <p className="text-xs text-error font-semibold mt-1">Rejected</p>
        )}

        {isPickupReady && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onConfirmPickup(); }}
            className="inline-flex items-center gap-1 mt-2 h-7 px-3 rounded-md text-xs font-semibold bg-primary text-on-primary hover:bg-primary-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <CheckCircle className="size-3" />Confirm pickup
          </button>
        )}
      </div>
    </div>
  );
});

export function NotificationsPanel({
  open,
  onClose,
  notifications,
  notificationsLoaded,
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
    // notifCountdownTick is read implicitly via Date.now() in isActivePickup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        className="fixed inset-0 bg-ink/40 z-[299] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        onClick={onClose}
      />
      {/* Side panel — full viewport height, anchored to the right edge */}
      <div
        role="dialog"
        aria-label="Notifications"
        className="fixed top-0 right-0 bottom-0 w-[420px] max-w-[90vw] bg-canvas border-l border-hairline shadow-overlay overflow-hidden flex flex-col z-[300] motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-200"
      >
        <div className="flex items-start justify-between px-4 py-4 border-b border-hairline shrink-0 gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold text-ink leading-tight">Notifications</p>
            <p className="text-xs text-muted mt-0.5">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-xs text-primary hover:text-primary-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded font-semibold"
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="inline-flex items-center justify-center size-9 rounded-full bg-surface-soft text-muted hover:bg-surface-strong hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!notificationsLoaded && notifications.length === 0 ? (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <NotificationItemSkeleton key={i} />
              ))}
            </>
          ) : notifications.length === 0 ? (
            <div className="py-16 text-center">
              <Bell className="size-6 text-muted-soft mx-auto mb-3" />
              <p className="text-sm text-muted">No notifications yet</p>
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
