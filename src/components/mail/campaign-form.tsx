"use client";

import { useActionState, useMemo, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import { applyMapping, guessMapping, parseCsv, type CsvTable } from "@/lib/crm/csv";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;
type Option = { id: string; name: string; sub: string };
type AudienceKind = "segment" | "list" | "companies" | "people" | "leads" | "csv";

const CSV_FIELDS = [
  { key: "email", label: "Email", aliases: ["e-mail", "email address", "mail", "work email"] },
  { key: "full_name", label: "Full name", aliases: ["name", "contact", "contact name"] },
  { key: "first_name", label: "First name", aliases: ["first", "given name", "forename"] },
  { key: "last_name", label: "Last name", aliases: ["last", "surname", "family name"] },
  {
    key: "company",
    label: "Company",
    aliases: ["company name", "firm", "organisation", "organization", "account"],
  },
  { key: "title", label: "Title", aliases: ["job title", "role", "position"] },
  { key: "country", label: "Country", aliases: ["location", "hq country"] },
] as const;

const KIND_LABELS: Record<AudienceKind, string> = {
  segment: "A saved segment",
  list: "A saved list",
  companies: "Everyone at chosen companies",
  people: "Chosen people",
  leads: "Chosen leads",
  csv: "A CSV file",
};

export type CampaignInitial = {
  campaign_id?: string;
  name?: string;
  sender_id?: string;
  template_id?: string;
  topic?: string;
  audience_kind?: AudienceKind;
  segment_id?: string;
  list_id?: string;
  ids?: string[];
  send_anytime?: boolean;
  dry_run?: boolean;
};

/**
 * Who a campaign goes to and what it says. The audience is chosen here and frozen when
 * the campaign is scheduled; the next page shows who is eligible, who is skipped and why,
 * before anything can be sent.
 */
export function CampaignForm({
  action,
  senders,
  templates,
  topics,
  segments,
  lists = [],
  companies,
  people,
  leads,
  initial = {},
  submitLabel,
}: {
  action: Action;
  senders: readonly { id: string; label: string; verified: boolean }[];
  templates: readonly { id: string; label: string }[];
  topics: readonly { key: string; label: string }[];
  segments: readonly { id: string; label: string }[];
  lists?: readonly { id: string; label: string }[];
  companies: readonly Option[];
  people: readonly Option[];
  leads: readonly Option[];
  initial?: CampaignInitial;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const [kind, setKind] = useState<AudienceKind>(
    initial.audience_kind ?? (segments.length ? "segment" : "companies"),
  );
  const [chosen, setChosen] = useState<Record<AudienceKind, string[]>>({
    segment: [],
    list: [],
    companies: initial.audience_kind === "companies" ? (initial.ids ?? []) : [],
    people: initial.audience_kind === "people" ? (initial.ids ?? []) : [],
    leads: initial.audience_kind === "leads" ? (initial.ids ?? []) : [],
    csv: [],
  });
  const [needle, setNeedle] = useState("");
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const options =
      kind === "companies" ? companies : kind === "people" ? people : kind === "leads" ? leads : [];
    const text = needle.trim().toLowerCase();
    const list = text
      ? options.filter((option) => `${option.name} ${option.sub}`.toLowerCase().includes(text))
      : options;
    return list.slice(0, 300);
  }, [kind, companies, people, leads, needle]);
  const picked = new Set(chosen[kind]);
  const toggle = (id: string) => {
    const next = new Set(chosen[kind]);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen({ ...chosen, [kind]: [...next] });
  };

  const load = (text: string, name: string) => {
    const parsed = parseCsv(text);
    if (parsed.header.length === 0 || parsed.rows.length === 0) {
      setReadError("The file has no rows under its header.");
      setTable(null);
      return;
    }
    if (parsed.rows.length > 2000) {
      setReadError("At most 2,000 rows in one campaign; split the file.");
      setTable(null);
      return;
    }
    setReadError(null);
    setFileName(name);
    setTable(parsed);
    setMapping(guessMapping(parsed.header, CSV_FIELDS));
  };
  const csvRows = table ? applyMapping(table, mapping) : [];
  const csvWithEmail = csvRows.filter((row) => row.email);

  return (
    <form className="campaign-form" action={formAction}>
      <AttemptField state={state} />
      {initial.campaign_id && (
        <input type="hidden" name="campaign_id" value={initial.campaign_id} />
      )}
      <input type="hidden" name="audience_kind" value={kind} />
      <input type="hidden" name="audience_ids" value={JSON.stringify(chosen[kind])} />
      <input
        type="hidden"
        name="csv_rows"
        value={kind === "csv" ? JSON.stringify(csvWithEmail) : "[]"}
      />
      <input type="hidden" name="csv_label" value={fileName} />

      <section className="campaign-form__step" aria-labelledby="campaign-what">
        <h2 id="campaign-what" className="record-section__title">
          What goes out
        </h2>
        <div className="form-grid">
          <Field
            id="campaign-name"
            label="Name"
            hint="Staff-facing: recipients never see it."
            className="form-grid__span"
          >
            <Input
              id="campaign-name"
              name="name"
              defaultValue={initial.name ?? ""}
              maxLength={160}
              required
            />
          </Field>
          <Field
            id="campaign-template"
            label="Template"
            hint={templates.length ? undefined : "Write a campaign template first."}
          >
            <Select
              id="campaign-template"
              name="template_id"
              defaultValue={initial.template_id ?? templates[0]?.id ?? ""}
              required
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="campaign-sender"
            label="From"
            hint={senders.length ? undefined : "Add a marketing sender under Settings."}
          >
            <Select
              id="campaign-sender"
              name="sender_id"
              defaultValue={initial.sender_id ?? senders[0]?.id ?? ""}
              required
            >
              {senders.map((sender) => (
                <option key={sender.id} value={sender.id}>
                  {sender.label}
                  {sender.verified ? "" : " (not verified)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="campaign-topic"
            label="Topic"
            hint="People who turned a topic off are skipped."
          >
            <Select
              id="campaign-topic"
              name="topic"
              defaultValue={initial.topic ?? topics[0]?.key ?? "updates"}
            >
              {topics.map((topic) => (
                <option key={topic.key} value={topic.key}>
                  {topic.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section className="campaign-form__step" aria-labelledby="campaign-who">
        <h2 id="campaign-who" className="record-section__title">
          Who it goes to
        </h2>
        <div className="audience-kinds" role="radiogroup" aria-label="Audience">
          {(Object.keys(KIND_LABELS) as AudienceKind[]).map((option) => (
            <label
              key={option}
              className={`audience-kind${kind === option ? " audience-kind--on" : ""}`}
            >
              <input
                type="radio"
                name="audience_choice"
                value={option}
                checked={kind === option}
                onChange={() => {
                  setKind(option);
                  setNeedle("");
                }}
              />
              {KIND_LABELS[option]}
            </label>
          ))}
        </div>

        {kind === "segment" &&
          (segments.length ? (
            <Field
              id="campaign-segment"
              label="Segment"
              hint="Evaluated when the campaign is scheduled, so it reaches whoever matches then."
            >
              <Select
                id="campaign-segment"
                name="segment_id"
                defaultValue={initial.segment_id ?? segments[0]?.id ?? ""}
              >
                {segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="page-note">
              No segments yet. Build one under Segments, or choose people here.
            </p>
          ))}

        {kind === "list" &&
          (lists.length ? (
            <Field
              id="campaign-list"
              label="List"
              hint="Everyone on the list when the campaign is scheduled; its own columns can go in the copy as {{custom.column}}."
            >
              <Select
                id="campaign-list"
                name="list_id"
                defaultValue={initial.list_id ?? lists[0]?.id ?? ""}
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="page-note">
              No lists yet. Make one under Lists from a CSV, by hand or from the CRM.
            </p>
          ))}

        {(kind === "companies" || kind === "people" || kind === "leads") && (
          <div className="audience-pick">
            <div className="audience-pick__bar">
              <label className="sr-only" htmlFor="audience-search">
                Search
              </label>
              <input
                id="audience-search"
                className="input input--small"
                value={needle}
                onChange={(event) => setNeedle(event.target.value)}
                placeholder={kind === "companies" ? "Firm or domain" : "Name, email or firm"}
              />
              <button
                type="button"
                className="btn btn--small btn--ghost"
                onClick={() =>
                  setChosen({
                    ...chosen,
                    [kind]: [...new Set([...chosen[kind], ...shown.map((option) => option.id)])],
                  })
                }
              >
                Select all shown
              </button>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                onClick={() => setChosen({ ...chosen, [kind]: [] })}
              >
                Clear
              </button>
              <span className="audience-pick__count" aria-live="polite">
                {chosen[kind].length} chosen
              </span>
            </div>
            <ul className="audience-pick__list" aria-label="Choices">
              {shown.map((option) => (
                <li key={option.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={picked.has(option.id)}
                      onChange={() => toggle(option.id)}
                    />
                    <span className="audience-pick__name">{option.name || "Unnamed"}</span>
                    <span className="audience-pick__sub">{option.sub}</span>
                  </label>
                </li>
              ))}
              {shown.length === 0 && <li className="audience-pick__none">Nothing matches.</li>}
            </ul>
          </div>
        )}

        {kind === "csv" && (
          <div className="audience-csv">
            <p className="page-note">
              A CSV with a header row and an email column. It is read here in your browser; rows are
              checked against the stop list, consent and the caps like anyone else.
            </p>
            <label className="btn btn--small" htmlFor="campaign-csv">
              {fileName ? `Replace ${fileName}` : "Choose a CSV file"}
            </label>
            <input
              id="campaign-csv"
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 2_000_000) {
                  setReadError("Files over 2 MB are too big; split it.");
                  return;
                }
                file
                  .text()
                  .then((text) => load(text, file.name))
                  .catch(() => setReadError("The file could not be read."));
              }}
            />
            {readError && <p className="form-feedback form-feedback--error">{readError}</p>}
            {table && (
              <>
                <div className="csv-import__map">
                  {CSV_FIELDS.map((field) => (
                    <Field key={field.key} id={`csv-map-${field.key}`} label={field.label}>
                      <Select
                        id={`csv-map-${field.key}`}
                        value={mapping[field.key] ?? ""}
                        onChange={(event) => {
                          const next = { ...mapping };
                          if (event.target.value) next[field.key] = event.target.value;
                          else delete next[field.key];
                          setMapping(next);
                        }}
                      >
                        <option value="">Not in the file</option>
                        {table.header.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                </div>
                <p className="page-note">
                  {csvWithEmail.length} of {table.rows.length} rows have an address
                  {mapping.email ? "" : " — map the email column"}.
                </p>
              </>
            )}
          </div>
        )}
      </section>

      <section className="campaign-form__step" aria-labelledby="campaign-how">
        <h2 id="campaign-how" className="record-section__title">
          How it goes
        </h2>
        <Checkbox
          id="campaign-anytime"
          name="send_anytime"
          label="Send at any hour"
          description="Otherwise each recipient gets it inside their own working hours, weekdays only."
          defaultChecked={initial.send_anytime ?? false}
        />
        <Checkbox
          id="campaign-dry-run"
          name="dry_run"
          label="Dry run"
          description="Render and count everything, send nothing: the ledger shows what would have gone."
          defaultChecked={initial.dry_run ?? false}
        />
      </section>

      <div className="form-actions">
        <Button
          type="submit"
          variant="primary"
          disabled={isPending || templates.length === 0 || senders.length === 0}
        >
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
