import Link from "next/link";

import { MailForm } from "@/components/mail/mail-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Properties, Property } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { InvestorDetail } from "@/lib/data/api/investors";
import {
  CURRENCIES,
  GEOGRAPHIES,
  INDIA_OK,
  INTRO_STATUSES,
  LEAD_OR_FOLLOW,
  NOT_KNOWN,
  RESIDENCY,
  STAGE_FOCUS,
  labelOf,
  toneOf,
} from "@/lib/data/labels";
import { formatDate } from "@/lib/format";
import type { ActionState } from "@/lib/forms/action-state";

import { chequeWords, dayMonth } from "./words";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A firm's raise (raise spec §5.6.3): what is known of it before the pitch
 * (qualification), who introduces it, when it was last touched, and what was shared with
 * it from a data-room pack. Blank means not known; nothing is guessed.
 */

const listWords = (keys: readonly string[], table: Readonly<Record<string, string>>): string =>
  keys.length ? keys.map((key) => table[key] ?? key).join(", ") : NOT_KNOWN;

/** "Qualify": the whole profile in one form, the current answers filled in. */
export function QualifyForm({ detail, action }: { detail: InvestorDetail; action: Action }) {
  const { investor } = detail;
  const { profile } = investor;
  const field = (name: string) => `qualify-${name}`;
  return (
    <MailForm
      action={action}
      fields={{ investor_id: investor.investor_id }}
      submitLabel="Save"
      pendingLabel="Saving…"
    >
      <div className="hqdata-round__pair">
        <Field id={field("min")} label="Smallest cheque">
          <Input
            id={field("min")}
            name="cheque_min"
            inputMode="decimal"
            maxLength={20}
            placeholder="25000"
            defaultValue={
              profile.cheque?.min === null || !profile.cheque ? "" : String(profile.cheque.min)
            }
          />
        </Field>
        <Field id={field("max")} label="Largest cheque">
          <Input
            id={field("max")}
            name="cheque_max"
            inputMode="decimal"
            maxLength={20}
            placeholder="100000"
            defaultValue={
              profile.cheque?.max === null || !profile.cheque ? "" : String(profile.cheque.max)
            }
          />
        </Field>
      </div>
      <Field
        id={field("currency")}
        label="Currency"
        hint="Leave a bound empty when it is not known."
      >
        <Select
          id={field("currency")}
          name="cheque_currency"
          defaultValue={profile.cheque?.currency ?? "USD"}
          aria-describedby={`${field("currency")}-hint`}
        >
          {CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="fieldset">
        <legend className="fieldset__legend">Stages they invest at</legend>
        {Object.entries(STAGE_FOCUS).map(([key, label]) => (
          <Checkbox
            key={key}
            id={field(`stage-${key}`)}
            name="stages"
            value={key}
            label={label}
            defaultChecked={(profile.stages as string[]).includes(key)}
          />
        ))}
      </fieldset>
      <Field
        id={field("sectors")}
        label="Sectors"
        hint="Separated by commas, such as fintech, data, AI."
      >
        <Input
          id={field("sectors")}
          name="sectors"
          maxLength={500}
          aria-describedby={`${field("sectors")}-hint`}
          defaultValue={profile.sectors.join(", ")}
        />
      </Field>
      <fieldset className="fieldset">
        <legend className="fieldset__legend">Geography</legend>
        {Object.entries(GEOGRAPHIES).map(([key, label]) => (
          <Checkbox
            key={key}
            id={field(`geo-${key}`)}
            name="geography"
            value={key}
            label={label}
            defaultChecked={(profile.geography as string[]).includes(key)}
          />
        ))}
      </fieldset>
      <Field id={field("lead")} label="Lead or follow">
        <Select id={field("lead")} name="lead" defaultValue={profile.lead}>
          <option value="">{NOT_KNOWN}</option>
          {Object.entries(LEAD_OR_FOLLOW).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id={field("conflict")}
        label="Known conflict"
        hint="A company they back that competes with yours. Leave it empty when none is known."
      >
        <Input
          id={field("conflict")}
          name="conflict"
          maxLength={200}
          aria-describedby={`${field("conflict")}-hint`}
          defaultValue={profile.conflict}
        />
      </Field>
      <Field
        id={field("residency")}
        label="Residency"
        hint="This decides whether the foreign-investment steps apply."
      >
        <Select
          id={field("residency")}
          name="residency"
          defaultValue={profile.residency}
          aria-describedby={`${field("residency")}-hint`}
        >
          <option value="">{NOT_KNOWN}</option>
          {Object.entries(RESIDENCY).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={field("india")} label="Can invest into an Indian private company">
        <Select id={field("india")} name="india_ok" defaultValue={profile.india_ok}>
          <option value="">{NOT_KNOWN}</option>
          {Object.entries(INDIA_OK).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
    </MailForm>
  );
}

/** "Introduction": its status, a contact from Contacts or a typed name, and the day. */
export function IntroForm({ detail, action }: { detail: InvestorDetail; action: Action }) {
  const { investor, introducers, today } = detail;
  const field = (name: string) => `intro-${name}`;
  return (
    <MailForm
      action={action}
      fields={{ investor_id: investor.investor_id }}
      submitLabel="Save the introduction"
      pendingLabel="Saving…"
    >
      <Field id={field("status")} label="Status">
        <Select id={field("status")} name="status" defaultValue={investor.intro.status}>
          {Object.entries(INTRO_STATUSES).map(([key, item]) => (
            <option key={key} value={key}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>
      {introducers !== null && (
        <Field id={field("contact")} label="Choose from Contacts">
          <Select
            id={field("contact")}
            name="contact_id"
            defaultValue={investor.intro.contact_id ?? ""}
          >
            <option value="">Not chosen</option>
            {introducers.map((contact) => (
              <option key={contact.contact_id} value={contact.contact_id}>
                {contact.firm ? `${contact.name} · ${contact.firm}` : contact.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id={field("name")} label={introducers !== null ? "Or type a name" : "Introducer"}>
        <Input
          id={field("name")}
          name="introducer"
          maxLength={120}
          defaultValue={investor.intro.contact_id ? "" : investor.intro.introducer}
        />
      </Field>
      <Field id={field("on")} label="On">
        <Input id={field("on")} name="on" type="date" max={today} defaultValue={today} />
      </Field>
    </MailForm>
  );
}

/** The side's raise blocks: Qualification, Introduction, Last touch and the Data room. */
export function RaiseProperties({ detail, now }: { detail: InvestorDetail; now: number }) {
  const { investor } = detail;
  const { profile, intro } = investor;
  const when = (at: string | null) =>
    at ? <Timestamp value={at} now={now} mode="relative" /> : "Never";
  return (
    <>
      <Properties title="Qualification">
        <Property label="Cheque">{chequeWords(profile.cheque)}</Property>
        <Property label="Stages they invest at">{listWords(profile.stages, STAGE_FOCUS)}</Property>
        <Property label="Sectors">
          {profile.sectors.length ? profile.sectors.join(", ") : NOT_KNOWN}
        </Property>
        <Property label="Geography">{listWords(profile.geography, GEOGRAPHIES)}</Property>
        <Property label="Lead or follow">
          {labelOf(LEAD_OR_FOLLOW, profile.lead, NOT_KNOWN)}
        </Property>
        <Property label="Known conflict">{profile.conflict || "None known"}</Property>
        <Property label="Residency">{labelOf(RESIDENCY, profile.residency, NOT_KNOWN)}</Property>
        <Property label="Can invest into an Indian private company">
          {labelOf(INDIA_OK, profile.india_ok, NOT_KNOWN)}
        </Property>
      </Properties>
      <Properties title="Introduction">
        <Property label="Status">
          <StatusPill
            value={intro.status}
            label={labelOf(INTRO_STATUSES, intro.status)}
            tone={toneOf(INTRO_STATUSES, intro.status)}
          />
        </Property>
        <Property label="Introducer">
          {intro.contact_id ? (
            <Link className="text-link" href={`/data/contacts#contact-${intro.contact_id}`}>
              {intro.introducer || "A contact"}
            </Link>
          ) : (
            intro.introducer || "None named"
          )}
        </Property>
        <Property label="On">{intro.on ? formatDate(intro.on) : NOT_KNOWN}</Property>
      </Properties>
      <Properties title="Last touch">
        <Property label="Last written">{when(investor.last_written_at)}</Property>
        <Property label="Last replied">{when(investor.last_replied_at)}</Property>
        <Property label="Last met">{when(investor.last_met_at)}</Property>
      </Properties>
      {detail.data_room !== null && (
        <Properties title="Data room">
          {detail.data_room.length === 0 ? (
            <Property label="Shared">Not shared yet.</Property>
          ) : (
            detail.data_room.map((share, index) => (
              <Property key={`${share.pack_id}-${share.version}-${index}`} label="Shared">
                {share.name} v{share.version} · shared {dayMonth(share.shared_on)} · {share.how}
              </Property>
            ))
          )}
        </Properties>
      )}
    </>
  );
}
