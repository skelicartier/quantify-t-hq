"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { visibleNavLinks } from "@/components/shell/nav-links";
import { SHORTCUTS_OPEN_EVENT, isTypingTarget, openPalette } from "@/components/shell/palette-bus";

const SEQUENCE_WINDOW_MS = 900;

/**
 * Global keys: `g` then a letter jumps to a surface; `?` opens this sheet. List keys
 * (`j`/`k`/`Enter`/`x`) live with the lists that own them. Nothing fires while the
 * person is typing in a field.
 */
export function Shortcuts({ capabilities }: { capabilities: readonly string[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingG = useRef<number | null>(null);
  const links = visibleNavLinks(capabilities);

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const byKey = new Map(links.filter((link) => link.key).map((link) => [link.key!, link.href]));
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector("dialog[open]")) return;
      const key = event.key;
      if (key === "?") {
        event.preventDefault();
        open();
        return;
      }
      if (pendingG.current !== null && Date.now() - pendingG.current < SEQUENCE_WINDOW_MS) {
        pendingG.current = null;
        const href = byKey.get(key.toLowerCase());
        if (href) {
          event.preventDefault();
          router.push(href);
        }
        return;
      }
      if (key === "g") {
        pendingG.current = Date.now();
      }
    };
    const onOpen = () => open();
    window.addEventListener("keydown", onKey);
    window.addEventListener(SHORTCUTS_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SHORTCUTS_OPEN_EVENT, onOpen);
    };
  }, [links, open, router]);

  return (
    <dialog
      ref={dialogRef}
      className="shortcuts"
      aria-labelledby="shortcuts-title"
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current.close();
      }}
    >
      <div className="shortcuts__frame">
        <div className="shortcuts__head">
          <h2 id="shortcuts-title">Keyboard</h2>
          <button
            type="button"
            className="btn btn--small btn--ghost"
            onClick={() => dialogRef.current?.close()}
          >
            Close
          </button>
        </div>
        <div className="shortcuts__cols">
          <section aria-labelledby="shortcuts-global">
            <h3 id="shortcuts-global">Anywhere</h3>
            <dl>
              <div>
                <dt>
                  <kbd className="keycap">⌘</kbd>
                  <kbd className="keycap">K</kbd>
                </dt>
                <dd>
                  <button type="button" className="text-link" onClick={() => openPalette()}>
                    Search and commands
                  </button>
                </dd>
              </div>
              <div>
                <dt>
                  <kbd className="keycap">/</kbd>
                </dt>
                <dd>Search</dd>
              </div>
              <div>
                <dt>
                  <kbd className="keycap">?</kbd>
                </dt>
                <dd>This sheet</dd>
              </div>
              <div>
                <dt>
                  <kbd className="keycap">esc</kbd>
                </dt>
                <dd>Close a panel or clear a selection</dd>
              </div>
            </dl>
          </section>
          <section aria-labelledby="shortcuts-go">
            <h3 id="shortcuts-go">Go to</h3>
            <dl>
              {links
                .filter((link) => link.key)
                .map((link) => (
                  <div key={link.href}>
                    <dt>
                      <kbd className="keycap">g</kbd>
                      <kbd className="keycap">{link.key}</kbd>
                    </dt>
                    <dd>{link.label}</dd>
                  </div>
                ))}
            </dl>
          </section>
          <section aria-labelledby="shortcuts-desk">
            <h3 id="shortcuts-desk">In a conversation</h3>
            <dl>
              <div>
                <dt>
                  <kbd className="keycap">r</kbd>
                  <kbd className="keycap">n</kbd>
                </dt>
                <dd>Write a reply, or a note</dd>
              </div>
              <div>
                <dt>
                  <kbd className="keycap">a</kbd>
                  <kbd className="keycap">s</kbd>
                  <kbd className="keycap">p</kbd>
                </dt>
                <dd>Assignee, status, priority</dd>
              </div>
              <div>
                <dt>
                  <kbd className="keycap">t</kbd>
                  <kbd className="keycap">z</kbd>
                </dt>
                <dd>Tags, snooze</dd>
              </div>
              <div>
                <dt>
                  <kbd className="keycap">o</kbd>
                </dt>
                <dd>Follow or unfollow</dd>
              </div>
            </dl>
          </section>
          <section aria-labelledby="shortcuts-list">
            <h3 id="shortcuts-list">In a list</h3>
            <dl>
              <div>
                <dt>
                  <kbd className="keycap">j</kbd>
                  <kbd className="keycap">k</kbd>
                </dt>
                <dd>Next and previous row</dd>
              </div>
              <div>
                <dt>
                  <kbd className="keycap">↵</kbd>
                </dt>
                <dd>Open the row</dd>
              </div>
              <div>
                <dt>
                  <kbd className="keycap">x</kbd>
                </dt>
                <dd>Select the row</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </dialog>
  );
}
