import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import type { ClosingPage } from "@/lib/data/api/closing";
import { VALUATION_KINDS, type ClosingStep } from "@/lib/data/labels-close";

/**
 * Each closing step's fields (ws-notes/company/spec.md §9.4, §9.7.7), inside the "Record it"
 * popover of its checklist row. The two steps that start a clock carry "Add the deadlines to
 * Key dates", ticked. The service checks every value again; the one refusal is an allotment
 * dated before the money arrived.
 */

const MONEY_HINT =
  "Allot within 60 days, or refund. For a non-resident, also the FIRMS registration. Each day comes from a rule your CS can confirm in Key dates › Rules.";
const ALLOTMENT_HINT =
  "PAS-3, the register entry and the certificates; for a non-resident, FC-GPR and the FLA return.";

function DayField({
  id,
  today,
  value,
  label = "On",
}: {
  id: string;
  today: string;
  value: string | null | undefined;
  label?: string;
}) {
  return (
    <Field id={id} label={label}>
      <Input id={id} name="on" type="date" max={today} required defaultValue={value ?? today} />
    </Field>
  );
}

function FileField({ id, label }: { id: string; label: string }) {
  return (
    <Field id={id} label={`${label} (at most 3 MB)`}>
      <Input id={id} name="file" type="file" />
    </Field>
  );
}

function AddDates({ id, hint }: { id: string; hint: string }) {
  return (
    <Checkbox
      id={id}
      name="add_dates"
      label="Add the deadlines to Key dates"
      description={hint}
      defaultChecked
    />
  );
}

