import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { ActionsTable } from "@/components/data/notes/actions-table";
import { FaqFields, counted } from "@/components/data/notes/note-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import {
  readActions,
  readFaq,
  readNotes,
  type ActionsPage,
  type FaqPage,
  type FaqRow,
  type NoteRow,
  type NotesPage,
} from "@/lib/data/api/notes";
import { NOTES_VIEWS, NOTE_KINDS, NOTE_SUBJECTS } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { boundedInteger, firstSearchValue } from "@/lib/search-params";

import "@/components/data/notes/notes.css";
import { actionStateAction, addFaqAction, updateFaqAction } from "./actions";

export const metadata = { title: "Notes" };
export const dynamic = "force-dynamic";

const BASE = "/data/notes";
const PAGE_SIZE = 100;
const ABOUT =
  "Notes from calls, meetings and emails with investor firms and waitlist firms, with what they objected to and what you owe them. Kept on this computer. Write a note from the firm's own page.";

const NOTE_COLUMNS = [
  { key: "held", label: "Held on" },
  { key: "firm", label: "Firm" },
  { key: "note", label: "Note", width: "38%" },
  { key: "objections", label: "Objections", align: "end" as const },
  { key: "actions", label: "Open actions", align: "end" as const },
  { key: "by", label: "By" },
];

const FAQ_COLUMNS = [
  { key: "question", label: "Question", width: "26%" },
  { key: "answer", label: "Answer", width: "36%" },
  { key: "asked", label: "Asked" },
  { key: "changed", label: "Changed" },
  { key: "change", label: "Change", align: "end" as const },
];

type View = keyof typeof NOTES_VIEWS;
type Params = Record<string, string | string[] | undefined>;

/** The Notes view's filters, as the page's links carry them. */
type Filters = {
  kind: string;
  q: string;
  withdrawn: boolean;
  subject_kind: string;
  subject_id: string;
};

function notesHref(change: Partial<Filters> & { offset?: number }, current: Filters): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  if (next.subject_kind && next.subject_id) {
    params.set("subject_kind", next.subject_kind);
    params.set("subject_id", next.subject_id);
  }
  if (next.kind) params.set("kind", next.kind);
  if (next.q) params.set("q", next.q);
  if (next.withdrawn) params.set("withdrawn", "1");
  if (change.offset) params.set("offset", String(change.offset));
  const rendered = params.toString();
  return `${BASE}${rendered ? `?${rendered}` : ""}`;
}

