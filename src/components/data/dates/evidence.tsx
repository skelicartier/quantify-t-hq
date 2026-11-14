import type { ReactNode } from "react";

import Link from "next/link";

import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { CONFIRM_ROLES, dayWords, rupees } from "@/lib/data/labels-company";

/**
 * What a Key date keeps once it is filed, and who said a filing does not apply (company spec
 * §6.7.5): the Evidence cell, the late line, the "Done" form's evidence fields and the
 * "Not for us" fields with the professional's sign-off. Plain markup, no state: the forms
 * are the page's `MailForm`s.
 */

export type EvidenceRow = {
  state: "coming_up" | "in_progress" | "done" | "not_for_us" | "taken_back";
  evidence: {
    srn: string;
    challan: string;
    filed_on: string | null;
    fee_paid: number | null;
    filed_file_id: string | null;
  };
  filed_file: { file_id: string; title: string } | null;
};

/** "14 Nov": a calendar day without its year, as the Evidence cell writes it. */
const dayMonth = (day: string): string => dayWords(day).split(" ").slice(0, 2).join(" ");

/** "SRN WALK-SRN-2 · filed 14 Nov · ₹300 · Filed copy" for a done date; "None kept" or "—" otherwise. */
export function EvidenceCell({ date }: { date: EvidenceRow }) {
  if (date.state !== "done") return <span className="quiet">—</span>;
  const { evidence } = date;
  const parts: ReactNode[] = [];
  if (evidence.srn) parts.push(<span key="srn">SRN {evidence.srn}</span>);
  if (evidence.filed_on) parts.push(<span key="on">filed {dayMonth(evidence.filed_on)}</span>);
  if (evidence.fee_paid !== null) parts.push(<span key="fee">{rupees(evidence.fee_paid)}</span>);
  if (evidence.challan) parts.push(<span key="challan">Challan {evidence.challan}</span>);
  if (date.filed_file)
    parts.push(
      <Link key="copy" className="text-link" href={`/data/files/${date.filed_file.file_id}`}>
        Filed copy
      </Link>,
    );
  if (parts.length === 0)
    return <StatusPill value="none_kept" label="None kept" tone="attention" />;
  return (
    <span className="hqdata-dates__evidence">
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && " · "}
          {part}
        </span>
      ))}
    </span>
  );
}

/** "14 days late: ₹1,400 so far", or for a date filed late "Filed 30 days late: ₹3,000". */
export function LateLine({
  late,
  done,
}: {
  late: { days: number; amount: number | null; words: string } | null;
  done: boolean;
}) {
  if (!late || late.days <= 0) return null;
  const days = `${late.days.toLocaleString("en")} ${late.days === 1 ? "day" : "days"} late`;
  const amount = late.amount === null ? "" : `: ${rupees(late.amount)}`;
  return (
    <span className="table-sub hqdata-dates__late" title={late.words}>
      {done ? `Filed ${days}${amount}` : `${days}${amount}${late.amount === null ? "" : " so far"}`}
    </span>
  );
}

export const SIGN_OFF_HINT =
  "Only your CA, CS or lawyer can say a filing does not apply to the company. Their name and the day are kept with it.";

export type ContactChoice = { contact_id: string; label: string };

/** Who confirmed a statutory date does not apply: name (or a contact), role and day, all three. */
export function SignOffFields({
  prefix,
  today,
  contacts,
}: {
  prefix: string;
  today: string;
  contacts?: readonly ContactChoice[] | null;
}) {
  return (
    <>
      <Field id={`${prefix}-name`} label="Who confirmed it does not apply">
        <Input id={`${prefix}-name`} name="sign_off_name" maxLength={120} />
      </Field>
      {contacts && contacts.length > 0 && (
        <Field id={`${prefix}-contact`} label="From Contacts">
          <Select id={`${prefix}-contact`} name="sign_off_contact_id" defaultValue="">
            <option value="">None chosen</option>
            {contacts.map((contact) => (
              <option key={contact.contact_id} value={contact.contact_id}>
                {contact.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id={`${prefix}-role`} label="Their role">
        <Select id={`${prefix}-role`} name="sign_off_role" defaultValue="CA" required>
          {Object.entries(CONFIRM_ROLES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-on`} label="On" hint={SIGN_OFF_HINT}>
        <Input
          id={`${prefix}-on`}
          name="sign_off_on"
          type="date"
          max={today}
          defaultValue={today}
          required
        />
      </Field>
    </>
  );
}

/** "Not for us": on a statutory date the sign-off and why; on any other date only why, as before. */
export function NotForUsFields({
  prefix,
  statutory,
  today,
  contacts,
}: {
  prefix: string;
  statutory: boolean;
  today: string;
  contacts?: readonly ContactChoice[] | null;
}) {
  return (
    <>
      {statutory && <SignOffFields prefix={prefix} today={today} contacts={contacts ?? null} />}
      <Field id={`${prefix}-why`} label="Why">
        <Input id={`${prefix}-why`} name="note" maxLength={200} />
      </Field>
    </>
  );
}

/** The "Done" form's evidence: filed on, SRN, challan, fee, the filed copy, a note. */
export function EvidenceFields({
  prefix,
  today,
  files,
  filesHere,
}: {
  prefix: string;
  today: string;
  files: readonly { file_id: string; title: string; folder: string }[];
  filesHere: boolean;
}) {
  return (
    <>
      <Field id={`${prefix}-on`} label="Filed on">
        <Input id={`${prefix}-on`} name="filed_on" type="date" max={today} defaultValue={today} />
      </Field>
      <Field id={`${prefix}-srn`} label="SRN or acknowledgement">
        <Input id={`${prefix}-srn`} name="srn" className="mono" maxLength={60} />
      </Field>
      <Field id={`${prefix}-challan`} label="Challan or payment reference">
        <Input id={`${prefix}-challan`} name="challan" className="mono" maxLength={60} />
      </Field>
      <Field id={`${prefix}-fee`} label="Fee paid (₹)">
        <Input
          id={`${prefix}-fee`}
          name="fee_paid"
          inputMode="numeric"
          maxLength={12}
          placeholder="300"
        />
      </Field>
      {filesHere ? (
        <>
          <Field id={`${prefix}-copy`} label="Filed copy">
            <Select id={`${prefix}-copy`} name="filed_file_id" defaultValue="">
              <option value="">Choose from Files</option>
              {files.map((file) => (
                <option key={file.file_id} value={file.file_id}>
                  {file.folder ? `${file.folder} › ${file.title}` : file.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id={`${prefix}-attach`}
            label="Or attach it here"
            hint="3 MB at most. It is kept in Files, in Filed copies under 09 MCA filings and compliance (08 Finance, tax and audit for a tax payment)."
          >
            <Input id={`${prefix}-attach`} name="file" type="file" />
          </Field>
        </>
      ) : (
        <p className="field__hint">Files is not set up here, so no copy can be kept.</p>
      )}
      <Field id={`${prefix}-note`} label="Note">
        <Textarea id={`${prefix}-note`} name="note" rows={2} maxLength={2_000} />
      </Field>
    </>
  );
}
