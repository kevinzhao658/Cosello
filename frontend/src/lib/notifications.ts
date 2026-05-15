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
  | "order_confirmed"
  | "order_declined"
  | "order_cancelled"
  | "order_withdrawn"
  | "order_expired"
  | "order_completed"
  | "order_updated"
  | "review_submitted"
  | "address_released";

type NotificationVisuals = {
  bgClass: string;
  Icon: LucideIcon;
  iconClass: string;
};

const DEFAULT_VISUAL: NotificationVisuals = {
  bgClass: "bg-green-500/15",
  Icon: CheckCircle,
  iconClass: "size-3.5 text-green-400",
};

const NOTIFICATION_VISUALS: Record<NotificationType, NotificationVisuals> = {
  join_request:      { bgClass: "bg-amber-500/15",   Icon: UserPlus,    iconClass: "size-3.5 text-amber-400"   },
  purchase:          { bgClass: "bg-cyan-500/15",    Icon: ShoppingBag, iconClass: "size-3.5 text-cyan-400"    },
  order_updated:     { bgClass: "bg-cyan-500/15",    Icon: ShoppingBag, iconClass: "size-3.5 text-cyan-400"    },
  order_declined:    { bgClass: "bg-red-500/15",     Icon: XCircle,     iconClass: "size-3.5 text-red-400"     },
  order_cancelled:   { bgClass: "bg-red-500/15",     Icon: XCircle,     iconClass: "size-3.5 text-red-400"     },
  order_withdrawn:   { bgClass: "bg-amber-500/15",   Icon: XCircle,     iconClass: "size-3.5 text-amber-400"   },
  order_expired:     { bgClass: "bg-amber-500/15",   Icon: XCircle,     iconClass: "size-3.5 text-amber-400"   },
  order_completed:   { bgClass: "bg-fuchsia-500/15", Icon: CheckCircle, iconClass: "size-3.5 text-fuchsia-400" },
  review_submitted:  { bgClass: "bg-fuchsia-500/15", Icon: Star,        iconClass: "size-3.5 text-fuchsia-400" },
  address_released:  { bgClass: "bg-green-500/15",   Icon: MapPin,      iconClass: "size-3.5 text-green-400"   },
  order_confirmed:   DEFAULT_VISUAL,
};

export function getNotificationVisuals(type: string): NotificationVisuals {
  return NOTIFICATION_VISUALS[type as NotificationType] ?? DEFAULT_VISUAL;
}

const CLICKABLE_TYPES = new Set<string>([
  "purchase",
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
