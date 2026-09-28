"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { DealFlags, DueChip } from "@/components/crm/pills";
import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormFeedback } from "@/components/ui/form-feedback";
import type { BoardColumn } from "@/lib/api/deals";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { formatMoneyBy, formatMrr, formatMrrBy } from "@/lib/format";

type Deal = BoardColumn["deals"][number];

type DealBoardProps = {
  columns: readonly BoardColumn[];
  today: string;
  /** A default for the next step's date when a card is dropped on a new stage. */
  defaultDue: string;
  /** Plain names keyed by staff id; null when the directory could not be read. */
  names: Record<string, string> | null;
  /** The stage-move action; absent for a role that reads the pipeline without moving it. */
  moveAction?: ((previous: ActionState, formData: FormData) => Promise<ActionState>) | undefined;
};

type PendingMove = { deal: Deal; toKey: string; toLabel: string };

function ownerName(names: Record<string, string> | null, id: string): string {
  if (!id) return "Unowned";
  if (names === null) return "Name unavailable";
  return names[id] ?? "—";
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?";
}

/**
 * The pipeline as columns. A card drags to another stage; the drop opens the one
 * question a stage move must answer — what happens next, and by when — and the move
 * is written only when it is answered. Without a pointer, the deal page moves stages.
 */
export function DealBoard({ columns, today, defaultDue, names, moveAction }: DealBoardProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const dealsById = new Map(
    columns.flatMap((column) => column.deals.map((deal) => [deal.deal_id, deal])),
  );
  const canMove = Boolean(moveAction);

  const dropOn = (column: BoardColumn) => (event: React.DragEvent) => {
    event.preventDefault();
    setOver(null);
    const id = event.dataTransfer.getData("text/deal-id") || dragging;
    setDragging(null);
    if (!id || !canMove) return;
    const deal = dealsById.get(id);
    if (!deal || deal.stage_key === column.key || column.outcome || deal.status !== "open") return;
    setPending({ deal, toKey: column.key, toLabel: column.label });
  };

  return (
    <>
      <div className="board" role="region" aria-label="Pipeline board" tabIndex={0}>
        {columns.map((column) => {
          const droppable = canMove && !column.outcome && dragging !== null;
          return (
            <section
              key={column.key}
              className={[
                "board__column",
                column.outcome ? `board__column--${column.outcome}` : "",
                droppable ? "board__column--droppable" : "",
                over === column.key && droppable ? "board__column--over" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-labelledby={`board-col-${column.key}`}
              onDragOver={(event) => {
                if (!droppable) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (over !== column.key) setOver(column.key);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                if (over === column.key) setOver(null);
              }}
              onDrop={dropOn(column)}
            >
              <header className="board__head">
                <div className="board__title-row">
                  <h2 className="board__title" id={`board-col-${column.key}`}>
                    {column.label}
                  </h2>
                  <span className="board__count" aria-label={`${column.deals.length} deals`}>
                    {column.deals.length}
                  </span>
                </div>
                <p className="board__sums">
                  <span className="board__mrr">{formatMrrBy(column.mrr_total)}</span>
                  {!column.outcome && (
                    <span className="board__weighted">
                      {column.win_probability}%
                      {column.weighted_total !== null &&
                        ` · ${formatMoneyBy(column.weighted_total)} weighted`}
                    </span>
                  )}
                </p>
              </header>
              {column.deals.length === 0 ? (
                <p className="board__empty">{droppable ? "Drop here" : "No deals"}</p>
              ) : (
                <ol className="board__cards">
                  {column.deals.map((deal) => {
                    const owner = ownerName(names, deal.owner_staff_id);
                    const movable = canMove && deal.status === "open";
                    return (
                      <li key={deal.deal_id}>
                        <article
                          className={[
                            "deal-card",
                            deal.flags.length > 0 ? "deal-card--flagged" : "",
                            dragging === deal.deal_id ? "deal-card--dragging" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          draggable={movable}
                          onDragStart={(event) => {
                            if (!movable) return;
                            event.dataTransfer.setData("text/deal-id", deal.deal_id);
                            event.dataTransfer.effectAllowed = "move";
                            setDragging(deal.deal_id);
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                        >
                          <div className="deal-card__top">
                            <Link className="deal-card__title" href={`/deals/${deal.deal_id}`}>
                              {deal.company_name || deal.name}
                            </Link>
                            <span
                              className="deal-card__owner"
                              title={owner}
                              aria-label={`Owner: ${owner}`}
                            >
                              {deal.owner_staff_id ? initials(owner) : "–"}
                            </span>
                          </div>
                          <p className="deal-card__money">
                            <span>
                              {deal.mrr_amount !== null
                                ? formatMrr(deal.mrr_amount, deal.currency)
                                : "—"}
                            </span>
                            <span className="deal-card__seats">
                              {deal.seats} {deal.seats === 1 ? "seat" : "seats"}
                            </span>
                          </p>
                          {deal.status === "open" && deal.next_step && (
                            <p className="deal-card__step">
                              <span className="deal-card__step-text">{deal.next_step}</span>
                              <DueChip due={deal.next_step_due} today={today} />
                            </p>
                          )}
                          <DealFlags
                            flags={deal.flags}
                            idleDays={deal.idle_days}
                            daysInStage={deal.days_in_stage}
                          />
                          <p className="deal-card__foot">
                            <span>
                              {deal.status === "open"
                                ? `${deal.days_in_stage}d in stage`
                                : deal.loss_reason
                                  ? "Lost"
                                  : ""}
                            </span>
                            {movable && (
                              <span className="deal-card__grip" aria-hidden="true">
                                ⋮⋮
                              </span>
                            )}
                          </p>
                        </article>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>
      {pending && moveAction && (
        <MoveDialog
          move={pending}
          action={moveAction}
          defaultDue={defaultDue}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}

function MoveDialog({
  move,
  action,
  defaultDue,
  onClose,
}: {
  move: PendingMove;
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  defaultDue: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    if (state.status === "sent") {
      router.refresh();
      const timer = window.setTimeout(onClose, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [state, onClose, router]);

  return (
    <dialog
      ref={dialogRef}
      className="move-dialog"
      aria-labelledby="move-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <form className="move-dialog__frame" action={formAction}>
        <AttemptField state={state} />
        <input type="hidden" name="deal_id" value={move.deal.deal_id} />
        <input type="hidden" name="stage_key" value={move.toKey} />
        <h2 id="move-title" className="move-dialog__title">
          Move to {move.toLabel}
        </h2>
        <p className="move-dialog__sub">
          {move.deal.company_name || move.deal.name} · from {move.deal.stage_label}. A stage move
          names its next step.
        </p>
        <Field id="board-move-step" label="Next step">
          <Input
            id="board-move-step"
            name="next_step"
            maxLength={400}
            required
            autoFocus
            placeholder="What happens next, and who does it"
            disabled={isPending}
          />
        </Field>
        <Field id="board-move-due" label="By">
          <Input
            id="board-move-due"
            name="next_step_due"
            type="date"
            defaultValue={defaultDue}
            min={new Date().toISOString().slice(0, 10)}
            required
            disabled={isPending}
          />
        </Field>
        <div className="move-dialog__actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Moving…" : "Move deal"}
          </Button>
        </div>
        <FormFeedback state={state} />
      </form>
    </dialog>
  );
}
