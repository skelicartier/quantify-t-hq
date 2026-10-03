"use server";

import { customFromForm } from "@/lib/forms/custom-fields";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as crmApi from "@/lib/api/crm";
import * as dataQualityApi from "@/lib/api/data-quality";
import * as signalsApi from "@/lib/api/signals";
import { saveSegment } from "@/lib/api/mail";
import { fieldValue } from "@/lib/auth/forms";
import { COLD_CHECKS, parseTags } from "@/lib/crm/prospects";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const READ_ONLY: ActionState = {
  status: "error",
  message: "Your role reads the CRM without writing to it.",
};

/** The lead's text fields a person edits in place, with the service's limits. */
const LEAD_TEXT_FIELDS: Record<string, number> = {
  full_name: 160,
  email: 254,
  company_name: 200,
  title: 120,
  firm_type: 40,
  website: 255,
  country: 60,
  city: 80,
  phone: 40,
  registration_no: 60,
  source_url: 400,
  notes: 4000,
  email_kind: 16,
  verified_state: 12,
};

function sent(message: string | null, extra: Partial<ActionState> = {}): ActionState {
  return { status: "sent", message, sentAt: Date.now(), ...extra };
}

function jsonField<T>(formData: FormData, name: string, limit: number): T | null {
  try {
    return JSON.parse(fieldValue(formData, name, limit)) as T;
  } catch {
    return null;
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;
}

export async function createLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const email = fieldValue(formData, "email", 254).trim();
  const fullName = fieldValue(formData, "full_name", 160).trim();
  if (!email && !fullName) return { status: "error", message: "Give a name or an email." };
  let leadId: string;
  try {
    const created = await crmApi.createLead(context.token, {
      email,
      full_name: fullName,
      company_name: fieldValue(formData, "company_name", 200).trim(),
      source_key: fieldValue(formData, "source_key", 32),
      message: fieldValue(formData, "message", 8_000).trim(),
      custom: customFromForm(formData),
    });
    leadId = created.lead.lead_id;
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/leads");
  redirect(`/leads/${leadId}`);
}

/** One field at a time from the properties panel: today, the owner. */
export async function updateLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const leadId = fieldValue(formData, "lead_id", 64);
  const input: Record<string, unknown> = {};
  if (formData.has("owner_staff_id"))
    input.owner_staff_id = fieldValue(formData, "owner_staff_id", 64);
  // One field per submission: only what the form carries is sent, so nothing else on
  // the lead can be blanked by an edit to its neighbour.
  for (const [name, limit] of Object.entries(LEAD_TEXT_FIELDS))
    if (formData.has(name)) input[name] = fieldValue(formData, name, limit).trim();
  if (formData.has("tags")) input.tags = parseTags(fieldValue(formData, "tags", 400));
  if (Object.keys(input).length === 0) return { status: "error", message: "Nothing to change." };
  try {
    await crmApi.updateLead(context.token, leadId, input);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}

export async function updateLeadStageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const leadId = fieldValue(formData, "lead_id", 64);
  const stage = fieldValue(formData, "stage", 20);
  const input: Record<string, unknown> = { stage };
  if (stage === "disqualified") {
    input.disqualify_reason = fieldValue(formData, "disqualify_reason", 40);
  }
  try {
    await crmApi.updateLead(context.token, leadId, input);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/home");
  return { status: "sent", message: "Stage saved.", sentAt: Date.now() };
}

/** Qualify: find-or-create the company and the person, optionally open the deal. */
export async function convertLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const leadId = fieldValue(formData, "lead_id", 64);

  const company: Record<string, string> = {};
  const companyId = fieldValue(formData, "company_id", 64);
  if (companyId) {
    company.company_id = companyId;
  } else {
    const name = fieldValue(formData, "company_name", 200).trim();
    const domain = fieldValue(formData, "domain", 255).trim().toLowerCase();
    if (name) company.name = name;
    if (domain) company.domain = domain;
  }
  const input: Record<string, unknown> = { company };
  if (formData.get("with_deal") === "on") {
    const nextStep = fieldValue(formData, "next_step", 400).trim();
    const due = fieldValue(formData, "next_step_due", 10);
    if (!nextStep || !due) {
      return { status: "error", message: "A new deal needs its next step and a date." };
    }
    const mrr = Number(fieldValue(formData, "mrr_amount", 16) || 0);
    input.deal = {
      stage_key: fieldValue(formData, "stage_key", 32) || "demo_booked",
      mrr_amount: Number.isFinite(mrr) && mrr > 0 ? mrr : 0,
      next_step: nextStep,
      next_step_due: due,
    };
  }
  let target: string;
  try {
    const converted = await crmApi.convertLead(context.token, leadId, input);
    target = converted.deal_id
      ? `/deals/${converted.deal_id}`
      : `/companies/${converted.company_id}`;
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/deals");
  revalidatePath("/companies");
  revalidatePath("/home");
  redirect(target);
}

// ---------------------------------------------------------------------------------------
// prospects: a file in and out, one change across a view, a view saved as a segment
// ---------------------------------------------------------------------------------------

/** One part of a file. The component sends parts in turn and adds the answers up. */
export async function importLeadsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/import");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const rows = jsonField<Record<string, unknown>[]>(formData, "rows_json", 4_000_000) ?? [];
  if (!rows.length) return { status: "error", message: "No rows to send." };
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 4) return { status: "error", message: "Say where the file came from." };
  try {
    const result = await crmApi.importLeads(context.token, {
      rows,
      reason,
      source_key: fieldValue(formData, "source_key", 32),
      label: fieldValue(formData, "label", 120),
      run_id: fieldValue(formData, "run_id", 64),
      update_existing: formData.get("update_existing") === "on",
      // The lead's columns the file may replace; the service refuses any other name.
      overwrite: jsonField<string[]>(formData, "overwrite_json", 400) ?? [],
      // A rehearsal: the same accounting, nothing written.
      dry_run: formData.get("dry_run") === "on",
    });
    return sent(null, { detail: JSON.stringify(result) });
  } catch (error) {
    return crmRefusal(error);
  }
}

