import {
  UserPlus,
  ShoppingBag,
  XCircle,
  CheckCircle,
  Star,
  MapPin,
  type LucideIcon,
} from "lucide-react";

export type NotificationType =
  | "join_request"
  | "purchase"
  | "pickup_ready"
  | "request_accepted"
  | "order_confirmed"
  | "order_declined"
  | "order_cancelled"
  | "order_withdrawn"
  | "order_expired"
  | "order_completed"
  | "order_updated"
  | "review_submitted"
  | "address_released";

export type Notification = {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  community_id: number | null;
  related_user_id: string | null;
  related_user_name: string | null;
  related_user_picture: string | null;
  join_request_status: string | null;
  listing_id: string | null;
  created_at: string | null;
};

// Brutalist Trade icon tones (per design_handoff_cosello/README.md §8):
//   jade  → positive events (purchase, pickup, accepted, completed, etc.)
//   slate → informational events (join request, updates, reviews)
//   amber → negative / cancelled events
type NotificationTone = "jade" | "slate" | "amber";

type NotificationVisuals = {
  bgClass: string;
  Icon: LucideIcon;
  iconClass: string;
};

const TONE_CLASSES: Record<NotificationTone, { bg: string; fg: string }> = {
  jade: { bg: "bg-primary-soft", fg: "text-primary" },
  slate: { bg: "bg-surface-strong", fg: "text-muted" },
  amber: { bg: "bg-warning/15", fg: "text-warning" },
};

const tone = (
  toneName: NotificationTone,
  Icon: LucideIcon,
): NotificationVisuals => ({
  bgClass: TONE_CLASSES[toneName].bg,
  Icon,
  iconClass: `size-3.5 ${TONE_CLASSES[toneName].fg}`,
});

const DEFAULT_VISUAL: NotificationVisuals = tone("jade", CheckCircle);

const NOTIFICATION_VISUALS: Record<NotificationType, NotificationVisuals> = {
  // Jade — positive
  purchase:         tone("jade", ShoppingBag),
  pickup_ready:     tone("jade", MapPin),
  order_confirmed:  tone("jade", CheckCircle),
  address_released: tone("jade", MapPin),
  request_accepted: tone("jade", CheckCircle),
  order_completed:  tone("jade", CheckCircle),

  // Slate — informational
  join_request:     tone("slate", UserPlus),
  order_updated:    tone("slate", ShoppingBag),
  review_submitted: tone("slate", Star),

  // Amber — negative / cancelled
  order_declined:   tone("amber", XCircle),
  order_cancelled:  tone("amber", XCircle),
  order_withdrawn:  tone("amber", XCircle),
  order_expired:    tone("amber", XCircle),
};

export function getNotificationVisuals(type: string): NotificationVisuals {
  return NOTIFICATION_VISUALS[type as NotificationType] ?? DEFAULT_VISUAL;
}

const CLICKABLE_TYPES = new Set<string>([
  "purchase",
  "pickup_ready",
  "request_accepted",
  "order_confirmed",
  "order_declined",
  "review_submitted",
  "address_released",
  "order_withdrawn",
  "order_cancelled",
  "order_updated",
  "order_completed",
  "order_expired",
]);

export function isClickableNotification(type: string): boolean {
  return CLICKABLE_TYPES.has(type);
}
