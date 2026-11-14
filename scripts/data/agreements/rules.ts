/**
 * The legal-document register's arithmetic and its "What is missing" check, pure
 * (ws-notes/company/spec.md §5.4 and §7.5). The end of a fixed term is the day before the
 * same date that many months on, unless he typed the end day; an agreement that renews on
 * its own moves to its next renewal once a renewal day passes without notice; the notice-by
 * day is that many days before the renewal.
 */

import { addMonths, type PeopleLetters } from "../company-contracts";
import { addDays } from "../days";
import type { WaitlistFeed } from "../raise-contracts";
import { AGREEMENT_TYPES, countWords } from "../../../src/lib/data/labels-registers";
import { IP_POINT_URL, LABOUR_CODES_URL } from "./limits";
import type { Agreement, AgreementType, MustRow, Party } from "./types";

/** The end of a fixed term: typed, or the day before the same date `months` on. */
export function endsOn(agreement: Agreement): string | null {
  if (agreement.term.ends_on) return agreement.term.ends_on;
  const { months } = agreement.term;
  if (!agreement.effective_on || !months) return null;
  return addDays(addMonths(agreement.effective_on, months), -1);
}

export type Worked = {
  ends_on: string | null;
  /** The current renewal: the first one not passed yet (or the one notice was given for). */
  renews_on: string | null;
  notice_by: string | null;
  /** Renewals that passed without notice, oldest first. */
  renewed: string[];
  notice_state: "none" | "given" | "open" | "passed";
};

/**
 * The worked-out days on a day. Only a signed agreement moves on to its next renewal; a
 * renewal day passes once today is after it. With notice given, renewals stop at the one
 * the notice was given for.
 */
export function worked(agreement: Agreement, today: string): Worked {
  const ends = endsOn(agreement);
  const { renewal } = agreement;
  if (!renewal.auto || !renewal.renews_on)
    return { ends_on: ends, renews_on: null, notice_by: null, renewed: [], notice_state: "none" };
  let current = renewal.renews_on;
  const renewed: string[] = [];
  const limit = renewal.notice_given ? renewal.notice_given.on : today;
  if (agreement.status === "signed" && renewal.months)
    for (let turns = 0; current < limit && turns < 1_200; turns += 1) {
      renewed.push(current);
      current = addMonths(renewal.renews_on, renewal.months * (turns + 1));
    }
  const noticeBy = renewal.notice_days ? addDays(current, -renewal.notice_days) : current;
  return {
    ends_on: ends,
    renews_on: current,
    notice_by: noticeBy,
    renewed,
    notice_state: renewal.notice_given ? "given" : noticeBy < today ? "passed" : "open",
  };
}

export const isSigned = (agreement: Agreement): boolean => agreement.status === "signed";
export const isEnded = (agreement: Agreement): boolean =>
  agreement.status === "expired" || agreement.status === "terminated";

const withParty = (agreement: Agreement, kind: Party["kind"], refId: string): boolean =>
  agreement.parties.some((party) => party.kind === kind && party.ref_id === refId);

/** Two agreements with the same counterparty: the same record, or the same name typed. */
const sameParty = (a: Party, b: Party): boolean =>
  a.ref_id !== null && b.ref_id !== null
    ? a.kind === b.kind && a.ref_id === b.ref_id
    : a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

export type MissingInput = {
  agreements: readonly Agreement[];
  /** The founders among the directors in office today; null without the company record. */
  founders: { director_id: string; name: string }[] | null;
  letters: ReturnType<PeopleLetters["counts"]> | null;
  waitlist: ReturnType<WaitlistFeed["entries"]> | null;
  investors: { investor_id: string; firm: string; stage: string }[] | null;
};

const signedOf = (agreements: readonly Agreement[], types: readonly AgreementType[]) =>
  agreements.filter((item) => isSigned(item) && types.includes(item.type));

