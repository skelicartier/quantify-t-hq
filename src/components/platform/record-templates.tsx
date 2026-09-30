import Link from "next/link";

import { applyTemplateAction } from "@/app/(portal)/_actions/platform";
import { ApplyTemplateForm } from "@/components/platform/platform-forms";
import { readTemplates, type RecordTemplate } from "@/lib/api/platform";

/** Add a template's tasks to this record, read as the page renders. */
export async function RecordTemplates({
  token,
  appliesTo,
  subjectId,
  returnPath,
}: {
  token: string;
  appliesTo: "company" | "deal" | "lead";
  subjectId: string;
  returnPath: string;
}) {
  let templates: RecordTemplate[] | null = null;
  try {
    templates = (await readTemplates(token, appliesTo)).templates.filter(
      (template) => !template.archived,
    );
  } catch {
    templates = null;
  }
  if (templates === null) return <p className="muted">The templates could not be read just now.</p>;
  return (
    <>
      <ApplyTemplateForm
        action={applyTemplateAction}
        templates={templates}
        subjectId={subjectId}
        returnPath={returnPath}
      />
      <p className="field__hint">
        <Link href="/tasks/templates">Manage templates</Link>
      </p>
    </>
  );
}
