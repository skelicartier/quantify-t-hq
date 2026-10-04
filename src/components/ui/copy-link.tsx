"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Copies the address of a page in HQ — this site's own origin and the path — so a record
 * can be pasted into a message. Says so when the browser refuses (an insecure origin, a
 * denied permission) rather than failing quietly.
 */
export function CopyLink({ path, label = "Copy link" }: { path: string; label?: string }) {
  const [said, setSaid] = useState("");
  async function copy() {
    const address = path.startsWith("http") ? path : `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(address);
      setSaid("Copied.");
    } catch {
      setSaid("The browser would not copy it: copy the address bar instead.");
    }
    window.setTimeout(() => setSaid(""), 2500);
  }
  return (
    <span className="copy-link">
      <Button type="button" size="small" onClick={copy}>
        <Link2 size={14} aria-hidden="true" />
        {label}
      </Button>
      <span className="quiet" role="status" aria-live="polite">
        {said}
      </span>
    </span>
  );
}
