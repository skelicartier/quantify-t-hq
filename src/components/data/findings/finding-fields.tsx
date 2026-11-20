import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FINDING_SOURCES, PEN_TEST_KINDS } from "@/lib/data/labels-assurance";
import { FLAGS } from "@/lib/data/labels-company";
import { SEVERITIES, SEVERITY_WORDS } from "@/lib/data/labels-controls";

export type FindingValues = {
  title: string;
  severity: string;
  source: string;
  found_on: string;
  pen_test_id: string | null;
  owner: string;
  description: string;
  evidence: string;
};

/** The sources he may choose by hand: dependency alerts come in through the import. */
const BY_HAND = ["self", "pen_test", "customer", "other"] as const;

/**
 * A finding's fields (ws-notes/security/spec.md §8.2), for "Add a finding" and "Edit": what
 * was found, its severity, where it came from (a pen test it belongs to), the day it was found,
 * who owns it, what it is and the evidence. A dependency alert's source stays its own.
 */
export function FindingFields({
  prefix,
  values,
  today,
  penTests,
  imported = false,
}: {
  prefix: string;
  values: FindingValues;
  today: string;
  penTests: readonly { pen_test_id: string; tester: string; report_on: string | null }[];
  imported?: boolean;
}) {
  return (
    <>
      <Field id={`${prefix}-title`} label="What was found">
        <Input
          id={`${prefix}-title`}
          name="title"
          defaultValue={values.title}
          minLength={3}
          maxLength={200}
          required
        />
      </Field>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-severity`} label="Severity">
          <Select id={`${prefix}-severity`} name="severity" defaultValue={values.severity}>
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {SEVERITY_WORDS[severity]}
              </option>
            ))}
          </Select>
        </Field>
        {imported ? (
          <Field id={`${prefix}-source`} label="Where it came from">
            <Input id={`${prefix}-source`} value={FINDING_SOURCES.dependabot} readOnly />
          </Field>
        ) : (
          <Field id={`${prefix}-source`} label="Where it came from">
            <Select id={`${prefix}-source`} name="source" defaultValue={values.source || "self"}>
              {BY_HAND.map((source) => (
                <option key={source} value={source}>
                  {FINDING_SOURCES[source]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-found`} label="Found on">
          <Input
            id={`${prefix}-found`}
            name="found_on"
            type="date"
            max={today}
            defaultValue={values.found_on || today}
            required
          />
        </Field>
        <Field id={`${prefix}-pen-test`} label="From the pen test">
          <Select
            id={`${prefix}-pen-test`}
            name="pen_test_id"
            defaultValue={values.pen_test_id ?? ""}
          >
            <option value="">None</option>
            {penTests.map((test) => (
              <option key={test.pen_test_id} value={test.pen_test_id}>
                {test.tester}
                {test.report_on ? `, ${test.report_on}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={`${prefix}-owner`} label="Owner">
        <Input id={`${prefix}-owner`} name="owner" defaultValue={values.owner} maxLength={120} />
      </Field>
      <Field id={`${prefix}-description`} label="What it is">
        <Textarea
          id={`${prefix}-description`}
          name="description"
          rows={3}
          defaultValue={values.description}
          maxLength={4000}
        />
      </Field>
      <Field
        id={`${prefix}-evidence`}
        label="Evidence"
        hint="Where it was seen, or how the fix was checked."
      >
        <Textarea
          id={`${prefix}-evidence`}
          name="evidence"
          rows={2}
          defaultValue={values.evidence}
          maxLength={4000}
        />
      </Field>
    </>
  );
}

export type PenTestValues = {
  tester: string;
  kind: string;
  empanelled: string;
  scope: string;
  started_on: string | null;
  report_on: string | null;
  notes: string;
};

/** A pen test's fields: who tested, whether a third party, CERT-In empanelled, the scope and the days. */
export function PenTestFields({
  prefix,
  values,
  today,
}: {
  prefix: string;
  values: PenTestValues;
  today: string;
}) {
  return (
    <>
      <Field
        id={`${prefix}-tester`}
        label="Tested by"
        hint="The firm or the person, as on the report."
      >
        <Input
          id={`${prefix}-tester`}
          name="tester"
          defaultValue={values.tester}
          maxLength={120}
          required
        />
      </Field>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-kind`} label="Kind">
          <Select id={`${prefix}-kind`} name="kind" defaultValue={values.kind || "third_party"}>
            {Object.entries(PEN_TEST_KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-empanelled`} label="CERT-In empanelled">
          <Select id={`${prefix}-empanelled`} name="empanelled" defaultValue={values.empanelled}>
            {(["yes", "no", ""] as const).map((flag) => (
              <option key={flag} value={flag}>
                {FLAGS[flag]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={`${prefix}-scope`} label="Scope">
        <Textarea
          id={`${prefix}-scope`}
          name="scope"
          rows={2}
          defaultValue={values.scope}
          maxLength={1000}
        />
      </Field>
      <div className="hqdata-assurance__pair">
        <Field id={`${prefix}-started`} label="Started on">
          <Input
            id={`${prefix}-started`}
            name="started_on"
            type="date"
            max={today}
            defaultValue={values.started_on ?? ""}
          />
        </Field>
        <Field id={`${prefix}-report`} label="Report on">
          <Input
            id={`${prefix}-report`}
            name="report_on"
            type="date"
            max={today}
            defaultValue={values.report_on ?? ""}
          />
        </Field>
      </div>
      <Field id={`${prefix}-notes`} label="Notes">
        <Textarea
          id={`${prefix}-notes`}
          name="notes"
          rows={2}
          defaultValue={values.notes}
          maxLength={4000}
        />
      </Field>
    </>
  );
}
