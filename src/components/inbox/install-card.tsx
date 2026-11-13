"use client";

import { useState, useSyncExternalStore, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { installStanding, subscribeInstall, takeInstallOffer } from "@/lib/install-offer";

type Device = "checking" | "app" | "apple-touch" | "browser";

function subscribeDisplay(listener: () => void): () => void {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** Whether this is HQ open as an app, an iPhone or iPad (which installs by hand), or a browser. */
function deviceNow(): Device {
  const apple = navigator as Navigator & { standalone?: boolean };
  if (window.matchMedia("(display-mode: standalone)").matches || apple.standalone === true)
    return "app";
  // An iPad says it is a Mac; a Mac has no touch points.
  const touchApple =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return touchApple ? "apple-touch" : "browser";
}

/**
 * HQ as an app on the device in hand: one press where the browser offers it, the steps
 * to take by hand where it does not (an iPhone never offers), and a plain line once it
 * is installed.
 */
export function InstallCard() {
  const standing = useSyncExternalStore(subscribeInstall, installStanding, () => "none" as const);
  const device = useSyncExternalStore(subscribeDisplay, deviceNow, () => "checking" as const);
  const [declined, setDeclined] = useState(false);
  const [pending, startTransition] = useTransition();

  const install = () =>
    startTransition(async () => {
      setDeclined((await takeInstallOffer()) === "dismissed");
    });

  return (
    <div className="push-device" aria-live="polite">
      {device === "checking" ? (
        <p className="side-quiet">Checking what this browser can do…</p>
      ) : device === "app" || standing === "installed" ? (
        <p className="push-device__on">
          <strong>HQ is installed on this device.</strong>
        </p>
      ) : standing === "offered" ? (
        <Button type="button" variant="primary" onClick={install} disabled={pending}>
          {pending ? "Waiting for the browser…" : "Install HQ on this device"}
        </Button>
      ) : device === "apple-touch" ? (
        <p className="side-quiet">
          On an iPhone or iPad, open HQ in Safari, press Share, then Add to Home Screen. Push
          notices can be turned on once HQ is opened from there.
        </p>
      ) : (
        <p className="side-quiet">
          {declined
            ? "Nothing was installed. The button comes back when the browser offers again."
            : "This browser has not offered to install HQ. Chrome and Edge show an install button at the end of the address bar; in Safari on a Mac, choose File, then Add to Dock."}
        </p>
      )}
    </div>
  );
}
