import { updateStageAction } from "@/app/(portal)/admin/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { PipelineStageForm } from "@/components/admin/pipeline-stage-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCrmSettings, type CrmSettings } from "@/lib/api/crm";

export const metadata = { title: "Pipeline settings" };
export const dynamic = "force-dynamic";

export default async function PipelineSettingsPage() {
  const context = await requireStaff("/admin/settings/pipeline");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Pipeline" />
        <Callout tone="neutral">The pipeline is tuned by HQ admins.</Callout>
      </>
    );
  }
  let settings: CrmSettings | null = null;
  try {
    settings = await readCrmSettings(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const working = (settings?.pipeline ?? []).filter((stage) => !stage.outcome);
  const terminal = (settings?.pipeline ?? []).filter((stage) => stage.outcome);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Pipeline"
        description="The stages deals move through. Win chances weight the forecast; the stuck limit flags deals that sit too long without a scheduled step."
        actions={<AdminTabs current="/admin/settings/pipeline" />}
      />
      {settings === null ? (
        <Callout tone="danger" role="alert">
          The pipeline could not be read just now. Nothing was changed.
        </Callout>
      ) : (
        <div className="record-layout">
          <div className="record-layout__main">
            <ol className="stage-editor" aria-label="Working stages">
              {working.map((stage) => (
                <li key={stage.key} className="stage-editor__item">
                  <p className="stage-editor__key">
                    <span className="mono">{stage.key}</span>
                  </p>
                  <PipelineStageForm action={updateStageAction} stage={stage} />
                </li>
              ))}
            </ol>
          </div>
          <aside className="record-layout__side">
            <Card title="Add a stage" titleAs="h3">
              <PipelineStageForm action={updateStageAction} />
            </Card>
            <Card
              title="Closing stages"
              titleAs="h3"
              description="Fixed: closing a deal files it under one of these, so they cannot be renamed or archived."
            >
              <ul className="side-list">
                {terminal.map((stage) => (
                  <li key={stage.key}>
                    <StatusPill
                      value={stage.outcome}
                      label={stage.label}
                      tone={
                        stage.outcome === "won"
                          ? "live"
                          : stage.outcome === "lost"
                            ? "danger"
                            : "neutral"
                      }
                    />
                  </li>
                ))}
              </ul>
            </Card>
            <Callout tone="neutral" compact>
              A stage with open deals in it cannot be archived until they are moved.
            </Callout>
          </aside>
        </div>
      )}
    </>
  );
}