export function StepFields({ step, page }: { step: ClosingStep; page: ClosingPage }) {
  const closing = page.closing;
  const today = page.today;
  const at = (name: string) => `closing-${step}-${name}`;
  switch (step) {
    case "documents_sent":
      return (
        <>
          <DayField id={at("on")} today={today} value={closing?.documents_sent?.on} />
          <Field id={at("what")} label="What was sent">
            <Input
              id={at("what")}
              name="what"
              maxLength={200}
              placeholder="Term sheet and the subscription agreement"
              defaultValue={closing?.documents_sent?.what ?? ""}
            />
          </Field>
        </>
      );
    case "documents_signed":
      return (
        <>
          <DayField id={at("on")} today={today} value={closing?.documents_signed?.on} />
          <FileField id={at("file")} label="The signed copy" />
        </>
      );
    case "offer_letter":
      return (
        <>
          <DayField id={at("on")} today={today} value={closing?.offer_letter?.on} />
          <Field id={at("serial")} label="Serial number">
            <Input
              id={at("serial")}
              name="serial"
              maxLength={40}
              required
              placeholder="PAS-4/001"
              defaultValue={closing?.offer_letter?.serial ?? ""}
            />
          </Field>
          <FileField id={at("file")} label="The offer letter" />
        </>
      );
    case "money_received": {
      const money = closing?.money_received;
      return (
        <>
          <DayField id={at("on")} today={today} value={money?.on} />
          <div className="hqdata-pilot-form__pair">
            <Field id={at("amount")} label="Amount">
              <Input
                id={at("amount")}
                name="amount"
                inputMode="numeric"
                maxLength={20}
                required
                placeholder="2500000"
                defaultValue={money ? String(money.amount) : ""}
              />
            </Field>
            <Field id={at("currency")} label="Currency">
              <Select id={at("currency")} name="currency" defaultValue={money?.currency ?? "INR"}>
                <option value="INR">INR</option>
                <option value="USD">USD</option>
              </Select>
            </Field>
          </div>
          <Checkbox
            id={at("own")}
            name="own_account"
            label="From the investor's own bank account"
            defaultChecked={money?.own_account ?? false}
          />
          <Field id={at("reference")} label="Bank reference or FIRC number">
            <Input
              id={at("reference")}
              name="reference"
              maxLength={80}
              defaultValue={money?.reference ?? ""}
            />
          </Field>
          <FileField id={at("file")} label="FIRC" />
          <AddDates id={at("dates")} hint={MONEY_HINT} />
        </>
      );
    }
    case "bank_kyc":
      return (
        <>
          <DayField id={at("on")} today={today} value={closing?.bank_kyc?.on} />
          <Checkbox
            id={at("receiving")}
            name="from_receiving_bank"
            label="From the bank that received the money"
            defaultChecked={closing?.bank_kyc?.from_receiving_bank ?? false}
          />
          <FileField id={at("file")} label="The KYC" />
        </>
      );
    case "valuation":
      return (
        <>
          {page.round.valuation && (
            <Checkbox
              id={at("from-round")}
              name="from_round"
              label="Use the round's valuation"
              description="The day, the valuer and the report recorded under the round's steps."
            />
          )}
          <DayField
            id={at("on")}
            today={today}
            value={closing?.valuation?.on}
            label="Report dated"
          />
          <Field id={at("by")} label="Valuer">
            <Input
              id={at("by")}
              name="by_name"
              maxLength={120}
              defaultValue={closing?.valuation?.by_name ?? ""}
            />
          </Field>
          <Field id={at("kind")} label="Kind">
            <Select
              id={at("kind")}
              name="kind"
              defaultValue={closing?.valuation?.kind ?? "registered_valuer"}
            >
              {Object.entries(VALUATION_KINDS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <FileField id={at("file")} label="The report" />
        </>
      );
    case "board_approval":
      return (
        <>
          {page.resolutions && page.resolutions.length > 0 && (
            <Field id={at("resolution")} label="From Meetings">
              <Select
                id={at("resolution")}
                name="resolution_id"
                defaultValue={closing?.board_approval?.resolution_id ?? ""}
              >
                <option value="">Typed here instead</option>
                {page.resolutions.map((resolution) => (
                  <option key={resolution.resolution_id} value={resolution.resolution_id}>
                    {resolution.title} · {resolution.meeting_title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <DayField id={at("on")} today={today} value={closing?.board_approval?.on} />
          <Field id={at("words")} label="What the board approved">
            <Textarea
              id={at("words")}
              name="words"
              rows={2}
              maxLength={400}
              defaultValue={closing?.board_approval?.words ?? ""}
            />
          </Field>
        </>
      );
    case "allotment": {
      const allotment = closing?.allotment;
      return (
        <>
          <DayField id={at("on")} today={today} value={allotment?.on} />
          <div className="hqdata-pilot-form__pair">
            <Field id={at("shares")} label="Shares">
              <Input
                id={at("shares")}
                name="shares"
                inputMode="numeric"
                maxLength={15}
                required
                defaultValue={String(allotment?.shares ?? closing?.shares ?? "")}
              />
            </Field>
            <Field id={at("price")} label="Price a share (₹)">
              <Input
                id={at("price")}
                name="price_per_share"
                inputMode="numeric"
                maxLength={15}
                required
                defaultValue={String(allotment?.price_per_share ?? closing?.price_per_share ?? "")}
              />
            </Field>
          </div>
          {page.classes && (
            <Field id={at("class")} label="Class">
              <Select
                id={at("class")}
                name="class_id"
                defaultValue={allotment?.class_id ?? closing?.class_id ?? ""}
              >
                <option value="">As under Terms</option>
                {page.classes.map((item) => (
                  <option key={item.class_id} value={item.class_id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <AddDates id={at("dates")} hint={ALLOTMENT_HINT} />
        </>
      );
    }
    case "register":
      return page.members_here ? (
        <p className="page-note">
          The holder, class, shares and price go into the register of members as one entry.
        </p>
      ) : (
        <>
          <p className="page-note">The register of members is not set up here yet.</p>
          <DayField id={at("on")} today={today} value={closing?.register?.on} />
          <Field id={at("folio")} label="Folio">
            <Input
              id={at("folio")}
              name="folio"
              maxLength={40}
              required
              defaultValue={closing?.register?.folio ?? ""}
            />
          </Field>
        </>
      );
    case "certificate":
      return (
        <>
          {page.register?.certificate && (
            <p className="page-note">
              The register has certificate {page.register.certificate.number}; leave the number
              blank to use it.
            </p>
          )}
          <DayField id={at("on")} today={today} value={closing?.certificate?.on} />
          <Field id={at("number")} label="Certificate number">
            <Input
              id={at("number")}
              name="number"
              maxLength={40}
              required={!page.register?.certificate}
              defaultValue={closing?.certificate?.number ?? ""}
            />
          </Field>
        </>
      );
    case "refund": {
      const money = closing?.money_received;
      return (
        <>
          <DayField id={at("on")} today={today} value={closing?.refund?.on} />
          <div className="hqdata-pilot-form__pair">
            <Field id={at("amount")} label="Amount">
              <Input
                id={at("amount")}
                name="amount"
                inputMode="numeric"
                maxLength={20}
                required
                defaultValue={money ? String(money.amount) : ""}
              />
            </Field>
            <Field id={at("currency")} label="Currency">
              <Select id={at("currency")} name="currency" defaultValue={money?.currency ?? "INR"}>
                <option value="INR">INR</option>
                <option value="USD">USD</option>
              </Select>
            </Field>
          </div>
          <Field id={at("interest")} label="Interest, if any">
            <Input id={at("interest")} name="interest" inputMode="numeric" maxLength={15} />
          </Field>
          <Field id={at("note")} label="Note">
            <Textarea id={at("note")} name="note" rows={2} maxLength={2_000} />
          </Field>
        </>
      );
    }
  }
}
