"use client";

import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Clock,
  Contact,
  FileSignature,
  FileText,
  Handshake,
  Inbox,
  Keyboard,
  LifeBuoy,
  ListChecks,
  Moon,
  Plus,
  Receipt,
  Search,
  StickyNote,
  Sun,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { visibleNavLinks } from "@/components/shell/nav-links";
import { PALETTE_OPEN_EVENT, isTypingTarget, openShortcuts } from "@/components/shell/palette-bus";
import { useHqTheme } from "@/components/shell/theme-scope";
import type { SearchHit, ViewedHit } from "@/app/(portal)/_actions/search";
import { setSingleKeys, singleKeysOn, useSingleKeys } from "@/lib/prefs/single-keys";

type Command = {
  id: string;
  group: "Recent" | "Recently viewed" | "Records" | "Create" | "Go to" | "Actions";
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
  meeting: CalendarDays,
  task: ListChecks,
  note: StickyNote,
  contract: FileSignature,
  invoice: Receipt,
  quote: FileText,
  article: BookOpen,
};

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  company: "Company",
  person: "Person",
  lead: "Lead",
  deal: "Deal",
  ticket: "Ticket",
  meeting: "Meeting",
  task: "Task",
  note: "Note",
  contract: "Contract",
  invoice: "Invoice",
  quote: "Quote",
  article: "Help article",
};

/** What ⌘K can make, for a role that writes the CRM: each opens its page's own form. */
const CREATE: Array<{ id: string; title: string; href: string; where: string }> = [
  { id: "company", title: "New company", href: "/companies?new=1", where: "Companies" },
  { id: "person", title: "New person", href: "/people?new=1", where: "People" },
  { id: "lead", title: "New lead", href: "/leads?new=1", where: "Leads" },
  { id: "meeting", title: "Log a meeting", href: "/meetings?new=1", where: "Meetings" },
  { id: "task", title: "New task", href: "/tasks?new=1", where: "Tasks" },
];

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
  recent: () => Promise<ViewedHit[]>;
};

/**
 * ⌘K. Before typing: what you opened lately, what you can make, where you can go. Typing:
 * every kind of record the role reads — names, notes, tasks, meetings, money, help — with
 * the full results page one row away. Opens 15% from the top, one input, grouped rows,
 * keycaps on the right; Backspace on an empty query closes nothing — Escape does.
 */
