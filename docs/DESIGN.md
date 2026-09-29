# HQ — the operations console

The portal is a tool people run all day: a desk, a pipeline, a book of firms and the
team behind them. It is designed like the best of that class — an issue tracker's
density and keyboard flow, a modern CRM's records and lists, a support inbox's three
panes, a terminal's readouts — on Quantify Terminal's own palette. It is not a
dashboard template. This file is the contract every screen is held to.

## 1. Principles

1. **Work surface first.** Chrome is an inverted L: a slim rail on the left, a 44px
   context bar on top. Everything else is the page. No footer, no hero, no
   description paragraph under a title. What a page is for is said once, in its empty
   state or behind the "About" disclosure, never above the data.
2. **Dense but calm.** 13px in lists, 14px in prose, 12px mono for identifiers and
   figures. Rows are 36px (two-line rows 48px). Structure comes from hairlines and
   alignment, not boxes: one row separator, no card borders around tables, numbers
   right-aligned in tabular figures.
3. **Keyboard is a first-class citizen.** ⌘K opens the command palette from anywhere;
   `g` then a letter goes to a surface; `j`/`k` move through a list, `Enter` opens,
   `x` selects; `/` focuses search; `?` shows the shortcuts. Every shortcut is printed
   where it applies.
4. **Progressive disclosure.** Summary first, drill-down on demand. Hover reveals row
   actions; selection reveals the bulk bar; a click on a value edits it in place.
5. **Honest states.** A read that failed says so and is never an empty list. Money a
   role may not see is a dash, never zero. Times say UTC where they are UTC.
6. **The palette is the brand; the structure is the craft.** Near-black surfaces, warm
   hairlines, amber as the one accent, green / red / cyan as signals, Space Grotesk
   for titles, JetBrains Mono for data. Nothing else is coloured.

## 2. Tokens

| Token                         | Value                     | Use                                      |
| ----------------------------- | ------------------------- | ---------------------------------------- |
| `--rail` / `--rail-collapsed` | 232px / 56px              | left rail, expanded and icon-only        |
| `--bar`                       | 44px                      | context bar height                       |
| `--row`                       | 36px                      | list row height (48px for two-line rows) |
| `--fs-ui`                     | 13px                      | lists, controls, chips                   |
| `--fs-body`                   | 14px                      | prose                                    |
| `--fs-mono`                   | 12px                      | identifiers, timestamps, figures         |
| `--fs-label`                  | 10.5px                    | mono uppercase labels, 0.12em tracking   |
| spacing                       | 4 · 8 · 12 · 16 · 24 · 32 | the only gaps used                       |
| radius                        | 0                         | everywhere                               |

Colours are the console tokens (`--bg`, `--surface`, `--panel`, `--panel-raised`,
`--line*`, `--text`, `--muted`, `--quiet`, `--accent`, `--success`, `--danger`,
`--info`). Light theme keeps the same structure.

## 3. Chrome

**Rail.** Brand mark, the ⌘K search button (prints its shortcut), grouped navigation
(labels in mono caps, 11.5px; icons 16px), collapsible to icons only (persisted per
device), identity at the foot as a menu: theme, My security, sign out. On phones the
rail is an overlay behind a menu button.

**Context bar.** Rail toggle, breadcrumb (`Section › Page`), then on the right: the
page's live-refresh state, the UTC clock, the theme switch, `?`.

**Page bar.** One row: title (20px Space Grotesk), inline meta (a status pill, a count,
a live indicator), actions on the right (one primary, the rest quiet). An optional
"About" disclosure holds the sentence that used to be a description.

**Readout strip.** Figures in one unboxed line under the page bar: mono label above,
20px tabular value, hairline between readouts. Danger colours the value; nothing else
is coloured.

## 4. Lists

A `ListView` is: toolbar → table → selection bar.

- **Toolbar:** quick search (`/`), filter chips (each removable), view tabs (saved
  filters as URL states), sort, density, columns, then the primary action.
- **Table:** sticky quiet header with sort chevrons; 36px rows; text left, numbers and
  money right in tabular figures; status as a dot-and-word pill; the row's title is the
  link; secondary text 11.5px under it; row hover reveals actions on the right; the
  focused row has a ring, the selected row a tint.
- **Selection bar:** replaces the toolbar in place with the count and the bulk actions.
- **Keyboard:** `j`/`k` move, `Enter` opens, `x` toggles selection, `Escape` clears.
- **Empty and failed:** an empty state names the next act; a failed read is a callout.

## 5. Records

A `RecordShell` is: header → tabs → body + properties.

- **Header:** breadcrumb, name, status pill, three inline readouts, primary action and
  an overflow menu. Sticky under the context bar.
- **Tabs:** Overview · Activity · (Deals · People · Tasks · Contracts as the record has
  them). URL-addressed (`?tab=`).
- **Properties panel** (right, 320px): every attribute as label → value; click the
  value to edit in place, `Enter` saves, `Escape` cancels; selects for owner, source,
  lifecycle; the panel says who edited last.
- **Timeline:** compact rows — kind icon, author, relative time, body; the composer is
  a single line that expands on focus, with kind tabs.

## 6. The desk

Three panes: queue (320px) · conversation · context (300px).

- **Queue:** sections Open / Waiting / Later / Done as tabs, search, then rows: unread
  dot, subject, requester, snippet, SLA chip, assignee initials. `j`/`k`/`Enter`.
- **Conversation:** compact header with status, priority, assignee, tags and the SLA
  countdown, each editable inline; messages as a thread with internal notes on an
  amber wash; the composer docked at the bottom with Reply / Note tabs, a saved-reply
  picker, snooze presets, and Send · Send and resolve.
- **Context:** tabs Customer · Account · History; the firm's plan, seats, version, open
  deals and other tickets.
- **Keys:** `r` reply, `n` note, `a` assign, `s` snooze, `e` resolve.

## 7. Deals

The board: a column per stage with count, MRR and weighted MRR in the header; cards
with company, value, seats, next step and date, owner initials, days in stage; flags
as red text. Cards drag between stages; the drop opens the next-step dialog the stage
requires. Table view is a ListView grouped by stage.

## 8. Home

A briefing, not a grid of cards: the "Owed now" queue (first replies overdue, timers
breaching, tasks due, outcomes owed) in one prioritised list on the left; the day's
readouts and meetings on the right. Every row is one keystroke from its record.

## 9. Settings

One settings layout: a left sub-navigation (General · Pipeline · SLA · Sources ·
Integrations · Staff · Audit · Danger) and the section on the right.

## 10. Charts

Charts summarise the table beneath them, never replace it: hairline grids, one
accent series, muted comparison series, tabular axis labels, a legend in words.

## 11. What is never done

Vendor or provider names in copy. A coloured bar or rule down one side of anything — a nav item, a row, a card, a note, a banner: a state is a tint, a full thin border, a pill or words. Colour as the only signal. Truncated data columns
(only a declared prose column may elide, with the full text a hover away). A figure the
role may not see rendered as 0. An empty list standing in for a failed read.
