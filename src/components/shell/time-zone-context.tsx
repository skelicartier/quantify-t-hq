"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

import { canonicalZone } from "@/lib/time-zone";

const TimeZoneContext = createContext("");
const ADOPTED = "hq-time-zone-adopted";

/**
 * The zone the signed-in person reads times in, for client components: the server
 * prints its times from the request's zone, and a client component asks this hook so
 * the two agree on every render. "" is UTC.
 */
export function useTimeZone(): string {
  return useContext(TimeZoneContext);
}

/** The device's zone, as the browser knows it; "" when it does not say. */
function deviceZone(): string {
  try {
    return canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  } catch {
    return "";
  }
}

/**
 * Hands the person's zone to everything below it. Somebody who has not chosen one yet is
 * given their device's, saved to the account once (HubSpot's rule: the device's zone
 * until they say otherwise), and the page is re-read in it.
 */
export function TimeZoneProvider({
  zone,
  adopt,
  children,
}: {
  zone: string;
  adopt: (zone: string) => Promise<boolean>;
  children: ReactNode;
}) {
  const router = useRouter();
  const adopting = useRef(false);
  useEffect(() => {
    if (zone || adopting.current) return;
    const found = deviceZone();
    if (!found || found === "UTC") return;
    // Once per browser session: a zone the service refused is not asked about on every page.
    try {
      if (window.sessionStorage.getItem(ADOPTED) === found) return;
      window.sessionStorage.setItem(ADOPTED, found);
    } catch {
      // Without storage the guard above still holds for this page.
    }
    adopting.current = true;
    adopt(found)
      .then((saved) => {
        if (saved) router.refresh();
      })
      .catch(() => undefined);
  }, [zone, adopt, router]);
  return <TimeZoneContext.Provider value={zone}>{children}</TimeZoneContext.Provider>;
}
