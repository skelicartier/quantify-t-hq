/**
 * Taking a reply back: what it did is undone where that is safe and kept where it is not,
 * each with the reason, and the preview says which before anything changes. A stop it
 * added comes off Mail merge's stop list (through the engine, as it went on), unless another
 * "No" from them still stands or the entry there now is not the one it made; a follow-up
 * still open is closed; a lead it added stays (no lead is ever removed), and so does a
 * waitlist firm or an investor's stage, which are changed on their own pages. A firm hold
 * it made is released, by the hold's own rules: someone who said no since, or an entry
 * put back for another reason, stays on the stop list, and the take-back says why.
 */

import { Refused } from "../../mail-merge/engine";
import type { Staff } from "../protocol";
import type { Effect, TakeBack } from "../leads/contracts";
import { releaseFirmHold } from "./firm-holds";
import { saidNo, type RecordContext } from "./record";

export type TakeBackPlan = { undo: Effect[]; keep: { effect: Effect; why: string }[] };

export function planTakeBack(replyId: string, context: RecordContext): TakeBackPlan {
  const reply = context.book.byId.get(replyId);
  if (!reply) throw new Refused(404, "not_found", "That reply is not here.");
  if (context.book.takeBacks.has(replyId))
    throw new Refused(409, "taken_back", "That reply was taken back already.");
  context.core.sender.poll();
  const plan: TakeBackPlan = { undo: [], keep: [] };
  /** Another reply to the address, not taken back, that said no: the stop is still owed to it. */
  const anotherNo = (email: string): boolean =>
    (context.book.byEmail.get(email) ?? []).some(
      (other) =>
        other.reply_id !== replyId &&
        other.outcome === "not_interested" &&
        !context.book.takeBacks.has(other.reply_id),
    );
  for (const effect of reply.effects) {
    switch (effect.kind) {
      case "stop_added": {
        const stop = context.core.sender.stop(effect.email);
        if (!stop) plan.keep.push({ effect, why: "It is no longer on the stop list." });
        else if (anotherNo(effect.email))
          plan.keep.push({
            effect,
            why: "Another “No” from them still stands, so they stay on the stop list.",
          });
        else if (stop.reason !== "asked" || (effect.at !== undefined && stop.at !== effect.at))
          // Taken off and put on again since (by hand, or by the provider): not this reply's entry.
          plan.keep.push({
            effect,
            why: "They were put on the stop list again since, so they stay on it.",
          });
        else plan.undo.push(effect);
        break;
      }
      case "stop_already":
        plan.keep.push({ effect, why: "It was on the stop list before this reply, so it stays." });
        break;
      case "stop_failed":
        plan.keep.push({ effect, why: "Nothing reached the stop list." });
        break;
      case "follow_up": {
        const item = context.followUps.get(effect.follow_up_id);
        if (item?.state === "open") plan.undo.push(effect);
        else plan.keep.push({ effect, why: "The follow-up is done already." });
        break;
      }
      case "lead_added":
        plan.keep.push({
          effect,
          why: `${effect.email} stays in All leads: a lead is never removed.`,
        });
        break;
      case "waitlist_joined":
        plan.keep.push({
          effect,
          why: "The firm stays on the waitlist; move or drop it on its page.",
        });
        break;
      case "investor_stage":
        plan.keep.push({ effect, why: "The investor keeps its stage; move it back in Investors." });
        break;
      case "firm_held": {
        const hold = context.firmHolds.get(effect.hold_id);
        const open = hold ? context.firmHolds.open(hold).length : 0;
        // The preview counts what is still held now, which a release may have lowered.
        if (open > 0) plan.undo.push({ ...effect, held: open });
        else plan.keep.push({ effect, why: "Nothing in that hold is still held back." });
        break;
      }
    }
  }
  return plan;
}

export async function takeBack(
  replyId: string,
  by: Staff,
  context: RecordContext,
): Promise<{ undone: Effect[]; kept: { effect: Effect; why: string }[]; message: string }> {
  const plan = planTakeBack(replyId, context);
  const reply = context.book.byId.get(replyId)!;
  const at = context.core.now();
  const undone: Effect[] = [];
  const kept = [...plan.keep];
  for (const effect of plan.undo) {
    if (effect.kind === "stop_added") {
      try {
        await context.core.engine("removeStop", { email: effect.email });
        undone.push(effect);
      } catch (error) {
        kept.push({
          effect,
          why: error instanceof Refused ? error.message : "Mail merge could not be reached.",
        });
      }
      continue;
    }
    if (effect.kind === "follow_up") {
      const item = context.followUps.get(effect.follow_up_id);
      if (item) context.followUps.takeBack(item, by, at);
      undone.push(effect);
      continue;
    }
    if (effect.kind === "firm_held") {
      const hold = context.firmHolds.get(effect.hold_id);
      if (!hold) continue;
      try {
        const result = await releaseFirmHold(hold, undefined, by, {
          core: context.core,
          leads: context.leads,
          holds: context.firmHolds,
          saidNo: (email) => saidNo(context.book, email),
          refresh: () => context.leads.module.index.bump(),
        });
        if (result.released.length > 0) undone.push({ ...effect, held: result.released.length });
        for (const item of result.kept)
          kept.push({ effect, why: `${item.email} stays on the stop list: ${item.why}.` });
      } catch (error) {
        kept.push({
          effect,
          why: error instanceof Refused ? error.message : "Mail merge could not be reached.",
        });
      }
    }
  }
  context.core.sender.poll();
  const record: TakeBack = { kind: "take_back", reply_id: replyId, at, by, undone, kept };
  context.book.appendTakeBack(record);
  context.leads.noteReply(reply.email, context.book.markFor(reply.email));
  const parts: string[] = [];
  if (undone.some((effect) => effect.kind === "stop_added"))
    parts.push(`${reply.email} is off the stop list again`);
  const closed = undone.filter((effect) => effect.kind === "follow_up").length;
  if (closed)
    parts.push(closed === 1 ? "its follow-up is closed" : `${closed} follow-ups are closed`);
  for (const effect of undone)
    if (effect.kind === "firm_held")
      parts.push(
        `the ${effect.held.toLocaleString("en-GB")} ${effect.held === 1 ? "address" : "addresses"} held at ${effect.domain} ${effect.held === 1 ? "is" : "are"} released`,
      );
  const message = parts.length
    ? `Taken back: ${parts.join(", and ")}.`
    : "Taken back. Nothing it did needed undoing.";
  return { undone, kept, message };
}
