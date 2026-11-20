import { DataUnavailable } from "@/components/data/data-down";
import { QuestionnaireImport } from "@/components/data/questionnaires/questionnaire-import";
import { QuestionnaireTabs } from "@/components/data/questionnaires/questionnaire-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { RecordSection } from "@/components/ui/record-shell";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readQuestionnaires } from "@/lib/data/api/questionnaires";
import { NOT_ADVICE, notLoaded } from "@/lib/data/labels-controls";
import { dataRead } from "@/lib/data/read";

import { importQuestionnaireAction, previewQuestionnaireAction } from "../actions";
import "@/components/data/closing/closing.css";
import "@/components/data/questionnaires/questionnaires.css";

export const metadata = { title: "Import a questionnaire" };
export const dynamic = "force-dynamic";

const BASE = "/data/waitlist/diligence/questionnaires";
const ABOUT = `Two steps: read their file and check what was read, then import it. Nothing is kept until you press Import; their file is then kept in Files as it came. ${NOT_ADVICE}`;

export default async function ImportQuestionnairePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const entryId = typeof query.entry === "string" ? query.entry.slice(0, 64) : "";
  const { allowed } = await requireData(`${BASE}/new`);
  const read = allowed ? await dataRead(() => readQuestionnaires()) : null;
  return (
    <>
      <PageHeader title="Import a questionnaire" description={ABOUT} />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-questionnaires">
            <QuestionnaireTabs current="questionnaires" />
            <RecordSection id="questionnaire-import" title="Their file">
              {read.data.files_here ? (
                <QuestionnaireImport
                  entryId={entryId}
                  firms={read.data.firms.map((firm) => ({
                    entry_id: firm.entry_id,
                    firm: firm.firm,
                    diligence_id: firm.diligence_id,
                    due_on: firm.due_on,
                  }))}
                  preview={previewQuestionnaireAction}
                  importAction={importQuestionnaireAction}
                />
              ) : (
                <p className="page-note">
                  {notLoaded("Files")} Their file is kept in Files, so nothing can be imported here.
                </p>
              )}
            </RecordSection>
          </div>
        )}
      </div>
    </>
  );
}
