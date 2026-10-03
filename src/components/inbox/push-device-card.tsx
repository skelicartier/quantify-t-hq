"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

type Stage = "checking" | "unsupported" | "blocked" | "off" | "on";

function deviceLabel(agent: string): string {
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Firefox\//.test(agent)
      ? "Firefox"
      : /Chrome\//.test(agent)
        ? "Chrome"
        : /Safari\//.test(agent)
          ? "Safari"
          : "A browser";
  const system = /iPad/.test(agent)
    ? "an iPad"
    : /iPhone/.test(agent)
      ? "an iPhone"
      : /Android/.test(agent)
        ? "Android"
        : /Mac OS X/.test(agent)
          ? "a Mac"
          : /Windows/.test(agent)
            ? "Windows"
            : /Linux/.test(agent)
              ? "Linux"
              : "a device";
  return `${browser} on ${system}`;
}

function serverKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64url}${"=".repeat((4 - (base64url.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function keyOf(subscription: PushSubscription, name: "p256dh" | "auth"): string {
  const key = subscription.getKey(name);
  if (!key) return "";
  let text = "";
  for (const byte of new Uint8Array(key)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Push for the device in hand: what this browser can do, then one press to turn it on —
 * the browser asks the person first — or off again. Rows that land in the person's
 * Priority then reach this device, outside their quiet hours.
 */
export function PushDeviceCard({
  publicKey,
  subscribeAction,
  unsubscribeAction,
}: {
  publicKey: string;
  subscribeAction: Action;
  unsubscribeAction: Action;
}) {
  const [stage, setStage] = useState<Stage>("checking");
  const [state, setState] = useState<ActionState>(INITIAL_ACTION_STATE);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setStage("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStage("blocked");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setStage(existing ? "on" : "off");
    })().catch(() => {
      if (!cancelled) setStage("unsupported");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = () =>
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStage(permission === "denied" ? "blocked" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: serverKey(publicKey),
          }));
        const form = new FormData();
        form.set("endpoint", subscription.endpoint);
        form.set("p256dh", keyOf(subscription, "p256dh"));
        form.set("auth", keyOf(subscription, "auth"));
        form.set("label", deviceLabel(navigator.userAgent));
        const answer = await subscribeAction(INITIAL_ACTION_STATE, form);
        setState(answer);
        if (answer.status === "sent") setStage("on");
        else await subscription.unsubscribe();
      } catch {
        setState({
          status: "error",
          message: "This browser could not set push up just now. Try again in a moment.",
        });
      }
    });

  const turnOff = () =>
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const form = new FormData();
          form.set("endpoint", subscription.endpoint);
          setState(await unsubscribeAction(INITIAL_ACTION_STATE, form));
          await subscription.unsubscribe();
        }
        setStage("off");
      } catch {
        setState({ status: "error", message: "Push could not be turned off just now." });
      }
    });

  return (
    <div className="push-device" aria-live="polite">
      {stage === "checking" && <p className="side-quiet">Checking what this browser can do…</p>}
      {stage === "unsupported" && (
        <p className="side-quiet">
          This browser cannot take push notices. On an iPhone or iPad, add HQ to the home screen
          first (Share, then Add to Home Screen) and open it from there.
        </p>
      )}
      {stage === "blocked" && (
        <p className="side-quiet">
          Notices from HQ are blocked in this browser&rsquo;s settings. Allow them there, then come
          back to turn push on.
        </p>
      )}
      {stage === "off" && (
        <Button type="button" variant="primary" onClick={turnOn} disabled={pending}>
          {pending ? "Turning on…" : "Turn on for this device"}
        </Button>
      )}
      {stage === "on" && (
        <p className="push-device__on">
          <strong>On for this device.</strong>{" "}
          <Button type="button" size="small" variant="ghost" onClick={turnOff} disabled={pending}>
            {pending ? "Turning off…" : "Turn off for this device"}
          </Button>
        </p>
      )}
      <FormFeedback state={state} />
    </div>
  );
}
