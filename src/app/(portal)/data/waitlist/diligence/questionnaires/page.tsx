import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { QuestionnaireTabs } from "@/components/data/questionnaires/questionnaire-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readQuestionnaires } from "@/lib/data/api/questionnaires";
import { dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import {
  QUESTIONNAIRES_EMPTY,
  QUESTIONNAIRE_KIND_WORDS,
  QUESTIONNAIRE_STATE_WORDS,
  ofCount,
} from "@/lib/data/labels-questionnaires";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

import "@/components/data/closing/closing.css";
import "@/components/data/questionnaires/questionnaires.css";

export const metadata = { title: "Questionnaires" };
export const dynamic = "force-dynamic";

const BASE = "/data/waitlist/diligence/questionnaires";
const ABOUT = `A buyer's security questionnaire, imported from their CSV or .xlsx: approved answers are matched to their questions by ID and by words, never on their own, and the file goes back to them with their own columns. ${NOT_ADVICE}`;

const COLUMNS = [
  { key: "questionnaire", label: "Questionnaire", width: "34%" },
  { key: "firm", label: "Firm" },
  { key: "received", label: "Received" },
  { key: "due", label: "Due" },
  { key: "answered", label: "Answered" },
  { key: "state", label: "State" },
];

const VIEWS = [
  { key: "", label: "All" },
  { key: "open", label: "Open" },
  { key: "sent", label: "Sent" },
  { key: "closed", label: "Closed" },
] as const;

export default async function QuestionnairesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const asked = typeof params.state === "string" ? params.state : "";
  const state = VIEWS.some((view) => view.key === asked) ? asked : "";
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(() => readQuestionnaires(state)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Questionnaires"
        description={ABOUT}
        meta={
          data ? <span className="quiet">{formatNumber(data.counts.open)} open</span> : undefined
        }
        actions={
          <ButtonLink href={`${BASE}/new`} size="small" variant="primary">
            Import a questionnaire
          </ButtonLink>
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-questionnaires">
            <QuestionnaireTabs current="questionnaires" />
            <div className="hqdata-qviews">
              <SegmentedLinks
                label="Which questionnaires"
                items={VIEWS.map((view) => ({
                  href: view.key ? `${BASE}?state=${view.key}` : BASE,
                  label:
                    view.key === ""
                      ? view.label
                      : `${view.label} ${formatNumber(read.data.counts[view.key])}`,
                  current: view.key === state,
                }))}
              />
            </div>
            <DataTable
              caption="Questionnaires"
              columns={COLUMNS}
              isEmpty={read.data.questionnaires.length === 0}
              empty={
                <p className="page-note">{state ? "None in this view." : QUESTIONNAIRES_EMPTY}</p>
              }
            >
              {read.data.questionnaires.map((item) => (
                <tr key={item.questionnaire_id}>
                  <td>
                    <Link className="table-title hqdata-qtext" href={item.href}>
                      {item.title}
                    </Link>
                    <span className="table-sub">{QUESTIONNAIRE_KIND_WORDS[item.kind]}</span>
                  </td>
                  <td>
                    {item.entry_id ? (
                      <Link className="text-link" href={`/data/waitlist/${item.entry_id}`}>
                        {item.firm}
                      </Link>
                    ) : (
                      <span className="table-sub">None</span>
                    )}
                  </td>
                  <td className="nowrap">{dayWords(item.received_on)}</td>
                  <td>
                    {item.due_on && item.state === "open" ? (
                      <DueChip due={item.due_on} today={read.data.today} />
                    ) : item.due_on ? (
                      dayWords(item.due_on)
                    ) : (
                      <span className="table-sub">None set</span>
                    )}
                  </td>
                  <td className="nowrap">{ofCount(item.answered, item.total)}</td>
                  <td>
                    <StatusPill
                      value={item.state}
                      label={QUESTIONNAIRE_STATE_WORDS[item.state]}
                      tone={item.state === "open" ? "attention" : "neutral"}
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </div>
    </>
  );
}
