import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { ExportMenu } from "@/components/documents/export-menu";
import { PrintButton } from "@/components/documents/print-button";
import type { StaffContext } from "@/lib/access/core";
import { canExport, type ExportKind } from "@/lib/exports";
import { formatAbsolute } from "@/lib/format";

type DocumentToolsProps = {
  context: StaffContext;
  /** The records this list exports; none for a page that only prints. */
  kind?: ExportKind | undefined;
  returnPath: string;
  /**
   * The list's current query and how many records it shows, when the view is narrower
   * than the whole list: the export then offers "this view" first.
   */
  view?: { query: string; count: number } | undefined;
};

/** Print, and Export for those whose role may take these records out of HQ. */
export function DocumentTools({ context, kind, returnPath, view }: DocumentToolsProps) {
  const allowed = kind !== undefined && canExport(context.me.capabilities, kind);
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  return (
    <span className="doc-tools">
      <PrintButton label="Print" />
      {allowed && (
        <ExportMenu
          kind={kind}
          returnPath={returnPath}
          returnQuery={view?.query}
          viewCount={view?.count}
          sudoFresh={context.me.sudo_fresh}
          sudoUntilLabel={untilLabel}
          sudoAction={confirmSudoAction}
        />
      )}
    </span>
  );
}
