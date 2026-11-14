import type { Closing, Deadline, KeyDateLink } from "@/lib/data/api/closing";
import { formatNumber } from "@/lib/format";
import {
  DEADLINE_WORDS,
  HOLDER_KINDS,
  VALUATION_KINDS,
  backersLine,
  dayWords,
  moneyWords,
  type ClosingStep,
} from "@/lib/data/labels-close";

/**
 * A closing's steps and deadlines in words, as the firm's Closing section and the Closing
 * view print them: "₹25,00,000 from their own account · FIRC WALK-FIRC-1", "Serial
 * PAS-4/001", "Folio F003", "Allot by 13 Mar 2027", "PAS-3 filed 20 Mar 2027".
 */

/** "Allot by 13 Mar 2027", or once done "Allotted 12 Mar 2027". */
export function deadlineWords(deadline: Deadline): string {
  const words = DEADLINE_WORDS[deadline.rule_key] ?? { by: deadline.title, done: deadline.title };
  return deadline.done_on
    ? `${words.done} ${dayWords(deadline.done_on)}`
    : `${words.by} ${dayWords(deadline.on)}`;
}

/** "Walk Fund 281, a fund". */
export function holderWords(holder: Closing["holder"]): string {
  return `${holder.name}, ${HOLDER_KINDS[holder.kind]}`;
}

export function pooledWords(pooled: Closing["pooled"]): string {
  if (!pooled) return "";
  return `${backersLine(pooled.backers)}${pooled.fee_note ? ` · ${pooled.fee_note}` : ""}`;
}

/** The day a step was recorded on, or null while it is not. */
export function stepDay(closing: Closing, step: ClosingStep): string | null {
  const value = closing[step];
  if (!value) return null;
  return "on" in value ? value.on : null;
}

/** What the checklist's Detail column says of a recorded step. */
export function stepDetail(
  closing: Closing,
  step: ClosingStep,
  classes: Map<string, string>,
): string {
  switch (step) {
    case "documents_sent":
      return closing.documents_sent?.what ?? "";
    case "documents_signed":
      return closing.documents_signed?.file_id ? "Signed copy kept in Files" : "";
    case "offer_letter":
      return closing.offer_letter ? `Serial ${closing.offer_letter.serial}` : "";
    case "money_received": {
      const money = closing.money_received;
      if (!money) return "";
      return [
        `${moneyWords(money.amount, money.currency)} ${money.own_account ? "from their own account" : "not marked as from their own account"}`,
        money.reference ? `FIRC ${money.reference}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "bank_kyc":
      return closing.bank_kyc
        ? closing.bank_kyc.from_receiving_bank
          ? "From the bank that received the money"
          : "Not from the bank that received the money"
        : "";
    case "valuation": {
      const valuation = closing.valuation;
      if (!valuation) return "";
      return `${valuation.from_round ? "The round's: " : ""}${valuation.by_name} · ${VALUATION_KINDS[valuation.kind]}`;
    }
    case "board_approval":
      return closing.board_approval?.words ?? "";
    case "allotment": {
      const allotment = closing.allotment;
      if (!allotment) return "";
      const className = allotment.class_id ? classes.get(allotment.class_id) : null;
      return `${formatNumber(allotment.shares)} shares at ${moneyWords(allotment.price_per_share, "INR")} a share${className ? ` · ${className}` : ""}`;
    }
    case "register":
      return closing.register
        ? `Folio ${closing.register.folio}${closing.register.by_hand ? " · ticked by hand" : ""}`
        : "";
    case "certificate":
      return closing.certificate ? `Certificate ${closing.certificate.number}` : "";
    case "refund": {
      const refund = closing.refund;
      if (!refund) return "";
      return `${moneyWords(refund.amount, refund.currency)} refunded${refund.interest ? ` with ${moneyWords(refund.interest, refund.currency)} interest` : ""}`;
    }
  }
}

/** The Key dates a step added, by the origin it added them under. */
export function datesForStep(
  investorId: string,
  step: ClosingStep,
  links: readonly KeyDateLink[] | null,
): KeyDateLink[] {
  if (!links) return [];
  const origin =
    step === "money_received"
      ? [`closing:${investorId}:money`]
      : step === "allotment"
        ? [`closing:${investorId}:allotment`, "closing:fla"]
        : step === "refund"
          ? [`closing:${investorId}:refund`]
          : [];
  return links.filter((link) => origin.includes(link.origin_key));
}
