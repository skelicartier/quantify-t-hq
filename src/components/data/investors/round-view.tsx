import { MailForm } from "@/components/mail/mail-form";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { Properties, Property, RecordSection } from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import type { RoundPage } from "@/lib/data/api/investors";
import { CAP_BASIS, CURRENCIES, INSTRUMENTS, INVESTOR_STAGES, labelOf } from "@/lib/data/labels";
import { formatDate, formatMoney } from "@/lib/format";
import type { ActionState } from "@/lib/forms/action-state";

import { discountWords } from "./words";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * The round (raise spec §5.6.2, report 3.1): the terms he is raising on, as he wrote them
 * down, and every change to them. There is no target, range or progress anywhere here:
 * the record has no field for one.
 */

const HISTORY_COLUMNS = [
  { key: "when", label: "When" },
  { key: "who", label: "Who" },
  { key: "what", label: "What changed" },
];

export function RoundView({ page, now, action }: { page: RoundPage; now: number; action: Action }) {
  const { round } = page;
  if (!round)
    return (
      <div className="hqdata-round">
        <EmptyState
          title="No round recorded yet"
          description="Write down the terms you are raising on: the instrument, the cap, any discount, the smallest cheque and whether you have a lead."
          action={
            <Popover label="Record the round" variant="primary" align="start" width="wide">
              <RoundForm page={page} action={action} />
            </Popover>
          }
        />
      </div>
    );
  const leadFirm = round.lead_investor_id
    ? page.firms.find((firm) => firm.investor_id === round.lead_investor_id)?.firm
    : undefined;
  return (
    <div className="hqdata-round">
      <div className="hqdata-round__actions">
        <Popover label="Change the round" variant="primary" align="start" width="wide">
          <RoundForm page={page} action={action} />
        </Popover>
      </div>
      <Properties title="The round">
        <Property label="Name">{round.name}</Property>
        <Property label="Instrument">{round.instrument}</Property>
        <Property label="Valuation cap">
          {round.cap
            ? `${formatMoney(round.cap.amount, round.cap.currency)}, ${CAP_BASIS[round.cap.basis].toLowerCase()}`
            : "None"}
        </Property>
        <Property label="Discount">{discountWords(round.discount_percent)}</Property>
        <Property label="Most favoured nation">{round.mfn ? "Yes" : "No"}</Property>
        <Property label="Smallest cheque">
          {round.minimum_cheque
            ? formatMoney(round.minimum_cheque.amount, round.minimum_cheque.currency)
            : "None"}
        </Property>
        <Property label="Open since">
          {round.opened_on ? formatDate(round.opened_on) : "Not set"}
        </Property>
        <Property label="Lead">
          {round.lead === "yes" ? (leadFirm ? `Yes: ${leadFirm}` : "Yes") : "Not yet"}
        </Property>
        <Property label="Notes">
          {round.notes ? <span className="hqdata-round__notes">{round.notes}</span> : "None"}
        </Property>
        <Property label="Changed">
          <span>
            {round.updated_by.name} · <Timestamp value={round.updated_at} now={now} />
          </span>
        </Property>
      </Properties>
      <RecordSection id="investors-round-history" title="Changes to the round">
        <DataTable
          caption="Changes to the round"
          columns={HISTORY_COLUMNS}
          columnMenu={false}
          isEmpty={page.history.length === 0}
          empty={<p className="page-note">No changes recorded.</p>}
        >
          {page.history.map((row, index) => (
            <tr key={`${row.at}-${index}`}>
              <td className="nowrap">
                <Timestamp value={row.at} now={now} mode="absolute" />
              </td>
              <td>{row.by.name}</td>
              <td>{row.changed.length ? row.changed.join(", ") : "Nothing changed"}</td>
            </tr>
          ))}
        </DataTable>
      </RecordSection>
    </div>
  );
}

