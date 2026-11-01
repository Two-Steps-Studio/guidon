"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { playSound } from "@/lib/sounds";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/actions/notifications";
import type { Notification } from "@/lib/data/notifications";

const POLL_INTERVAL_MS = 30_000;

function timeAgo(iso: string, locale: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  return rtf.format(Math.round(diffHours / 24), "day");
}

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState(false);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("notifications");

  // null until the first load, so already-unread notifications at page load
  // don't chime - only ones that arrive while the page is open.
  const lastUnread = useRef<number | null>(null);
  const mounted = useRef(true);
  const refreshVersion = useRef(0);

  const refresh = useCallback(() => {
    if (!mounted.current) return;
    const version = ++refreshVersion.current;
    startTransition(async () => {
      try {
        const result = await getNotifications();
        if (!mounted.current || version !== refreshVersion.current) return;
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
        setLoadError(false);
        if (lastUnread.current !== null && result.unreadCount > lastUnread.current) playSound("notify");
        lastUnread.current = result.unreadCount;
      } catch {
        // A navigation can abort the pending Server Action. If this menu
        // remains mounted, retain its cache and offer a visible retry.
        if (mounted.current && version === refreshVersion.current) setLoadError(true);
      }
    });
  }, []);

  // Poll rather than a real-time subscription - no websocket/realtime
  // infrastructure exists anywhere else in this codebase (rate limiting is
  // in-memory per-process, AI insight generation is request/response), and
  // a 30s badge-count lag is an acceptable tradeoff for not introducing one
  // just for this.
  useEffect(() => {
    mounted.current = true;
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => { mounted.current = false;clearInterval(interval); };
  }, [refresh]);

  function handleSelect(notification: Notification) {
    if (!notification.read_at) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      startTransition(async () => {
        try { const result = await markNotificationRead(notification.id);if (result.error) throw new Error("Read failed"); }
        catch { if (mounted.current) { setLoadError(true);refresh(); } }
      });
    }
    router.push(notification.link);
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
    startTransition(async () => {
      try { const result = await markAllNotificationsRead();if (result.error) throw new Error("Read failed"); }
      catch { if (mounted.current) { setLoadError(true);refresh(); } }
    });
  }

  return (
    <DropdownMenu modal={false} onOpenChange={(open) => open && refresh()}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8"
              // Stabilny uchwyt dla spotlight tour (przewodnik po aplikacji).
              data-tour="bell"
              aria-label={unreadCount > 0 ? t("bellAriaUnread", { count: unreadCount }) : t("bellAria")}
            >
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span
                  aria-hidden
                  className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        className="flex h-[min(24rem,calc(100dvh-4rem))] w-96 max-w-[calc(100vw-1rem)] flex-col overflow-y-hidden max-h-[calc(100dvh-4rem)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-sm font-medium">{t("title")}</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="shrink-0 py-1 text-xs text-primary hover:underline disabled:opacity-50"
            >
              {t("markAllRead")}
            </button>
          )}
        </div>
        {loadError && <div className="space-y-2 px-2 py-3 text-sm"><p role="alert">{t("loadFailed")}</p><button type="button" className="min-h-11 rounded border px-3 py-2" disabled={isPending} onClick={refresh}>{t("retry")}</button></div>}
        {notifications.length === 0 && !loadError ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                onSelect={() => handleSelect(notification)}
                className="flex flex-col items-start gap-0.5 whitespace-normal py-2"
              >
                <span className="flex w-full items-start gap-1.5">
                  {!notification.read_at && (
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                  <span
                    className={
                      notification.read_at ? "min-w-0 break-words text-muted-foreground" : "min-w-0 break-words font-medium"
                    }
                  >
                    {notification.title}
                  </span>
                </span>
                <span className="pl-3 text-xs text-muted-foreground">
                  {timeAgo(notification.created_at, locale)}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
