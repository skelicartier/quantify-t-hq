"use client";

import {
  ArrowRight,
  Building2,
  Contact,
  Handshake,
  Inbox,
  Keyboard,
  LifeBuoy,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { visibleNavLinks } from "@/components/shell/nav-links";
import { PALETTE_OPEN_EVENT, isTypingTarget, openShortcuts } from "@/components/shell/palette-bus";
import { useHqTheme } from "@/components/shell/theme-scope";
import type { SearchHit } from "@/app/(portal)/_actions/search";

type Command = {
  id: string;
  group: "Recent" | "Go to" | "Records" | "Actions";
  title: string;
  subtitle?: string | undefined;
  keys?: string | undefined;
  icon?: typeof Search | undefined;
  run: () => void;
};

const RECENTS_KEY = "hq-palette-recents";
const RECENTS_MAX = 5;

const KIND_ICON: Record<SearchHit["kind"], typeof Search> = {
  company: Building2,
  person: Contact,
  lead: Inbox,
  deal: Handshake,
  ticket: LifeBuoy,
};

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  company: "Company",
  person: "Person",
  lead: "Lead",
  deal: "Deal",
  ticket: "Ticket",
};

function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const next = [id, ...readRecents().filter((item) => item !== id)].slice(0, RECENTS_MAX);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // A private window forgets; nothing else changes.
  }
}

type CommandPaletteProps = {
  capabilities: readonly string[];
  search: (query: string) => Promise<SearchHit[]>;
};

/**
 * ⌘K. Navigation, record search across every kind the role may read, and a few
 * actions. Opens 15% from the top, one input, grouped rows, keycaps on the right;
 * Backspace on an empty query closes nothing — Escape does.
 */
export function CommandPalette({ capabilities, search }: CommandPaletteProps) {
  const router = useRouter();
  const { theme, setTheme } = useHqTheme();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [searching, startSearch] = useTransition();
  const latestQuery = useRef("");

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setQuery("");
    setHits([]);
    setActive(0);
    setRecents(readRecents());
    dialog.showModal();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  useEffect(() => {
    const onOpen = () => open();
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialogRef.current?.open) close();
        else open();
        return;
      }
      if (event.key === "/" && !isTypingTarget(event.target) && !dialogRef.current?.open) {
        event.preventDefault();
        open();
      }
    };
    window.addEventListener(PALETTE_OPEN_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(PALETTE_OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Record search, debounced; the latest query wins. A short query clears the hits in
  // the change handler, so the effect only ever schedules work.
  useEffect(() => {
    const trimmed = query.trim();
    latestQuery.current = trimmed;
    if (trimmed.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      startSearch(async () => {
        const found = await search(trimmed);
        if (latestQuery.current === trimmed) setHits(found);
      });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const navigation = useMemo(() => visibleNavLinks(capabilities), [capabilities]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
    };
    const list: Command[] = [];
    for (const link of navigation) {
      list.push({
        id: `go:${link.href}`,
        group: "Go to",
        title: link.label,
        keys: link.key ? `g ${link.key}` : undefined,
        icon: link.icon,
        run: go(link.href),
      });
    }
    for (const hit of hits) {
      list.push({
        id: `rec:${hit.kind}:${hit.id}`,
        group: "Records",
        title: hit.title,
        subtitle: `${KIND_LABEL[hit.kind]}${hit.subtitle ? ` · ${hit.subtitle}` : ""}`,
        icon: KIND_ICON[hit.kind],
        run: go(hit.href),
      });
    }
    list.push(
      {
        id: "act:theme",
        group: "Actions",
        title: theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme",
        icon: theme === "dark" ? Sun : Moon,
        run: () => setTheme(theme === "dark" ? "light" : "dark"),
      },
      {
        id: "act:shortcuts",
        group: "Actions",
        title: "Keyboard shortcuts",
        keys: "?",
        icon: Keyboard,
        run: () => openShortcuts(),
      },
    );
    return list;
  }, [navigation, hits, theme, setTheme, router]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!needle) {
      const recent = recents
        .map((id) => commands.find((command) => command.id === id))
        .filter((command): command is Command => Boolean(command))
        .map((command) => ({ ...command, group: "Recent" as const }));
      const rest = commands.filter((command) => !recents.includes(command.id));
      return [...recent, ...rest];
    }
    return commands.filter(
      (command) =>
        command.group === "Records" ||
        command.title.toLowerCase().includes(needle) ||
        (command.subtitle ?? "").toLowerCase().includes(needle),
    );
  }, [commands, needle, recents]);

  const activeIndex = Math.min(active, Math.max(visible.length - 1, 0));

  const run = (command: Command) => {
    pushRecent(command.id);
    close();
    command.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (visible.length ? (current + 1) % visible.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) =>
        visible.length ? (current - 1 + visible.length) % visible.length : 0,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = visible[activeIndex];
      if (command) run(command);
    }
  };

  let lastGroup: string | null = null;
  return (
    <dialog
      ref={dialogRef}
      className="palette"
      aria-label="Search and commands"
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <div className="palette__frame" onKeyDown={onKeyDown}>
        <div className="palette__input">
          <Search size={15} strokeWidth={1.8} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              if (event.target.value.trim().length < 2) setHits([]);
            }}
            placeholder="Search records, or type where to go…"
            aria-label="Search records and commands"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="keycap" aria-hidden="true">
            esc
          </kbd>
        </div>
        <ul className="palette__list" role="listbox" aria-label="Results">
          {visible.length === 0 && (
            <li className="palette__empty" aria-live="polite">
              {searching
                ? "Searching…"
                : needle.length < 2
                  ? "Type two letters to search records."
                  : "Nothing matches. Try a name, an email or a firm."}
            </li>
          )}
          {visible.map((command, index) => {
            const heading = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            const Icon = command.icon ?? ArrowRight;
            return (
              <li key={command.id} className="palette__item-wrap">
                {heading && <p className="palette__group">{heading}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className="palette__item"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(command)}
                >
                  <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                  <span className="palette__text">
                    <span className="palette__title">{command.title}</span>
                    {command.subtitle && (
                      <span className="palette__subtitle">{command.subtitle}</span>
                    )}
                  </span>
                  {command.keys && (
                    <kbd className="keycap keycap--quiet" aria-hidden="true">
                      {command.keys}
                    </kbd>
                  )}
                </button>
              </li>
            );
          })}
          {searching && visible.length > 0 && (
            <li className="palette__searching" aria-live="polite">
              Searching records…
            </li>
          )}
        </ul>
        <div className="palette__foot">
          <span>
            <kbd className="keycap">↑</kbd>
            <kbd className="keycap">↓</kbd> move
          </span>
          <span>
            <kbd className="keycap">↵</kbd> open
          </span>
          <span>
            <kbd className="keycap">g</kbd> then a letter jumps
          </span>
        </div>
      </div>
    </dialog>
  );
}