/** "1 of 2", with the noun in the singular for one. */
const ofCount = (part: number, whole: number) => `${countWords(part)} of ${countWords(whole)}`;

/**
 * "What is missing": eight rows, each with what HQ found and why it matters. The rows on
 * people engaged are counts from the people ledger and never name anyone.
 */
export function missingRows(input: MissingInput): MustRow[] {
  const { agreements } = input;
  const rows: MustRow[] = [];

  // 1. The founder's IP assignment.
  const founderIds = new Set((input.founders ?? []).map((founder) => founder.director_id));
  const founderIp = agreements.find(
    (item) =>
      isSigned(item) &&
      (item.type === "founder_ip" ||
        (item.type === "ip_assignment" &&
          item.parties.some(
            (party) =>
              party.kind === "director" && party.ref_id !== null && founderIds.has(party.ref_id),
          ))),
  );
  rows.push({
    key: "founder_ip",
    item: "Founder IP assignment",
    found: founderIp
      ? `Signed: “${founderIp.title}”`
      : input.founders && input.founders.length > 0
        ? "No signed assignment from the founders in the company record."
        : "No signed founder IP assignment.",
    state: founderIp ? "here" : "missing",
    why: "The code was written before the company existed, so the company owns it only through an assignment.",
    source_url: IP_POINT_URL,
    missing: founderIp
      ? []
      : (input.founders ?? []).map((founder) => ({
          name: founder.name,
          href: `/data/company/directors/${founder.director_id}`,
        })),
  });

  // 2 and 3. Letters and IP assignments for the people engaged: counts only.
  const counted = (
    key: string,
    item: string,
    part: number | null,
    whole: number | null,
    words: string,
    why: string,
    source: string,
  ): MustRow => ({
    key,
    item,
    found:
      part === null || whole === null
        ? "Checked in People, by the Owner."
        : `${ofCount(part, whole)} ${words}`,
    state:
      part === null || whole === null
        ? "not_checked"
        : whole === 0
          ? "not_needed"
          : part >= whole
            ? "here"
            : "missing",
    why,
    source_url: source,
    missing: [],
  });
  rows.push(
    counted(
      "letters",
      "Appointment and intern letters",
      input.letters?.with_letter ?? null,
      input.letters?.engaged ?? null,
      "people engaged have a signed letter",
      "The Labour Codes in force since 21 Nov 2025 ask for an appointment letter for everyone who works for the company.",
      LABOUR_CODES_URL,
    ),
  );
  rows.push(
    counted(
      "people_ip",
      "IP assignments for interns and contractors",
      input.letters?.with_ip ?? null,
      input.letters?.interns_and_contractors ?? null,
      "interns and contractors have an IP assignment",
      "Indian law does not make the company the owner of what interns and contractors create.",
      IP_POINT_URL,
    ),
  );

  // 4–6. The waitlist firms at Pilot or Customer.
  const firmRow = (
    key: string,
    item: string,
    stages: readonly string[],
    covers: (agreement: Agreement) => boolean,
    words: string,
    why: string,
  ): MustRow => {
    if (!input.waitlist)
      return {
        key,
        item,
        found: "The waitlist is not set up here.",
        state: "not_checked",
        why,
        source_url: "",
        missing: [],
      };
    const firms = input.waitlist.filter((entry) => stages.includes(entry.stage));
    const missing = firms
      .filter(
        (entry) =>
          !agreements.some(
            (agreement) =>
              isSigned(agreement) &&
              covers(agreement) &&
              withParty(agreement, "waitlist", entry.entry_id),
          ),
      )
      .map((entry) => ({ name: entry.firm, href: `/data/waitlist/${entry.entry_id}` }));
    return {
      key,
      item,
      found:
        firms.length === 0
          ? "No waitlist firm is there yet."
          : `${ofCount(firms.length - missing.length, firms.length)} ${words}`,
      state: firms.length === 0 ? "not_needed" : missing.length ? "missing" : "here",
      why,
      source_url: "",
      missing,
    };
  };
  rows.push(
    firmRow(
      "nda",
      "NDAs with pilot firms",
      ["pilot", "customer"],
      (agreement) =>
        agreement.type === "nda" ||
        (["msa", "pilot", "trial"].includes(agreement.type) &&
          agreement.confidentiality_clause === "yes"),
      "firms at Pilot or Customer have a signed NDA or confidentiality clause",
      "A firm that tries the product sees work that is not public; an NDA, or a confidentiality clause in its agreement, covers what it sees.",
    ),
  );
  rows.push(
    firmRow(
      "pilot",
      "A pilot agreement with each pilot firm",
      ["pilot"],
      (agreement) => agreement.type === "pilot" || agreement.type === "trial",
      "firms at Pilot have a signed pilot or trial agreement",
      "A pilot agreement says what the pilot covers, how long it runs and what happens to the data after it.",
    ),
  );
  rows.push(
    firmRow(
      "customer",
      "An agreement with each customer",
      ["customer"],
      (agreement) => agreement.type === "msa" || agreement.type === "order_form",
      "customers have a signed agreement or order form",
      "A customer pays under terms both sides signed: the services, the price and how either side ends it.",
    ),
  );

  // 7. A DPA where an agreement covers personal data.
  const needsDpa = signedOf(agreements, ["msa", "order_form", "pilot"]).filter(
    (item) => item.personal_data,
  );
  const dpas = signedOf(agreements, ["dpa"]);
  const withoutDpa = needsDpa.filter(
    (item) =>
      !dpas.some((dpa) =>
        dpa.parties.some((party) => item.parties.some((other) => sameParty(party, other))),
      ),
  );
  rows.push({
    key: "dpa",
    item: "A DPA where an agreement covers personal data",
    found:
      needsDpa.length === 0
        ? "No signed agreement is marked as covering personal data."
        : `${ofCount(needsDpa.length - withoutDpa.length, needsDpa.length)} agreements that cover personal data have a signed DPA`,
    state: needsDpa.length === 0 ? "not_needed" : withoutDpa.length ? "missing" : "here",
    why: "Where the company handles personal data for another firm, a data processing agreement says how it is kept and used.",
    source_url: "",
    missing: withoutDpa.map((item) => ({
      name: item.title,
      href: `/data/company/agreements/${item.agreement_id}`,
    })),
  });

  // 8. Investment documents with each investor who signed.
  if (!input.investors)
    rows.push({
      key: "investment",
      item: "Investment documents with each investor who signed",
      found: "Investors is not set up here.",
      state: "not_checked",
      why: "The shares an investor takes rest on the signed investment documents.",
      source_url: "",
      missing: [],
    });
  else {
    const signedFirms = input.investors.filter(
      (firm) => firm.stage === "signed" || firm.stage === "money_in",
    );
    const missing = signedFirms
      .filter(
        (firm) =>
          !agreements.some(
            (agreement) =>
              isSigned(agreement) &&
              agreement.type === "investment" &&
              withParty(agreement, "investor", firm.investor_id),
          ),
      )
      .map((firm) => ({ name: firm.firm, href: `/data/investors/${firm.investor_id}` }));
    rows.push({
      key: "investment",
      item: "Investment documents with each investor who signed",
      found:
        signedFirms.length === 0
          ? "No investor firm is at Signed or Money in yet."
          : `${ofCount(signedFirms.length - missing.length, signedFirms.length)} firms at Signed or Money in have signed investment documents`,
      state: signedFirms.length === 0 ? "not_needed" : missing.length ? "missing" : "here",
      why: "The shares an investor takes rest on the signed investment documents.",
      source_url: "",
      missing,
    });
  }
  return rows;
}

/** The register's words for a type, for search and the services. */
export const typeLabel = (type: AgreementType): string => AGREEMENT_TYPES[type];
