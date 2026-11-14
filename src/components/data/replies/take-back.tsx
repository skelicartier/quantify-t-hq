import { MailForm } from "@/components/mail/mail-form";
import { Popover } from "@/components/ui/popover";
import type { Effect, TakeBackPlan } from "@/lib/data/api/replies";
import type { ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** What a reply did, in words. */
export function effectWords(effect: Effect): string {
  switch (effect.kind) {
    case "waitlist_joined":
      return effect.created
        ? "Put the firm on the waitlist"
        : "Added them to the firm on the waitlist";
    case "stop_added":
      return `Put ${effect.email} on the stop list`;
    case "stop_already":
      return `${effect.email} was on the stop list already`;
    case "stop_failed":
      return "Could not reach the stop list: a follow-up asks you to add them";
    case "follow_up":
      return "Set a follow-up";
    case "lead_added":
      return `Added ${effect.email} as a lead`;
    case "investor_stage":
      return "Moved the investor's stage";
    case "firm_held":
      return `Held ${addresses(effect.held)} at ${effect.domain}`;
  }
}

const addresses = (count: number) =>
  `${count.toLocaleString("en-GB")} ${count === 1 ? "address" : "addresses"}`;

/** What taking a reply back undid, in the past tense. */
export function undoneWords(effect: Effect): string {
  switch (effect.kind) {
    case "stop_added":
      return `Took ${effect.email} off the stop list`;
    case "follow_up":
      return "Closed its follow-up";
    case "firm_held":
      return `Released the ${addresses(effect.held)} held at ${effect.domain}`;
    default:
      return effectWords(effect);
  }
}

function undoWords(effect: Effect): string {
  switch (effect.kind) {
    case "stop_added":
      return `Take ${effect.email} off the stop list`;
    case "follow_up":
      return "Close its follow-up";
    case "firm_held":
      return `Release the ${addresses(effect.held)} held at ${effect.domain}`;
    default:
      return effectWords(effect);
  }
}

/** "Take this back": what will be undone, what will stay and why, then the one button. */
export function TakeBack({
  replyId,
  leadId,
  plan,
  action,
}: {
  replyId: string;
  leadId: string;
  plan: TakeBackPlan;
  action: Action;
}) {
  return (
    <Popover label="Take this back" align="start" width="wide">
      <div className="stack-form stack-form--tight">
        {plan.undo.length > 0 ? (
          <>
            <p className="page-note">This is undone:</p>
            <ul className="hqdata-reply__did">
              {plan.undo.map((effect, index) => (
                <li key={`undo-${index}`}>{undoWords(effect)}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="page-note">Nothing it did needs undoing.</p>
        )}
        {plan.keep.length > 0 && (
          <>
            <p className="page-note">This stays:</p>
            <ul className="hqdata-reply__did">
              {plan.keep.map((item, index) => (
                <li key={`keep-${index}`}>
                  {effectWords(item.effect)}: {item.why}
                </li>
              ))}
            </ul>
          </>
        )}
        <MailForm
          action={action}
          fields={{ reply_id: replyId, lead_id: leadId }}
          submitLabel="Take it back"
          pendingLabel="Taking it back…"
          variant="danger"
        />
      </div>
    </Popover>
  );
}
