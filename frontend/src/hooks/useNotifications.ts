import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "../lib/api";
import type { Notification } from "../lib/notifications";

export interface UseNotificationsReturn {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  notifications: Notification[];
  notificationsLoaded: boolean;
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markAllRead: () => Promise<void>;
  act: (notificationId: number, action: "accept" | "reject") => Promise<void>;
  markOneRead: (notificationId: number) => void;
  reset: () => void;
}

interface UseNotificationsDeps {
  isAuthenticated: boolean;
  token: string | null;
}

export function useNotifications({ isAuthenticated, token }: UseNotificationsDeps): UseNotificationsReturn {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const notificationsRef = useRef(notifications);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);

  const fetchUnreadCount = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch { /* ignore */ }
  };

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/notifications");
      if (res.ok) {
        setNotifications(await res.json());
      }
    } catch { /* ignore */ } finally {
      setNotificationsLoaded(true);
    }
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      await apiFetch("/api/notifications/mark-read", {
        method: "POST",
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const act = async (notificationId: number, action: "accept" | "reject") => {
    if (!token) return;
    try {
      const res = await apiFetch(`/api/notifications/${notificationId}/${action}`, {
        method: "POST",
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId
              ? { ...n, join_request_status: action === "accept" ? "accepted" : "rejected" }
              : n
          )
        );
      }
    } catch (err) {
      console.error(`Failed to ${action} request:`, err);
    }
  };

  const markOneRead = useCallback((notificationId: number) => {
    const target = notificationsRef.current.find((n) => n.id === notificationId);
    if (!target || target.is_read) return;
    setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)));
    setUnreadCount((u) => Math.max(0, u - 1));
    // Server endpoint is idempotent — fire-and-forget; UI is already optimistic.
    apiFetch(`/api/notifications/${notificationId}/read`, { method: "POST" }).catch(() => {});
  }, []);

  // 30-second poll for unread count while authenticated
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, token]);

  const reset = () => {
    setNotifications([]);
    setNotificationsLoaded(false);
    setUnreadCount(0);
  };

  return {
    open,
    setOpen,
    notifications,
    notificationsLoaded,
    unreadCount,
    fetchNotifications,
    markAllRead,
    act,
    markOneRead,
    reset,
  };
}
