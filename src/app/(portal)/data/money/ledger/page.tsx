import { DataUnavailable } from "@/components/data/data-down";
import { MoneyBody } from "@/components/data/money/money-bits";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readLedger, type LedgerPage } from "@/lib/data/api/money";
import { dayWords } from "@/lib/data/labels-company";
import { CATEGORY_KINDS, MONEY_ABOUT, countOf } from "@/lib/data/labels-money";
import { dataRead } from "@/lib/data/read";

import {
  addCategoryAction,
  mapCheckedAction,
  retireCategoryAction,
  starterCategoriesAction,
  updateCategoryAction,
} from "../actions";
import "../money.css";

export const metadata = { title: "Ledger map" };
export const dynamic = "force-dynamic";

const BASE = "/data/money/ledger";
const ABOUT =
  "Each category here points at exactly one ledger in your CA's books and one Schedule III line, so the month's pack and the books line up. Your CA fills or checks the two columns.";

export default async function LedgerMapPage() {
  const { allowed, context } = await requireData(BASE);
  const owner = context.me.role === "owner";
  const read = allowed ? await dataRead(() => readLedger()) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Ledger map"
        description={`${ABOUT} ${MONEY_ABOUT}`}
        actions={
          data ? (
            <>
              <Popover label="Add a category" variant="primary" align="end" width="wide">
                <MailForm
                  action={addCategoryAction}
                  submitLabel="Add the category"
                  pendingLabel="Adding…"
                  className="stack-form stack-form--tight hqdata-money-form"
                >
                  <div className="hqdata-money-form__pair">
                    <Field id="category-name" label="Category">
                      <Input id="category-name" name="name" required minLength={2} maxLength={80} />
                    </Field>
                    <Field id="category-kind" label="Kind">
                      <Select id="category-kind" name="kind" defaultValue="expense">
                        {Object.entries(CATEGORY_KINDS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="hqdata-money-form__pair">
                    <Field id="category-ledger" label="Ledger in the books">
                      <Input id="category-ledger" name="ledger" maxLength={120} />
                    </Field>
                    <Field id="category-schedule" label="Schedule III line">
                      <Input id="category-schedule" name="schedule_line" maxLength={120} />
                    </Field>
                  </div>
                  <Checkbox
                    id="category-people"
                    name="people"
                    label="Its lines name a person's pay"
                  />
                </MailForm>
              </Popover>
              <Popover label="Add the starter categories" align="end">
                <MailForm
                  action={starterCategoriesAction}
                  submitLabel="Add them"
                  pendingLabel="Adding…"
                >
                  <p className="field__hint">
                    Twenty-four categories a young company usually needs, each added only if its
                    name is not here yet. The ledger and Schedule III columns stay empty for your
                    CA.
                  </p>
                </MailForm>
              </Popover>
              <ButtonLink href={`${BASE}/export`} size="small" variant="ghost">
                Download the map
              </ButtonLink>
              <Popover label="Record that the CA checked it" align="end">
                <MailForm action={mapCheckedAction} submitLabel="Record it" pendingLabel="Saving…">
                  <Field id="checked-by" label="Who checked it">
                    <Input id="checked-by" name="by_name" required minLength={2} maxLength={120} />
                  </Field>
                  <Field id="checked-on" label="On">
                    <Input
                      id="checked-on"
                      name="on"
                      type="date"
                      max={data.today}
                      defaultValue={data.today}
                    />
                  </Field>
                  <Field id="checked-note" label="Note">
                    <Input id="checked-note" name="note" maxLength={400} />
                  </Field>
                </MailForm>
              </Popover>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <MoneyBody current="ledger" owner={owner} rulesHere>
            <LedgerMap page={read.data} />
          </MoneyBody>
        )}
      </div>
    </>
  );
}

function LedgerMap({ page }: { page: LedgerPage }) {
  return (
    <section className="hqdata-money__block" data-section="money-ledger">
      <p className="hqdata-money__line" id="ledger-mapped">
        {page.line}
      </p>
      {page.map_checked && (
        <p className="hqdata-money__line">
          Checked by {page.map_checked.by_name} on {dayWords(page.map_checked.on)}.
          {page.map_checked.note ? ` ${page.map_checked.note}` : ""}
        </p>
      )}
      {page.checks.length > 0 && (
        <ul className="hqdata-money__checks">
          {page.checks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
      )}
      <DataTable
        caption="Ledger map"
        columns={[
          { key: "category", label: "Category" },
          { key: "kind", label: "Kind" },
          { key: "ledger", label: "Ledger in the books" },
          { key: "schedule", label: "Schedule III line" },
          { key: "people", label: "Names a person's pay" },
          { key: "use", label: "In use" },
          { key: "act", label: "" },
        ]}
        columnMenu={false}
        isEmpty={page.categories.length === 0}
        empty={
          <EmptyState
            compact
            title="No categories yet"
            description="No categories yet. Add the starter categories, then ask your CA to fill the ledger and Schedule III columns."
          />
        }
      >
        {page.categories.map((category) => (
          <tr key={category.category_id} id={`category-${category.category_id}`}>
            <td>
              <span className="table-title">{category.name}</span>
              {category.retired && <span className="table-sub">Retired</span>}
            </td>
            <td>{CATEGORY_KINDS[category.kind]}</td>
            <td className="hqdata-money-wrap">
              {category.ledger || <span className="hqdata-money-attention">Not mapped</span>}
            </td>
            <td className="hqdata-money-wrap">
              {category.schedule_line || <span className="quiet">—</span>}
            </td>
            <td>{category.people ? "Yes" : "No"}</td>
            <td className="nowrap">
              {category.in_use > 0 ? countOf(category.in_use, "record") : "No"}
            </td>
            <td className="data-table__actions">
              {!category.retired && (
                <div className="hqdata-money-actions">
                  <Popover label="Map" align="end" width="wide">
                    <MailForm
                      action={updateCategoryAction}
                      fields={{ category_id: category.category_id }}
                      submitLabel="Save"
                      pendingLabel="Saving…"
                      className="stack-form stack-form--tight hqdata-money-form"
                    >
                      <Field id={`ledger-${category.category_id}`} label="Ledger in the books">
                        <Input
                          id={`ledger-${category.category_id}`}
                          name="ledger"
                          maxLength={120}
                          defaultValue={category.ledger}
                        />
                      </Field>
                      <Field id={`schedule-${category.category_id}`} label="Schedule III line">
                        <Input
                          id={`schedule-${category.category_id}`}
                          name="schedule_line"
                          maxLength={120}
                          defaultValue={category.schedule_line}
                        />
                      </Field>
                      <Checkbox
                        id={`people-${category.category_id}`}
                        name="people"
                        label="Its lines name a person's pay"
                        defaultChecked={category.people}
                      />
                    </MailForm>
                  </Popover>
                  <Popover label="Retire" align="end">
                    <MailForm
                      action={retireCategoryAction}
                      fields={{ category_id: category.category_id }}
                      submitLabel="Retire it"
                      pendingLabel="Saving…"
                      variant="danger"
                    >
                      <p className="field__hint">
                        What already uses it keeps it; nothing new can choose it.
                      </p>
                    </MailForm>
                  </Popover>
                </div>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
