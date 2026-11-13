/**
 * The browser's offer to install HQ as an app, held until the person asks for it.
 *
 * A browser that can install a site says so once, soon after a page loads: usually long
 * before anyone opens the screen with the button on it, and on whatever screen they
 * happened to arrive at. The offer can only be taken up from a press. So the shell holds
 * it from wherever it arrived (`AppDevice`, on every signed-in screen) and the button on
 * My notifications reads it from here.
 */

export type InstallOffer = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallStanding = "offered" | "installed" | "none";

let held: InstallOffer | null = null;
let installed = false;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

export function holdInstallOffer(offer: InstallOffer): void {
  held = offer;
  changed();
}

/** The browser says HQ was installed, from the button here or from its own menu. */
export function markInstalled(): void {
  held = null;
  installed = true;
  changed();
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function installStanding(): InstallStanding {
  if (installed) return "installed";
  return held ? "offered" : "none";
}

/**
 * Put the held offer to the person. An offer is good for one asking: taken or turned
 * down, it is spent, and the browser makes another in its own time if it was turned down.
 */
export async function takeInstallOffer(): Promise<"accepted" | "dismissed" | "none"> {
  const offer = held;
  if (!offer) return "none";
  held = null;
  try {
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    if (outcome === "accepted") installed = true;
    return outcome;
  } catch {
    return "dismissed";
  } finally {
    changed();
  }
}

/** For tests: back to a browser that has said nothing. */
export function forgetInstallOffer(): void {
  held = null;
  installed = false;
  changed();
}