export default async function NotesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const now = requestNow();
  const parameters = await searchParams;
  const askedView = firstSearchValue(parameters.view) ?? "notes";
  const view: View = askedView in NOTES_VIEWS ? (askedView as View) : "notes";
  const askedKind = firstSearchValue(parameters.kind) ?? "";
  const subjectKind = firstSearchValue(parameters.subject_kind) ?? "";
  const filters: Filters = {
    kind: askedKind in NOTE_KINDS ? askedKind : "",
    q: (firstSearchValue(parameters.q) ?? "").slice(0, 200),
    withdrawn: firstSearchValue(parameters.withdrawn) === "1",
    subject_kind: subjectKind in NOTE_SUBJECTS ? subjectKind : "",
    subject_id: (firstSearchValue(parameters.subject_id) ?? "").slice(0, 64),
  };
  const askedState = firstSearchValue(parameters.state) ?? "open";
  const state = askedState === "done" || askedState === "all" ? askedState : "open";
  const archived = firstSearchValue(parameters.archived) === "1";
  const offset = boundedInteger(firstSearchValue(parameters.offset), 0, 200_000);
  const filtered =
    view === "notes" &&
    Boolean(filters.kind || filters.q || filters.withdrawn || filters.subject_id || offset);
  const read = allowed
    ? await dataRead(async () => {
        const [all, notes, actions, faq] = await Promise.all([
          readNotes(),
          filtered
            ? readNotes({
                kind: filters.kind,
                q: filters.q,
                withdrawn: filters.withdrawn,
                subject_kind: filters.subject_kind,
                subject_id: filters.subject_id,
                offset,
              })
            : Promise.resolve(null),
          readActions(view === "actions" ? state : "open", view === "actions" ? offset : 0),
          view === "faq" ? readFaq({ archived }) : Promise.resolve(null),
        ]);
        return { all, notes: notes ?? all, actions, faq };
      })
    : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Notes"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {counted(data.all.counts.all ?? 0, "note")} ·{" "}
              {counted(data.actions.counts.open, "open action")}
            </span>
          ) : undefined
        }
        actions={
          data ? (
            <ButtonLink href="/data/decisions?new=1" size="small">
              Record a decision
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-notes">
            <SegmentedLinks
              label="View"
              items={[
                { href: BASE, label: NOTES_VIEWS.notes, current: view === "notes" },
                {
                  href: `${BASE}?view=actions`,
                  label: NOTES_VIEWS.actions,
                  current: view === "actions",
                },
                { href: `${BASE}?view=faq`, label: NOTES_VIEWS.faq, current: view === "faq" },
              ]}
            />
            {view === "notes" && (
              <NotesView
                page={read.data.notes}
                filters={filters}
                anyNotes={(read.data.all.counts.all ?? 0) > 0}
              />
            )}
            {view === "actions" && <ActionsView page={read.data.actions} state={state} now={now} />}
            {view === "faq" && read.data.faq && (
              <FaqView page={read.data.faq} archived={archived} now={now} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ notes

/** The body's first line, for the row's second line. */
const firstLine = (body: string) =>
  body
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.trim() ?? "";

function NotesView({
  page,
  filters,
  anyNotes,
}: {
  page: NotesPage;
  filters: Filters;
  anyNotes: boolean;
}) {
  const offset = page.offset;
  const last = offset + page.notes.length;
  const firm = filters.subject_id ? (page.notes[0]?.subject_name ?? "") : "";
  const narrowed = Boolean(filters.kind || filters.q || filters.subject_id);
  return (
    <>
      {filters.subject_id && (
        <p className="page-note">
          {firm ? `Notes on ${firm} only.` : "Notes on one firm only."}{" "}
          <Link
            className="text-link"
            href={notesHref({ subject_kind: "", subject_id: "" }, filters)}
          >
            Every firm
          </Link>
        </p>
      )}
      <div className="hqdata-notes-tools">
        <SegmentedLinks
          label="Kind"
          items={[
            {
              href: notesHref({ kind: "" }, filters),
              label: `All ${formatNumber(page.counts.all ?? 0)}`,
              current: !filters.kind,
            },
            ...Object.entries(NOTE_KINDS).map(([key, label]) => ({
              href: notesHref({ kind: key }, filters),
              label: `${label} ${formatNumber(page.counts[key] ?? 0)}`,
              current: filters.kind === key,
            })),
          ]}
        />
        <form className="filter-strip__search merge-search" action={BASE} role="search">
          {filters.kind && <input type="hidden" name="kind" value={filters.kind} />}
          {filters.withdrawn && <input type="hidden" name="withdrawn" value="1" />}
          {filters.subject_id && (
            <>
              <input type="hidden" name="subject_kind" value={filters.subject_kind} />
              <input type="hidden" name="subject_id" value={filters.subject_id} />
            </>
          )}
          <label className="sr-only" htmlFor="notes-q">
            Search notes
          </label>
          <input
            id="notes-q"
            className="input input--small"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={filters.q}
            placeholder="Firm, title, words or who was there"
          />
          <button className="btn btn--small" type="submit">
            Find
          </button>
          {filters.q && (
            <ButtonLink href={notesHref({ q: "" }, filters)} size="small" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
        <Link
          className="text-link hqdata-notes-tools__link"
          href={notesHref({ withdrawn: !filters.withdrawn }, filters)}
        >
          {filters.withdrawn ? "Hide taken-back notes" : "Show taken-back notes"}
        </Link>
      </div>
      <p className="hqdata-print-only">
        {filters.kind ? `Kind: ${NOTE_KINDS[filters.kind as NoteRow["kind"]]}` : "Every kind"}
        {filters.q ? ` · Search: “${filters.q}”` : ""}
        {filters.withdrawn ? " · Taken-back notes shown" : ""}
      </p>
      <DataTable
        caption="Notes"
        columns={NOTE_COLUMNS}
        columnMenu={false}
        isEmpty={page.notes.length === 0}
        empty={
          anyNotes || narrowed ? (
            <EmptyState compact title="No note matches" description="Try fewer words, or All." />
          ) : (
            <EmptyState
              compact
              title="No notes yet"
              description="Add one from an investor's or a waitlist firm's page."
            />
          )
        }
      >
        {page.notes.map((note) => (
          <NoteLine key={note.note_id} note={note} today={page.today} />
        ))}
      </DataTable>
      {page.total > PAGE_SIZE && (
        <nav className="pagination" aria-label="Pagination">
          <span className="toolbar__summary">
            {formatNumber(offset + 1)}–{formatNumber(last)} of {formatNumber(page.total)}
          </span>
          {offset > 0 && (
            <ButtonLink
              size="small"
              href={notesHref({ offset: Math.max(0, offset - PAGE_SIZE) }, filters)}
            >
              Previous
            </ButtonLink>
          )}
          {last < page.total && (
            <ButtonLink size="small" href={notesHref({ offset: offset + PAGE_SIZE }, filters)}>
              Next
            </ButtonLink>
          )}
        </nav>
      )}
    </>
  );
}

function NoteLine({ note, today }: { note: NoteRow; today: string }) {
  const line = firstLine(note.body);
  const overdue = note.actions.some(
    (item) => item.state === "open" && item.due_on !== null && item.due_on < today,
  );
  return (
    <tr
      id={`note-${note.note_id}`}
      className={note.withdrawn ? "hqdata-notes__row--withdrawn" : undefined}
    >
      <td className="nowrap">{formatDate(note.held_on)}</td>
      <td>
        <Link className="text-link" href={note.href}>
          {note.subject_name}
        </Link>
        <span className="table-sub">{NOTE_SUBJECTS[note.subject.kind]}</span>
      </td>
      <td>
        <Link className="table-title" href={`/data/notes/${note.note_id}`}>
          {note.title}
        </Link>
        <span className="table-sub">
          {NOTE_KINDS[note.kind]}
          {note.withdrawn && (
            <>
              {" · "}
              <StatusPill value="withdrawn" label="Taken back" tone="neutral" />
            </>
          )}
        </span>
        {line && (
          <span className="table-sub table-sub--prose" title={line}>
            {line}
          </span>
        )}
      </td>
      <td className="data-table__num">{formatNumber(note.objections.length)}</td>
      <td className="data-table__num">
        {overdue ? (
          <StatusPill
            value="overdue"
            label={`${formatNumber(note.open_actions)} · overdue`}
            tone="attention"
          />
        ) : (
          formatNumber(note.open_actions)
        )}
      </td>
      <td>{note.created_by.name}</td>
    </tr>
  );
}

// ------------------------------------------------------------------ actions

function ActionsView({
  page,
  state,
  now,
}: {
  page: ActionsPage;
  state: "open" | "done" | "all";
  now: number;
}) {
  const offset = page.offset ?? 0;
  const last = offset + page.actions.length;
  const href = (to: string, at = 0) =>
    `${BASE}?view=actions${to !== "open" ? `&state=${to}` : ""}${at ? `&offset=${at}` : ""}`;
  return (
    <>
      <SegmentedLinks
        label="Which actions"
        items={[
          {
            href: href("open"),
            label: `Open ${formatNumber(page.counts.open)}`,
            current: state === "open",
          },
          {
            href: href("done"),
            label: `Done ${formatNumber(page.counts.done)}`,
            current: state === "done",
          },
          { href: href("all"), label: "All", current: state === "all" },
        ]}
      />
      <p className="hqdata-print-only">
        {state === "open" ? "Open actions" : state === "done" ? "Done actions" : "Every action"}
      </p>
      {page.actions.length === 0 ? (
        state === "done" ? (
          <EmptyState
            compact
            title="Nothing done yet"
            description="An action marked Done moves here."
          />
        ) : (
          <EmptyState
            compact
            title="No open actions"
            description="Actions you write on a note land here and on Due."
          />
        )
      ) : (
        <ActionsTable
          caption="Actions"
          rows={page.actions}
          today={page.today}
          now={now}
          path=""
          setState={actionStateAction}
          showFrom
        />
      )}
      {page.total > PAGE_SIZE && (
        <nav className="pagination" aria-label="Pagination">
          <span className="toolbar__summary">
            {formatNumber(offset + 1)}–{formatNumber(last)} of {formatNumber(page.total)}
          </span>
          {offset > 0 && (
            <ButtonLink size="small" href={href(state, Math.max(0, offset - PAGE_SIZE))}>
              Previous
            </ButtonLink>
          )}
          {last < page.total && (
            <ButtonLink size="small" href={href(state, offset + PAGE_SIZE)}>
              Next
            </ButtonLink>
          )}
        </nav>
      )}
    </>
  );
}

// ------------------------------------------------------------------ the Investor FAQ

function askedWords(entry: FaqRow): string {
  if (entry.asked === 0) return "Not linked yet";
  return `${counted(entry.asked, "time")} by ${counted(entry.firms, "firm")}`;
}

function FaqView({ page, archived, now }: { page: FaqPage; archived: boolean; now: number }) {
  return (
    <>
      <div className="hqdata-notes-tools">
        <Popover label="Add a question" variant="primary" align="start" width="wide">
          <MailForm action={addFaqAction} submitLabel="Add it" pendingLabel="Adding…">
            <FaqFields prefix="faq-new" />
          </MailForm>
        </Popover>
        <Link
          className="text-link hqdata-notes-tools__link"
          href={archived ? `${BASE}?view=faq` : `${BASE}?view=faq&archived=1`}
        >
          {archived ? "Hide archived questions" : "Show archived questions"}
        </Link>
      </div>
      <p className="page-note">
        Your answers to what investors ask, so each answer is the same every time.
      </p>
      <DataTable
        caption="Investor FAQ"
        columns={FAQ_COLUMNS}
        columnMenu={false}
        scroll={false}
        isEmpty={page.entries.length === 0}
        empty={
          <EmptyState
            compact
            title="No questions yet"
            description="Add one, or answer an objection from a note's page."
          />
        }
      >
        {page.entries.map((entry) => (
          <FaqLine key={entry.faq_id} entry={entry} now={now} />
        ))}
      </DataTable>
    </>
  );
}

function FaqLine({ entry, now }: { entry: FaqRow; now: number }) {
  const live = entry.archived === null;
  const short = entry.faq_id.slice(0, 8);
  return (
    <tr id={`faq-${entry.faq_id}`} className={live ? undefined : "hqdata-notes__row--withdrawn"}>
      <td>
        <span className="table-title">{entry.question}</span>
        {!live && <span className="table-sub">Archived</span>}
      </td>
      <td>
        {entry.answer ? (
          <span className="table-sub table-sub--prose" title={entry.answer}>
            {entry.answer}
          </span>
        ) : (
          <span className="table-sub">No answer yet</span>
        )}
      </td>
      <td>{askedWords(entry)}</td>
      <td className="nowrap">
        <Timestamp value={entry.updated_at} now={now} mode="relative" />
      </td>
      <td>
        <div className="hqdata-notes__acts">
          {live ? (
            <Popover label="Edit" align="end" width="wide">
              <MailForm
                action={updateFaqAction}
                fields={{ faq_id: entry.faq_id }}
                submitLabel="Save"
                pendingLabel="Saving…"
              >
                <FaqFields
                  prefix={`faq-${short}`}
                  question={entry.question}
                  answer={entry.answer}
                />
              </MailForm>
              <RowAction
                action={updateFaqAction}
                fields={{ faq_id: entry.faq_id, to: "archive" }}
                buttons={[
                  {
                    label: "Archive",
                    className: "btn btn--small btn--ghost",
                    ariaLabel: `Archive: ${entry.question}`,
                    pendingLabel: "Archiving…",
                  },
                ]}
              />
            </Popover>
          ) : (
            <RowAction
              action={updateFaqAction}
              fields={{ faq_id: entry.faq_id, to: "restore" }}
              buttons={[
                {
                  label: "Restore",
                  className: "btn btn--small btn--ghost",
                  ariaLabel: `Restore: ${entry.question}`,
                  pendingLabel: "Restoring…",
                },
              ]}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
