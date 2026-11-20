"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";

function SeeLabel() {
  const { pending } = useLinkStatus();
  return <>{pending ? "Opening…" : "See the mail"}</>;
}

/**
 * A row's way to its message. The page stays where it is: the message opens over it, so
 * the place in a long record is not lost.
 */
export function SeeMailLink({ href, email }: { href: string; email: string }) {
  return (
    <Link
      className="btn btn--small merge-message__open"
      href={href}
      scroll={false}
      prefetch={false}
      aria-label={`See the mail to ${email}`}
    >
      <SeeLabel />
    </Link>
  );
}

/**
 * One person's message, opened over the record it came from. The page draws what is
 * inside; this only opens it, and on closing goes back to the record where it was.
 */
export function MergeMessageDialog({
  title,
  closeHref,
  children,
}: {
  title: string;
  closeHref: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="merge-message"
      aria-labelledby="merge-message-title"
      onClose={() => router.replace(closeHref, { scroll: false })}
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current.close();
      }}
    >
      <div className="merge-message__frame">
        <div className="merge-message__head">
          <h2 id="merge-message-title">{title}</h2>
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => dialogRef.current?.close()}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/**
 * Copies one piece of a message. Says so when it has, and says so too when the browser
 * refuses, so nobody pastes yesterday's clipboard believing it is this.
 */
export function CopyMessageButtons({
  items,
}: {
  items: readonly { key: string; label: string; text: string }[];
}) {
  const [said, setSaid] = useState("");
  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setSaid(`Copied: ${label.replace(/^Copy /, "")}.`);
    } catch {
      setSaid("The browser would not copy it: select the words below instead.");
    }
    window.setTimeout(() => setSaid(""), 2500);
  }
  return (
    <div className="merge-message__copy">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="btn btn--small"
          onClick={() => copy(item.label, item.text)}
        >
          {item.label}
        </button>
      ))}
      <span className="merge-message__said" role="status" aria-live="polite">
        {said}
      </span>
    </div>
  );
}