/** One part of a verifier's file: the address and what it said, per row. */
export async function importLeadVerificationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/import");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const rows = jsonField<Record<string, unknown>[]>(formData, "rows_json", 4_000_000) ?? [];
  if (!rows.length) return { status: "error", message: "No rows to send." };
  const label = fieldValue(formData, "label", 120).trim();
  try {
    const result = await crmApi.importLeadVerification(context.token, {
      rows,
      label: label.length >= 2 ? label : "A verifier's file",
    });
    revalidatePath("/leads/prospects");
    revalidatePath("/leads/rules");
    return sent(null, { detail: JSON.stringify(result) });
  } catch (error) {
    return crmRefusal(error);
  }
}

const NOT_ADMIN_RULES: ActionState = {
  status: "error",
  message: "Only HQ owners and admins change the sending rules.",
};

function coldSaved(view: crmApi.ColdSettings): string {
  return `Saved. ${view.mailable.toLocaleString("en-GB")} of ${plural(view.prospects, "prospect", "prospects")} could be written to first today.`;
}

/** The four checks and how long a verification counts; one reason for the change. */
export async function saveColdChecksAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/rules");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN_RULES;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 4) return { status: "error", message: "Say why the checks are changing." };
  const days = Number(fieldValue(formData, "verify_stale_days", 6).trim());
  if (!Number.isInteger(days) || days < 1)
    return { status: "error", message: "A verification counts for a whole number of days." };
  try {
    const view = await crmApi.updateColdSettings(context.token, {
      reason,
      ...Object.fromEntries(
        COLD_CHECKS.map((check) => [check.key, formData.get(check.key) === "on"]),
      ),
      verify_stale_days: days,
    });
    revalidatePath("/leads/rules");
    return sent(coldSaved(view));
  } catch (error) {
    return crmRefusal(error);
  }
}

/** One country's rule, or back to its default. */
export async function saveCountryRuleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/rules");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN_RULES;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 4) return { status: "error", message: "Say why the rule is changing." };
  const country = fieldValue(formData, "country", 60).trim();
  if (!country) return { status: "error", message: "Name the country." };
  const reset = fieldValue(formData, "reset", 4) === "1";
  try {
    const view = await crmApi.updateColdSettings(context.token, {
      reason,
      jurisdiction: reset
        ? { country, reset: true }
        : {
            country,
            rule: fieldValue(formData, "rule", 12),
            note: fieldValue(formData, "note", 300).trim(),
            subject_prefix: fieldValue(formData, "subject_prefix", 12).trim(),
          },
    });
    revalidatePath("/leads/rules");
    return sent(reset ? `Back to the default. ${coldSaved(view).slice(7)}` : coldSaved(view));
  } catch (error) {
    return crmRefusal(error);
  }
}

