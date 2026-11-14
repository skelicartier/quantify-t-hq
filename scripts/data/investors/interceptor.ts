/**
 * What a reply from someone at an investor firm does (spec §3.8, the interceptor table).
 * The replies module asks before it runs any effect of its own; an address on the
 * investor list is ours, and the reply moves the investor firm instead:
 *
 * - Yes: Replied, with the next step "Book a meeting" in one working day. No waitlist.
 * - No: Passed, "No reason given". The replies module still puts the address on Mail
 *   merge's stop list (every "no" goes there, his rule), as it does for anyone.
 * - Later: Set aside until the day given (the form's own day, 14 days on unless he
 *   changed it), or 30 days when no day came with it.
 * - Question: Replied; the replies module adds the follow-up "Answer {name}'s question".
 * - Wrong person: whoever they named joins the firm's people, and All leads as a lead.
 * - Out of office: no move; a follow-up for the working day after they are back.
 * - Meeting request (raise spec §7.2.2): Replied, with the next step "Send times or your
 *   booking link" due today, when the firm is before or at Replied; otherwise a line on
 *   its activity and the stage kept. No waitlist.
 * - Needs review: only a line on the firm's activity; the replies module adds the
 *   follow-up "Decide what {name}'s reply means".
 *
 * A reply never drags a firm backwards: one already at Soft commit, Signed, Money in or
 * Do not pitch keeps its stage, and a Yes to a firm past Replied keeps it where it is.
 * Every reply leaves a line on the firm's activity either way.
 */

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { addDays, addWorkingDays, workingDayAfter } from "../days";
import { normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import { OUTCOMES } from "../../../src/lib/data/labels";
import type { Effect, Interceptor, LeadsService, Reply, RepliesService } from "../leads/contracts";
import type { LeadRow } from "../leads/types";
import type { InvestorsBook } from "./book";
import { BEFORE_REPLIED, KEPT_BY_REPLIES, type Investor } from "./types";

export const SET_ASIDE_DAYS = 30;

export function investorInterceptor(core: DataCore, book: InvestorsBook): Interceptor {
  return {
    name: "investors",
    owns: (email) => book.owns(email),
    apply: async (reply: Reply, ctx: { lead: LeadRow; by: Staff }) => {
      const investor = book.forEmail(reply.email);
      if (!investor) return [];
      const effects: Effect[] = [];
      const today = core.day();
      const name = ctx.lead.name || ctx.lead.email;
      const outcome = OUTCOMES[reply.outcome].label;
      const heard = `${name} replied: ${outcome}`;
      const move = (
        stage: Investor["stage"],
        patch: Pick<Investor, "next_step" | "next_step_on" | "set_aside_until" | "passed_reason">,
      ) => {
        const moved = book.replyMoves(investor, stage, patch, ctx.by, heard);
        if (moved.from !== moved.to)
          effects.push({
            kind: "investor_stage",
            investor_id: investor.investor_id,
            from: moved.from,
            to: moved.to,
          });
      };
      const step = (next_step: string, next_step_on: string) => ({
        next_step,
        next_step_on,
        set_aside_until: null,
        passed_reason: "" as const,
      });
      const kept = KEPT_BY_REPLIES.has(investor.stage);

      switch (reply.outcome) {
        case "replied_positive": {
          const next = step("Book a meeting", addWorkingDays(today, 1));
          if (BEFORE_REPLIED.has(investor.stage) || investor.stage === "replied")
            move("replied", next);
          else book.replyNote(investor, heard, ctx.by, "The stage was kept.");
          break;
        }
        case "meeting_request": {
          const next = step("Send times or your booking link", today);
          if (BEFORE_REPLIED.has(investor.stage) || investor.stage === "replied")
            move("replied", next);
          else book.replyNote(investor, heard, ctx.by, "The stage was kept.");
          break;
        }
        case "needs_review": {
          // The follow-up itself is the replies module's ("Decide what {name}'s reply means").
          book.replyNote(investor, heard, ctx.by);
          break;
        }
        case "not_interested": {
          if (kept) book.replyNote(investor, heard, ctx.by, "The stage was kept.");
          else
            move("passed", {
              next_step: "",
              next_step_on: null,
              set_aside_until: null,
              passed_reason: "none_given",
            });
          break;
        }
        case "not_now": {
          const until = reply.later_until ?? addDays(today, SET_ASIDE_DAYS);
          if (kept) book.replyNote(investor, heard, ctx.by, "The stage was kept.");
          else
            move("set_aside", {
              next_step: "Write to them again",
              next_step_on: until,
              set_aside_until: until,
              passed_reason: "",
            });
          break;
        }
        case "question": {
          // The follow-up itself is the replies module's ("Answer {name}'s question").
          if (BEFORE_REPLIED.has(investor.stage) || investor.stage === "replied")
            move("replied", step(`Answer ${name}'s question`, today));
          else book.replyNote(investor, heard, ctx.by);
          break;
        }
        case "wrong_person": {
          const referral = reply.referral;
          const named = referral?.name || referral?.email || "the person they named";
          const email = referral?.email ? normaliseEmail(referral.email) : "";
          const due = addWorkingDays(today, 2);
          if (email) {
            const leads = core.need<LeadsService>("leads");
            if (leads && !leads.byEmail(email)) {
              const added = leads.addManual({
                email,
                values: {
                  full_name: referral?.name ?? "",
                  title: referral?.title ?? "",
                  company: ctx.lead.company || investor.firm,
                  firm_type: ctx.lead.firm_type,
                  country: ctx.lead.country,
                  city: ctx.lead.city,
                },
                origin: "referral",
                referred_by: reply.email,
                by: ctx.by,
              });
              leads.tag(added.lead_id, ["Referral"], [], ctx.by);
              effects.push({ kind: "lead_added", lead_id: added.lead_id, email: added.email });
            }
            try {
              book.addPerson(
                investor,
                { email, name: referral?.name ?? "", title: referral?.title ?? "" },
                ctx.by,
                `Named by ${name}`,
              );
            } catch (error) {
              // someone already at another investor firm stays where they are
              if (!(error instanceof Refused)) throw error;
            }
          }
          const next = email
            ? step(`Write to ${named}, named by ${name}`, due)
            : step(`Find an address for ${named}`, due);
          if (BEFORE_REPLIED.has(investor.stage) || investor.stage === "replied")
            move("replied", next);
          else book.replyNote(investor, heard, ctx.by, `Named ${named}`);
          break;
        }
        case "out_of_office": {
          const back = workingDayAfter(reply.later_until ?? addDays(today, 14));
          const replies = core.need<RepliesService>("replies");
          if (replies) {
            const item = replies.addFollowUp({
              email: reply.email,
              kind: "write_again",
              title: `Write to ${name} again`,
              due_on: back,
              from_reply_id: reply.reply_id,
              by: ctx.by,
            });
            effects.push({ kind: "follow_up", follow_up_id: item.follow_up_id });
          }
          book.replyNote(investor, heard, ctx.by, `Back after ${reply.later_until ?? "a while"}`);
          break;
        }
      }
      book.save();
      return effects;
    },
  };
}
