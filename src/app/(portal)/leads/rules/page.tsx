import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { saveColdChecksAction, saveCountryRuleAction } from "@/app/(portal)/leads/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { ColdChecksForm, CountryRuleForm } from "@/components/crm/cold-rules-form";
import { LeadTabs } from "@/components/crm/lead-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { RecordSection } from "@/components/ui/record-shell";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readColdSettings, type ColdSettings } from "@/lib/api/crm";
import { COLD_CHECKS, COLD_HELD_VIEWS } from "@/lib/crm/prospects";
import { formatAbsolute, formatNumber, formatPercent } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Sending rules" };
export const dynamic = "force-dynamic";

const BASE = "/leads/rules";

const RULE_TONES: Record<string, PillTone> = {
  opt_out: "live",
  consent: "neutral",
  hold: "attention",
};

const SET_BY: Record<string, string> = {
  admin: "An admin",
  default: "The default",
  nobody: "Nobody yet",
};

type RulesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function prospectsHref(condition: string): string {
  return `/leads/prospects?f=${encodeURIComponent(condition)}`;
}

export default async function LeadRulesPage({ searchParams }: RulesPageProps) {
  const context = await requireStaff(BASE);
  const parameters = await searchParams;
  const chosen = (firstSearchValue(parameters.country) ?? "").slice(0, 60);
  const showAll = firstSearchValue(parameters.all) === "1";
  const canEdit = hasCapability(context, "hq:admin");
  let view: ColdSettings | null = null;
  try {
    view = await readColdSettings(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;

  const countries = view
    ? view.jurisdictions.filter((row) => showAll || row.prospects > 0 || row.set_by === "admin")
    : [];
  const held = view ? view.prospects - view.mailable : 0;
  const pageHref = (over: { country?: string; all?: boolean }, anchor = "") => {
    const params = new URLSearchParams();
    if (over.all ?? showAll) params.set("all", "1");
    if (over.country) params.set("country", over.country);
    const rendered = params.toString();
    return `${BASE}${rendered ? `?${rendered}` : ""}${anchor}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Sending rules"
        description="What must be true before the team writes first to someone it found: the address is known to be good, the country allows it, and one person at a firm is enough. None of this applies to a lead who wrote in, a person in the CRM or a customer."
        actions={<LeadTabs current={BASE} />}
      />
      <div className="page-content">
        {view === null ? (
          <Callout tone="danger" role="alert">
            The sending rules could not be read just now. Nothing is sent to a prospect while they
            cannot be read.
          </Callout>
        ) : (
          <>
            <StatGrid columns={6} label="What the rules add up to today">
              <Stat label="Prospects" value={formatNumber(view.prospects)} />
              <Stat
                label="May be written to first"
                value={formatNumber(view.mailable)}
                hint={
                  view.prospects ? formatPercent(view.mailable / view.prospects) : "none here yet"
                }
              />
              <Stat
                label="One send would take"
                value={formatNumber(view.first_send)}
                hint={
                  view.rules.one_per_firm
                    ? `one each at ${formatNumber(view.mailable_firms)} firms`
                    : "everyone the rules allow"
                }
              />
              <Stat
                label={<Link href={prospectsHref("verified:is:valid")}>Verified valid</Link>}
                value={formatNumber(view.verified.valid ?? 0)}
                hint={
                  (view.verified.stale ?? 0) > 0
                    ? `${formatNumber(view.verified.stale ?? 0)} checked too long ago`
                    : undefined
                }
              />
              <Stat
                label={<Link href={prospectsHref("verified:is:unchecked")}>Never checked</Link>}
                value={formatNumber(view.verified.unchecked ?? 0)}
              />
              <Stat
                label="Risky or invalid"
                value={formatNumber((view.verified.risky ?? 0) + (view.verified.invalid ?? 0))}
                hint={`${formatNumber(view.verified.risky ?? 0)} risky · ${formatNumber(view.verified.invalid ?? 0)} invalid`}
              />
            </StatGrid>

            <div className="record-layout">
              <div className="record-layout__main">
                <RecordSection id="cold-held" title="What holds the rest">
                  {held === 0 ? (
                    <p className="page-note">
                      {view.prospects === 0
                        ? "No prospects yet. Bring a list in under Import and this page says how much of it a first email could reach."
                        : "Nothing is held: every prospect could be written to today."}
                    </p>
                  ) : (
                    <>
                      <p className="audience-summary">
                        <strong>{formatNumber(held)}</strong> of {formatNumber(view.prospects)} are
                        held. Each is counted once, under the first rule that says no.
                      </p>
                      <ul className="reason-list">
                        {Object.entries(view.held_by_reason).map(([reason, count]) => {
                          const seen = COLD_HELD_VIEWS[reason];
                          return (
                            <li key={reason}>
                              <span>
                                {view.reasons[reason] ?? reason}
                                {seen && (
                                  <>
                                    {" · "}
                                    <Link className="text-link" href={seen.href}>
                                      {seen.label}
                                    </Link>
                                  </>
                                )}
                              </span>
                              <span className="reason-list__count">{formatNumber(count)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </RecordSection>

                <RecordSection
                  id="countries"
                  title="Country by country"
                  actions={
                    <Link className="text-link" href={pageHref({ all: !showAll }, "#countries")}>
                      {showAll
                        ? "Only countries with prospects"
                        : `Show all ${formatNumber(view.jurisdictions.length)} countries`}
                    </Link>
                  }
                >
                  <DataTable
                    caption="Country rules"
                    columns={[
                      { key: "country", label: "Country" },
                      { key: "rule", label: "Rule" },
                      { key: "asks", label: "What it asks", width: "38%" },
                      { key: "prospects", label: "Prospects", align: "end" as const },
                      { key: "set_by", label: "Set by" },
                      ...(canEdit ? [{ key: "change", label: "" }] : []),
                    ]}
                    columnMenu={false}
                    scroll={false}
                    isEmpty={countries.length === 0}
                    empty={
                      <p className="page-note">
                        No prospect carries a country yet. The rule for each one appears here as
                        soon as a list is in.
                      </p>
                    }
                  >
                    {countries.map((row) => (
                      <tr key={row.country || "none"}>
                        <td className="nowrap">
                          <span className="table-title">
                            {row.country || "No country on the lead"}
                          </span>
                        </td>
                        <td className="nowrap">
                          <StatusPill
                            value={row.rule}
                            label={row.rule_label}
                            tone={RULE_TONES[row.rule] ?? "neutral"}
                          />
                        </td>
                        <td>
                          {row.note}
                          {row.subject_prefix && (
                            <span className="table-sub">
                              The subject starts with{" "}
                              <span className="mono">{row.subject_prefix}</span>
                            </span>
                          )}
                        </td>
                        <td className="data-table__num">
                          {row.prospects > 0 ? (
                            <Link
                              href={prospectsHref(
                                row.country ? `country:is:${row.country}` : "country:empty:",
                              )}
                            >
                              {formatNumber(row.prospects)}
                            </Link>
                          ) : (
                            "0"
                          )}
                        </td>
                        <td className="nowrap">{SET_BY[row.set_by] ?? row.set_by}</td>
                        {canEdit && (
                          <td className="nowrap">
                            {row.country && (
                              <Link
                                className="text-link"
                                href={pageHref({ country: row.country }, "#country-rule")}
                                aria-label={`Change the rule for ${row.country}`}
                              >
                                Change
                              </Link>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </DataTable>
                  <p className="page-note">
                    The defaults are a cautious reading of each country&apos;s rules for a first
                    email to a published business address. They are a map, not legal advice: a
                    country nobody has decided is held, and a rule changes only with a reason that
                    is kept.
                  </p>
                </RecordSection>
              </div>

              <aside className="record-layout__side">
                {canEdit && (
                  <SudoGate
                    action={confirmSudoAction}
                    fresh={fresh}
                    untilLabel={untilLabel}
                    returnPath={BASE}
                    purpose="Changing who may be written to first needs a fresh code from your authenticator app."
                  />
                )}
                <Card
                  title="The checks"
                  titleAs="h3"
                  description="Applied to every prospect before a campaign or a sequence takes them."
                >
                  {canEdit ? (
                    <ColdChecksForm
                      action={saveColdChecksAction}
                      rules={view.rules}
                      disabled={!fresh}
                    />
                  ) : (
                    <>
                      <KeyValue>
                        {COLD_CHECKS.map((check) => (
                          <KeyValueRow key={check.key} label={check.label}>
                            {view.rules[check.key] ? "On" : "Off"}
                          </KeyValueRow>
                        ))}
                        <KeyValueRow label="A verification counts for">
                          {formatNumber(view.rules.verify_stale_days)} days
                        </KeyValueRow>
                      </KeyValue>
                      <p className="page-note">An owner or admin changes these.</p>
                    </>
                  )}
                </Card>
                {canEdit && (
                  <Card
                    title="A country's rule"
                    titleAs="h3"
                    titleId="country-rule"
                    description="Decide a country nobody has decided, or change one on advice."
                  >
                    <CountryRuleForm
                      key={chosen || "none"}
                      action={saveCountryRuleAction}
                      jurisdictions={view.jurisdictions}
                      ruleLabels={view.rule_labels}
                      initialCountry={chosen}
                      disabled={!fresh}
                    />
                  </Card>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </>
  );
}
