"use client";

import { useEffect } from "react";

import { holdInstallOffer, markInstalled, type InstallOffer } from "@/lib/install-offer";

type BadgeNavigator = Navigator & {
  setAppBadge?: (count: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * What HQ does on the device itself: it registers the service worker that shows push
 * notices, puts the unread count on the installed app's icon, and keeps the browser's
 * offer to install HQ for the button on My notifications.
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
  useEffect(() => {
    const onOffer = (event: Event) => {
      // Held, not shown: left alone, a phone's browser raises its own banner over
      // whatever the person is in the middle of.
      event.preventDefault();
      holdInstallOffer(event as InstallOffer);
    };
    window.addEventListener("beforeinstallprompt", onOffer);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onOffer);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);
  return null;
}