/** "Record the round" / "Change the round": every term, the current ones filled in. */
function RoundForm({ page, action }: { page: RoundPage; action: Action }) {
  const { round } = page;
  return (
    <MailForm action={action} submitLabel="Save the round" pendingLabel="Saving…">
      <Field id="round-name" label="Name">
        <Input
          id="round-name"
          name="name"
          maxLength={80}
          defaultValue={round?.name ?? "Pre-seed"}
        />
      </Field>
      <Field id="round-instrument" label="Instrument">
        <Select
          id="round-instrument"
          name="instrument"
          defaultValue={round?.instrument ?? "Not decided"}
        >
          {INSTRUMENTS.map((instrument) => (
            <option key={instrument} value={instrument}>
              {instrument}
            </option>
          ))}
        </Select>
      </Field>
      <div className="hqdata-round__pair">
        <Field id="round-cap" label="Valuation cap">
          <Input
            id="round-cap"
            name="cap_amount"
            inputMode="decimal"
            maxLength={20}
            placeholder="5000000"
            defaultValue={round?.cap ? String(round.cap.amount) : ""}
          />
        </Field>
        <Field id="round-cap-currency" label="Currency">
          <Select
            id="round-cap-currency"
            name="cap_currency"
            defaultValue={round?.cap?.currency ?? "USD"}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="round-cap-basis" label="The cap is">
        <Select
          id="round-cap-basis"
          name="cap_basis"
          defaultValue={round?.cap?.basis ?? "post_money"}
        >
          {Object.entries(CAP_BASIS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id="round-discount"
        label="Discount (per cent)"
        hint="From 1 to 50; leave empty for none."
      >
        <Input
          id="round-discount"
          name="discount"
          inputMode="decimal"
          maxLength={4}
          aria-describedby="round-discount-hint"
          defaultValue={
            round?.discount_percent === null || !round ? "" : String(round.discount_percent)
          }
        />
      </Field>
      <Checkbox
        id="round-mfn"
        name="mfn"
        label="Most favoured nation"
        defaultChecked={round?.mfn ?? false}
      />
      <div className="hqdata-round__pair">
        <Field id="round-minimum" label="Smallest cheque">
          <Input
            id="round-minimum"
            name="minimum_amount"
            inputMode="decimal"
            maxLength={20}
            placeholder="25000"
            defaultValue={round?.minimum_cheque ? String(round.minimum_cheque.amount) : ""}
          />
        </Field>
        <Field id="round-minimum-currency" label="Currency">
          <Select
            id="round-minimum-currency"
            name="minimum_currency"
            defaultValue={round?.minimum_cheque?.currency ?? "USD"}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="round-opened" label="Open since">
        <Input
          id="round-opened"
          name="opened_on"
          type="date"
          defaultValue={round?.opened_on ?? ""}
        />
      </Field>
      <fieldset className="fieldset">
        <legend className="fieldset__legend">Lead</legend>
        <label className="checkbox">
          <input type="radio" name="lead" value="yes" defaultChecked={round?.lead === "yes"} />
          <span className="checkbox__label">We have a lead</span>
        </label>
        <label className="checkbox">
          <input type="radio" name="lead" value="no" defaultChecked={round?.lead !== "yes"} />
          <span className="checkbox__label">No lead yet</span>
        </label>
      </fieldset>
      <Field id="round-lead-firm" label="Lead firm">
        <Select
          id="round-lead-firm"
          name="lead_investor_id"
          defaultValue={round?.lead_investor_id ?? ""}
        >
          <option value="">Not named</option>
          {page.firms.map((firm) => (
            <option key={firm.investor_id} value={firm.investor_id}>
              {firm.firm} · {labelOf(INVESTOR_STAGES, firm.stage)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="round-notes" label="Notes">
        <Textarea
          id="round-notes"
          name="notes"
          rows={3}
          maxLength={4_000}
          defaultValue={round?.notes ?? ""}
        />
      </Field>
    </MailForm>
  );
}