/** Take a file back out: only its untouched rows go, and the answer says how many stayed. */
export async function rollbackLeadImportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/import");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 4) return { status: "error", message: "Say why it is being taken back." };
  try {
    const result = await crmApi.rollbackLeadImport(
      context.token,
      fieldValue(formData, "import_id", 64),
      reason,
    );
    revalidatePath("/leads/import");
    revalidatePath("/leads/prospects");
    return sent(
      result.kept
        ? `Took back ${plural(result.removed, "lead", "leads")}. ${plural(result.kept, "lead", "leads")} somebody had started on stayed.`
        : `Took back ${plural(result.removed, "lead", "leads")}.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

const BULK_CHANGES = [
  "owner",
  "stage",
  "tags_add",
  "tags_remove",
  "verified",
  "nurture",
  "nurture_end",
] as const;

/** One change to everything the current view matches: one request, one audit row. */
export async function bulkProspectsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/prospects");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const change = fieldValue(formData, "change", 20) as (typeof BULK_CHANGES)[number];
  if (!BULK_CHANGES.includes(change)) return { status: "error", message: "Choose what to change." };
  const value = fieldValue(formData, `value_${change}`, 400).trim();
  const set: Record<string, unknown> = {};
  if (change === "owner") set.owner_staff_id = value;
  else if (change === "stage") {
    if (!value) return { status: "error", message: "Choose a stage." };
    set.stage = value;
    if (value === "disqualified")
      set.disqualify_reason = fieldValue(formData, "disqualify_reason", 40) || "not_a_fit";
  } else if (change === "verified") set.verified_state = value;
  else if (change === "nurture") {
    set.nurture_until = value;
    set.nurture_note = fieldValue(formData, "nurture_note", 400).trim();
  } else if (change === "nurture_end") set.nurture_until = "";
  else {
    const tags = parseTags(value);
    if (!tags.length) return { status: "error", message: "Type at least one tag." };
    set[change] = tags;
  }
  const conditions = jsonField<string[]>(formData, "conditions_json", 8000) ?? [];
  try {
    const result = await crmApi.bulkLeads(context.token, {
      origin: "prospect",
      conditions,
      q: fieldValue(formData, "q", 120),
      stage_filter: fieldValue(formData, "stage_filter", 20),
      set,
    });
    revalidatePath("/leads/prospects");
    if (result.queued && result.job)
      return sent(
        `Changing ${plural(result.matched, "lead", "leads")} in the background: ${result.job.processed.toLocaleString("en-GB")} done so far. The banner above says how far it has got.`,
      );
    const parts = [
      `Changed ${plural(result.changed, "lead", "leads")} of ${result.matched.toLocaleString("en-GB")}`,
    ];
    if (result.unchanged) parts.push(`${result.unchanged.toLocaleString("en-GB")} already had it`);
    if (result.skipped) parts.push(`${result.skipped.toLocaleString("en-GB")} could not change`);
    return sent(`${parts.join("; ")}.`);
  } catch (error) {
    return crmRefusal(error);
  }
}

/** Stop a change running in the background where it is. */
export async function cancelLeadJobAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/prospects");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  try {
    const result = await crmApi.cancelLeadJob(context.token, fieldValue(formData, "job_id", 64));
    revalidatePath("/leads/prospects");
    return sent(
      `Stopped after ${plural(result.job.processed, "lead", "leads")}; what was changed stays changed.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

/**
 * The current view, saved as a segment of leads — and, when asked, straight on to a new
 * campaign for it. A segment is the same question asked again when the campaign is
 * scheduled, so people who join the view later are included and people who left are not.
 */
export async function saveViewSegmentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/prospects");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const name = fieldValue(formData, "name", 120).trim();
  if (!name) return { status: "error", message: "Name the segment." };
  const conditions = jsonField<string[]>(formData, "conditions_json", 8000) ?? [];
  if (!conditions.length)
    return { status: "error", message: "Filter the list first: a segment needs a condition." };
  let segmentId: string;
  let count: number;
  try {
    const saved = await saveSegment(context.token, { name, kind: "leads", conditions });
    segmentId = saved.segment.segment_id;
    count = saved.segment.last_count ?? 0;
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/leads/segments");
  revalidatePath("/mail/segments");
  if (fieldValue(formData, "then", 10) === "mail")
    redirect(`/mail/campaigns/new?segment=${segmentId}`);
  return sent(`Saved. ${plural(count, "lead matches", "leads match")} today.`);
}

/** Save every suggestion that is not yet a segment. */
export async function saveAllSuggestionsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/segments");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  let saved = 0;
  try {
    const page = await crmApi.readLeadSuggestions(context.token);
    for (const suggestion of page.suggestions) {
      if (suggestion.segment_id) continue;
      await saveSegment(context.token, {
        name: suggestion.name,
        kind: "leads",
        conditions: suggestion.conditions,
      });
      saved += 1;
    }
  } catch (error) {
    revalidatePath("/leads/segments");
    return crmRefusal(error);
  }
  revalidatePath("/leads/segments");
  revalidatePath("/mail/segments");
  return sent(
    saved ? `Saved ${plural(saved, "segment", "segments")}.` : "Every suggestion is already saved.",
  );
}

/** The fit rules, as an admin set them. Changing them re-bands every lead at once. */
export async function saveFitRulesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/fit");
  if (!hasCapability(context, "hq:admin"))
    return { status: "error", message: "Only HQ admins change the fit rules." };
  const reset = fieldValue(formData, "reset", 4) === "1";
  const rules = reset ? null : jsonField<Record<string, unknown>>(formData, "rules_json", 60_000);
  if (!reset && !rules) return { status: "error", message: "The rules could not be read." };
  try {
    const result = await crmApi.updateLeadSettings(
      context.token,
      reset ? { reset: true } : { rules },
    );
    revalidatePath("/leads/fit");
    revalidatePath("/leads/prospects");
    revalidatePath("/leads/segments");
    const bands = result.bands;
    return sent(
      `${reset ? "Defaults restored" : "Saved"}. ${bands.A ?? 0} best fit, ${bands.B ?? 0} worth a look, ${bands.C ?? 0} weak.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

// ---------------------------------------------------------------------------------------
// duplicates and tidying
// ---------------------------------------------------------------------------------------

function idList(formData: FormData, name: string, most: number): string[] {
  return fieldValue(formData, name, 4_000)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, most);
}

/** Fold leads into the one chosen to stay; each field's choice is a `choose.<field>` radio. */
export async function mergeLeadsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/duplicates");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const keep = fieldValue(formData, "keep", 64).trim();
  const fold = idList(formData, "fold", 9);
  if (!keep || fold.length === 0) {
    return { status: "error", message: "Choose the leads to merge from the duplicates review." };
  }
  const choose: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value === "string" && name.startsWith("choose.")) {
      choose[name.slice("choose.".length, 40)] = value.slice(0, 64);
    }
  }
  try {
    await dataQualityApi.mergeLeads(context.token, keep, fold, choose);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/leads/duplicates");
  revalidatePath("/leads/prospects");
  revalidatePath("/data-health");
  redirect(`/leads/${keep}`);
}

/** Leads that are a CRM person already: disqualified as that person's duplicates. */
export async function markLeadsAsPersonAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/duplicates");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const personId = fieldValue(formData, "person_id", 64).trim();
  const leadIds = idList(formData, "lead_ids", 10);
  try {
    const result = await dataQualityApi.markLeadsAsPerson(context.token, leadIds, personId);
    revalidatePath("/leads/duplicates");
    revalidatePath("/data-health");
    return sent(
      `Marked ${plural(result.marked.length, "lead", "leads")} as the CRM person${
        result.filled.length
          ? `; the person's ${result.filled.join(" and ")} filled in from it`
          : ""
      }.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

/** "Not the same": the review stops asking about these records until another joins them. */
export async function dismissLeadGroupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/duplicates");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  try {
    await dataQualityApi.dismissDuplicates(context.token, {
      kind: "lead",
      ids: idList(formData, "ids", 20),
      person_ids: idList(formData, "person_ids", 20),
      reason: fieldValue(formData, "reason", 200).trim(),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/leads/duplicates");
  revalidatePath("/data-health");
  return sent("Kept apart. The review asks again only if another look-alike joins them.");
}

/** A group judged "not the same", back in the review. */
export async function restoreDuplicatesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/duplicates");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const back =
    fieldValue(formData, "back", 64) === "/companies/duplicates"
      ? "/companies/duplicates"
      : "/leads/duplicates";
  try {
    await dataQualityApi.restoreDuplicates(context.token, fieldValue(formData, "key", 64).trim());
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(back);
  revalidatePath("/data-health");
  return sent("Back in the review.");
}

/** A tidy-up from the data health page, after its preview. */
export async function applyStandardiseAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/data-health");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const kind = fieldValue(formData, "kind", 20);
  let result: Awaited<ReturnType<typeof dataQualityApi.applyStandardise>>;
  try {
    result = await dataQualityApi.applyStandardise(context.token, kind);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/data-health");
  revalidatePath("/data-health/tidy");
  revalidatePath("/leads/prospects");
  // Past the inline limit it runs in the background: Prospects shows how far it has got.
  if (result.queued) redirect("/leads/prospects");
  return sent(`Changed ${plural(result.changed, "lead", "leads")}.`);
}

// ---------------------------------------------------------------------------------------
// triage, and a lead set aside until a date
// ---------------------------------------------------------------------------------------

const TRIAGE = "/leads/triage";

/** The triage queue again, with the leads already dealt with this round left out. */
function nextInTriage(formData: FormData, leadId: string): never {
  const skipped = fieldValue(formData, "skip", 2_000)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  revalidatePath("/leads");
  revalidatePath(TRIAGE);
  redirect(`${TRIAGE}?skip=${[...skipped, leadId].slice(-50).join(",")}`);
}

/** Triage's "take it": the lead is yours, and the next one comes up. */
export async function takeLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(TRIAGE);
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const leadId = fieldValue(formData, "lead_id", 64);
  const me = context.me.staff.staff_id;
  if (fieldValue(formData, "owner_staff_id", 64) !== me) {
    try {
      await crmApi.updateLead(context.token, leadId, { owner_staff_id: me });
    } catch (error) {
      return crmRefusal(error);
    }
  }
  nextInTriage(formData, leadId);
}

/** Triage's "disqualify", with its reason; the next one comes up. */
export async function disqualifyFromTriageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(TRIAGE);
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const leadId = fieldValue(formData, "lead_id", 64);
  try {
    await crmApi.updateLead(context.token, leadId, {
      stage: "disqualified",
      disqualify_reason: fieldValue(formData, "disqualify_reason", 40),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  nextInTriage(formData, leadId);
}

/**
 * Set a lead aside until a date. From triage the next one comes up; from the record the
 * record says until when.
 */
export async function nurtureLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const leadId = fieldValue(formData, "lead_id", 64);
  try {
    await crmApi.nurtureLead(context.token, leadId, {
      until: fieldValue(formData, "until", 10),
      note: fieldValue(formData, "note", 400).trim(),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  if (fieldValue(formData, "from", 10) !== "record") nextInTriage(formData, leadId);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return sent("Set aside. It comes back to you on the day, unread.");
}

/** Bring a lead back before its day. */
export async function endNurtureAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const leadId = fieldValue(formData, "lead_id", 64);
  try {
    await crmApi.endNurture(context.token, leadId);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return sent("Back on the working lists.");
}

/** Close a sign of interest: acted on (with a line, if any) or dismissed. */
export async function decideSignalAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/leads/signals");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const state = fieldValue(formData, "state", 10) === "dismissed" ? "dismissed" : "acted";
  try {
    await signalsApi.decideSignal(
      context.token,
      fieldValue(formData, "signal_id", 64),
      state,
      fieldValue(formData, "note", 400).trim(),
    );
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/leads/signals");
  const back = fieldValue(formData, "return_path", 300);
  if (back.startsWith("/") && !back.startsWith("//")) revalidatePath(back);
  return {
    status: "sent",
    message: state === "acted" ? "Marked acted on." : "Dismissed.",
    sentAt: Date.now(),
  };
}
