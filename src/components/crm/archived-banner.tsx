import { Callout } from "@/components/ui/callout";
import { RowAction } from "@/components/ui/row-action";
import type { ActionState } from "@/lib/forms/action-state";
import { formatAbsolute } from "@/lib/format";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** Said at the top of an archived record: off the lists, kept whole, and Put back. */
export function ArchivedBanner({
  kind,
  recordId,
  archivedAt,
  canRestore,
  action,
}: {
  kind: "companies" | "people";
  recordId: string;
  archivedAt: string | null | undefined;
  canRestore: boolean;
  action: Action;
}) {
  return (
    <Callout tone="attention" compact>
      <span className="archived-banner">
        <span>
          Archived{archivedAt ? ` ${formatAbsolute(archivedAt)}` : ""}. It is off every list, search
          and mail audience, and keeps everything linked to it.
        </span>
        {canRestore && (
          <RowAction
            action={action}
            fields={{ kind, record_id: recordId }}
            buttons={[
              { label: "Put back", className: "btn btn--small", pendingLabel: "Putting back…" },
            ]}
          />
        )}
      </span>
    </Callout>
  );
}