export function CommandPalette({ capabilities, search, recent }: CommandPaletteProps) {
  const router = useRouter();
  const { theme, setTheme } = useHqTheme();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [viewed, setViewed] = useState<ViewedHit[]>([]);
  const singleKeys = useSingleKeys();
  const [searching, startSearch] = useTransition();
  const latestQuery = useRef("");

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setQuery("");
    setHits([]);
    setActive(0);
    setRecents(readRecents());
    // What they opened lately arrives a moment after the palette does; it never blocks it.
    void recent()
      .then(setViewed)
      .catch(() => setViewed([]));
    dialog.showModal();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [recent]);

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
      if (
        event.key === "/" &&
        singleKeysOn() &&
        !isTypingTarget(event.target) &&
        !dialogRef.current?.open
      ) {
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

  const navLinks = useMemo(() => visibleNavLinks(capabilities), [capabilities]);

  const canCreate = capabilities.includes("crm:write");
  const typed = query.trim();

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
    };
    const records: Command[] = [];
    if (typed.length >= 2) {
      records.push({
        id: `all:${typed}`,
        group: "Records",
        title: `See all results for “${typed}”`,
        subtitle: "Notes, tasks, meetings, money and help as well",
        icon: Search,
        run: go(`/search?q=${encodeURIComponent(typed)}`),
      });
    }
    for (const hit of hits) {
      records.push({
        id: `rec:${hit.kind}:${hit.id}`,
        group: "Records",
        title: hit.title,
        subtitle: `${KIND_LABEL[hit.kind]}${hit.subtitle ? ` · ${hit.subtitle}` : ""}`,
        icon: KIND_ICON[hit.kind],
        run: go(hit.href),
      });
    }
    const lately: Command[] =
      typed.length >= 2
        ? []
        : viewed.slice(0, 5).map((hit) => ({
            id: `viewed:${hit.kind}:${hit.id}`,
            group: "Recently viewed" as const,
            title: hit.title,
            subtitle: KIND_LABEL[hit.kind],
            icon: Clock,
            run: go(hit.href),
          }));
    const create: Command[] = canCreate
      ? CREATE.map((item) => ({
          id: `new:${item.id}`,
          group: "Create" as const,
          title: item.title,
          subtitle: `Opens the form on ${item.where}`,
          icon: Plus,
          run: go(item.href),
        }))
      : [];
    const navigation: Command[] = navLinks.map((link) => ({
      id: `go:${link.href}`,
      group: "Go to" as const,
      title: link.label,
      keys: link.key && singleKeys ? `g ${link.key}` : undefined,
      icon: link.icon,
      run: go(link.href),
    }));
    const actions: Command[] = [
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
        keys: singleKeys ? "?" : undefined,
        icon: Keyboard,
        run: () => openShortcuts(),
      },
      {
        id: "act:single-keys",
        group: "Actions",
        title: singleKeys ? "Turn single-key shortcuts off" : "Turn single-key shortcuts on",
        subtitle: "For speech input, or keys pressed by accident; ⌘K always works",
        icon: Keyboard,
        run: () => setSingleKeys(!singleKeys),
      },
    ];
    // Typing puts what was found first; before typing, what was opened lately.
    return typed.length >= 2
      ? [...records, ...navigation, ...create, ...actions]
      : [...lately, ...create, ...navigation, ...actions];
  }, [navLinks, hits, viewed, typed, canCreate, singleKeys, theme, setTheme, router]);

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

  // Consecutive commands of one group render as one group of options.
  const sections: Array<{ name: string; items: Array<{ command: Command; index: number }> }> = [];
  visible.forEach((command, index) => {
    const last = sections[sections.length - 1];
    if (last && last.name === command.group) last.items.push({ command, index });
    else sections.push({ name: command.group, items: [{ command, index }] });
  });
  const listId = "palette-results";
  const optionId = (index: number) => `palette-option-${index}`;
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
            role="combobox"
            aria-expanded={visible.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={visible.length ? optionId(activeIndex) : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              if (event.target.value.trim().length < 2) setHits([]);
            }}
            placeholder="Search everything, or type where to go…"
            aria-label="Search everything and commands"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="keycap" aria-hidden="true">
            esc
          </kbd>
        </div>
        {visible.length === 0 ? (
          <p className="palette__empty" aria-live="polite">
            {searching
              ? "Searching…"
              : needle.length < 2
                ? "Type two letters to search records."
                : "Nothing matches. Try a name, an address, a firm or words from a note."}
          </p>
        ) : (
          // The grouped listbox of the WAI-ARIA practices: focus stays in the input, which
          // moves the active option; a pointer picks one directly.
          <div id={listId} role="listbox" aria-label="Results" className="palette__list">
            {sections.map((section, sectionIndex) => (
              <ul
                key={`${section.name}-${sectionIndex}`}
                role="group"
                aria-labelledby={`palette-group-${sectionIndex}`}
                className="palette__section"
              >
                <li
                  role="presentation"
                  id={`palette-group-${sectionIndex}`}
                  className="palette__group"
                >
                  {section.name}
                </li>
                {section.items.map(({ command, index }) => {
                  const Icon = command.icon ?? ArrowRight;
                  return (
                    <li
                      key={command.id}
                      id={optionId(index)}
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
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
        )}
        {searching && visible.length > 0 && (
          <p className="palette__searching" aria-live="polite">
            Searching records…
          </p>
        )}
        <div className="palette__foot">
          <span>
            <kbd className="keycap">↑</kbd>
            <kbd className="keycap">↓</kbd> move
          </span>
          <span>
            <kbd className="keycap">↵</kbd> open
          </span>
          {singleKeys && (
            <span>
              <kbd className="keycap">g</kbd> then a letter jumps
            </span>
          )}
        </div>
      </div>
    </dialog>
  );
}
