"use client";

import { useEffect } from "react";

type BadgeNavigator = Navigator & {
  setAppBadge?: (count: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * What HQ does on the device itself: it registers the service worker that shows push
 * notices, and puts the unread count on the installed app's icon.
 */
export function AppDevice({ unread }: { unread: number }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    const device = navigator as BadgeNavigator;
    const done = unread > 0 ? device.setAppBadge?.(unread) : device.clearAppBadge?.();
    done?.catch(() => {});
  }, [unread]);
  return null;
}
