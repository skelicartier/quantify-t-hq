import { DataTable } from "@/components/ui/data-table";
import { Timestamp } from "@/components/ui/timestamp";
import { EDIT_VERBS } from "@/lib/data/labels-money";

type EditLine = {
  n: number;
  verb: string;
  changes: { field: string; before: string; after: string }[];
  by: { name: string };
  at: string;
};

type MoneyEvent = {
  event_id: string;
  verb: string;
  fields: string[];
  by: { name: string };
  at: string;
};

/**
 * A finance record's edit log (ws-notes/duties/spec.md §8.6): one row a changed field, newest
 * line first — When · Who · What changed · From · To — with each line's number, so a line
 * named on Checks can be found. Never truncated.
 */
export function EditHistory({
  caption,
  edits,
  now,
}: {
  caption: string;
  edits: readonly EditLine[];
  now: number;
}) {
  const rows = [...edits]
    .reverse()
    .flatMap((line) =>
      (line.changes.length ? line.changes : [{ field: "", before: "", after: "" }]).map(
        (change, index) => ({ line, change, first: index === 0 }),
      ),
    );
  return (
    <DataTable
      caption={caption}
      columns={[
        { key: "when", label: "When" },
        { key: "who", label: "Who" },
        { key: "what", label: "What changed" },
        { key: "from", label: "From" },
        { key: "to", label: "To" },
      ]}
      columnMenu={false}
      isEmpty={rows.length === 0}
      empty={<p className="timeline-empty">No change is recorded yet.</p>}
    >
      {rows.map(({ line, change, first }) => (
        <tr
          key={`${line.n}-${change.field}`}
          className={first ? "hqdata-money-edit--first" : undefined}
        >
          <td className="nowrap">
            {first ? (
              <>
                <Timestamp value={line.at} now={now} mode="absolute" />
                <span className="table-sub">
                  Line {line.n} · {EDIT_VERBS[line.verb] ?? line.verb}
                </span>
              </>
            ) : null}
          </td>
          <td>{first ? line.by.name : ""}</td>
          <td>{change.field}</td>
          <td className="hqdata-money-wrap">{change.before || <span className="quiet">—</span>}</td>
          <td className="hqdata-money-wrap">{change.after || <span className="quiet">—</span>}</td>
        </tr>
      ))}
    </DataTable>
  );
}

/** What happened to a record, newest first: field names only (the values are in Edit history). */
export function MoneyActivity({ events, now }: { events: readonly MoneyEvent[]; now: number }) {
  if (events.length === 0) return <p className="timeline-empty">Nothing has happened yet.</p>;
  return (
    <ol className="timeline">
      {events.map((event) => (
        <li key={event.event_id} className="timeline__item">
          <span className="timeline__kind">{EDIT_VERBS[event.verb] ?? event.verb}</span>
          <div>
            <p className="timeline__meta">
              <span className="timeline__actor">{event.by.name}</span>
              <Timestamp value={event.at} now={now} mode="relative" />
            </p>
            {event.fields.length > 0 && <p className="timeline__body">{event.fields.join(", ")}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
