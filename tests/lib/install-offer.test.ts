import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forgetInstallOffer,
  holdInstallOffer,
  installStanding,
  markInstalled,
  subscribeInstall,
  takeInstallOffer,
  type InstallOffer,
} from "@/lib/install-offer";

function offer(outcome: "accepted" | "dismissed") {
  const prompt = vi.fn(async () => undefined);
  const event = Object.assign(new Event("beforeinstallprompt"), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  }) as InstallOffer;
  return { event, prompt };
}

describe("the browser's offer to install HQ", () => {
  afterEach(() => forgetInstallOffer());

  it("says nothing was offered until the browser offers", async () => {
    expect(installStanding()).toBe("none");
    expect(await takeInstallOffer()).toBe("none");
  });

  it("holds an offer and tells whoever is listening", () => {
    const heard = vi.fn();
    const stop = subscribeInstall(heard);
    holdInstallOffer(offer("accepted").event);
    expect(installStanding()).toBe("offered");
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    forgetInstallOffer();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("is installed once the person accepts, and asks the browser once", async () => {
    const { event, prompt } = offer("accepted");
    holdInstallOffer(event);
    expect(await takeInstallOffer()).toBe("accepted");
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(installStanding()).toBe("installed");
  });

  it("spends an offer that is turned down: the same one is never put twice", async () => {
    const { event, prompt } = offer("dismissed");
    holdInstallOffer(event);
    expect(await takeInstallOffer()).toBe("dismissed");
    expect(installStanding()).toBe("none");
    expect(await takeInstallOffer()).toBe("none");
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("treats a browser that refuses to show the offer as a no", async () => {
    const event = Object.assign(new Event("beforeinstallprompt"), {
      prompt: async () => {
        throw new Error("not allowed");
      },
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    }) as InstallOffer;
    holdInstallOffer(event);
    expect(await takeInstallOffer()).toBe("dismissed");
    expect(installStanding()).toBe("none");
  });

  it("is installed when the browser says so, from its own menu", () => {
    holdInstallOffer(offer("accepted").event);
    markInstalled();
    expect(installStanding()).toBe("installed");
  });
});
