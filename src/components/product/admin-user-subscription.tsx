"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { Meter } from "@/components/ui/meter";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type {
  AccountApiAdminUserUsage,
  AccountApiEntitlementOverride,
} from "@/lib/product/account-api";
import {
  allowanceStanding,
  canonicalPlan,
  CANONICAL_PLANS,
  chatModelForPlan,
  researchModelForPlan,
  modelLabel,
  featureLabel,
  featureNote,
  featurePeriod,
  featureUnit,
  FEATURE_KEYS,
  formatAllowance,
  isBooleanFeature,
  isQuotaFeature,
  planDescription,
  planLabel,
  TRIAL_DAYS,
  TRIAL_DEEP_RESEARCH_CAP,
  type FeatureKey,
  type PlanDefault,
  type PlanKey,
} from "@/lib/product/plan-catalogue";
import {
  effectiveEntitlements,
  INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
  INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
  OVERRIDE_EXPIRY_CHOICES,
  OVERRIDE_REASON_MAX,
  OVERRIDE_REASON_MIN,
  type AdminEntitlementOverrideState,
  type AdminSubscriptionPlanState,
} from "@/lib/product/subscription";
import { formatNumber } from "@/lib/format";

type PlanAction = (
  state: AdminSubscriptionPlanState,
  formData: FormData,
) => Promise<AdminSubscriptionPlanState>;

type OverrideAction = (
  state: AdminEntitlementOverrideState,
  formData: FormData,
) => Promise<AdminEntitlementOverrideState>;

type AdminUserSubscriptionProps = {
  userId: string;
  /** The tier string as stored on the profile, before canonicalisation. */
  storedTier: string;
  usage: AccountApiAdminUserUsage | null;
  canManage: boolean;
  isSelf: boolean;
  planAction?: PlanAction | undefined;
  overrideAction?: OverrideAction | undefined;
  now?: number | undefined;
};

const ENTITLEMENT_COLUMNS = [
  { key: "feature", label: "Feature" },
  { key: "default", label: "Plan default" },
  { key: "override", label: "Override" },
  { key: "effective", label: "Effective" },
  { key: "used", label: "Used this period" },
] as const;

function instant(value: string | null | undefined): number {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** The counter the API most recently touched for a feature. */
function latestCounter(
  usage: AccountApiAdminUserUsage | null,
  feature: FeatureKey,
): AccountApiAdminUserUsage["counters"][number] | null {
  let best: AccountApiAdminUserUsage["counters"][number] | null = null;
  for (const counter of usage?.counters ?? []) {
    if (counter.feature_key !== feature) continue;
    if (!best || instant(counter.updated_at) >= instant(best.updated_at)) best = counter;
  }
  return best;
}

function AllowanceValue({ value }: { value: PlanDefault }) {
  if (value.kind === "boolean") {
    return <StatusPill value={value.enabled ? "on" : "off"} />;
  }
  return <span className="num">{formatAllowance(value.limit)}</span>;
}

function sameValue(left: PlanDefault, right: PlanDefault): boolean {
  if (left.kind === "boolean" && right.kind === "boolean") return left.enabled === right.enabled;
  if (left.kind === "limit" && right.kind === "limit") return left.limit === right.limit;
  return false;
}

function OverrideCell({
  feature,
  override,
  now,
}: {
  feature: FeatureKey;
  override: AccountApiEntitlementOverride | null;
  now: number | undefined;
}) {
  if (!override) return <span className="quiet">None applied</span>;
  const value: PlanDefault = isBooleanFeature(feature)
    ? { kind: "boolean", enabled: override.bool_value === true }
    : { kind: "limit", limit: override.limit_value };
  return (
    <>
      <span className="data-table__primary">
        <AllowanceValue value={value} />
      </span>
      <span className="data-table__secondary">
        {override.reason || "No reason recorded"}
        {" · "}
        {override.effective_to ? (
          <Timestamp value={override.effective_to} now={now} prefix="expires" mode="both" />
        ) : (
          "no expiry recorded"
        )}
      </span>
    </>
  );
}

function UsedCell({
  feature,
  usage,
  limit,
  now,
}: {
  feature: FeatureKey;
  usage: AccountApiAdminUserUsage | null;
  limit: number | null;
  now: number | undefined;
}) {
  if (!isQuotaFeature(feature)) {
    return <span className="quiet">Not metered</span>;
  }
  if (!usage) return <span className="quiet">Counters unavailable</span>;
  const counter = latestCounter(usage, feature);
  if (!counter) return <span className="quiet">Nothing spent</span>;
  const spent = counter.used + counter.reserved;
  const standing = allowanceStanding(spent, limit);
  return (
    <>
      <span className="data-table__primary num">
        {formatNumber(spent)}
        {limit === null ? "" : ` of ${formatNumber(limit)}`}
      </span>
      <Meter
        label={`${featureLabel(feature)}: ${formatNumber(spent)} of ${formatAllowance(limit)} used`}
        value={spent}
        limit={limit}
        tone={standing === "over" ? "danger" : standing === "near" ? "attention" : "success"}
      />
      <span className="data-table__secondary">
        {counter.period_key || "current period"}
        {counter.reserved > 0 ? ` · ${formatNumber(counter.reserved)} reserved` : ""}
        {" · "}
        <Timestamp value={counter.updated_at} now={now} prefix="updated" />
      </span>
    </>
  );
}

function PlanForm({
  userId,
  currentPlan,
  action,
}: {
  userId: string;
  currentPlan: PlanKey;
  action: PlanAction;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ADMIN_SUBSCRIPTION_PLAN_STATE,
  );
  const [selected, setSelected] = useState<PlanKey>(currentPlan);
  const [trial, setTrial] = useState(false);
  const unchanged = selected === currentPlan && !trial;
  const downgrade = CANONICAL_PLANS.indexOf(selected) < CANONICAL_PLANS.indexOf(currentPlan);

  return (
    // React returns the fields to their defaults once an action settles, so the state
    // behind them is put back at the same moment. Without this the select would show the
    // current plan while the component still believed the operator had chosen another —
    // and the next submission would send the one they could no longer see.
    <form
      className="role-form"
      action={formAction}
      onReset={() => {
        setSelected(currentPlan);
        setTrial(false);
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      {/* The API compares this against the stored profile; a conflict returns the real
          version and the operator confirms against it rather than the console retrying. */}
      <input type="hidden" name="expectedProfileVersion" value={state.expectedProfileVersion} />
      <Field id={`plan-${userId}`} label="Plan" hint={planDescription(selected)}>
        <Select
          id={`plan-${userId}`}
          name="plan"
          value={selected}
          disabled={pending}
          onChange={(event) => setSelected(canonicalPlan(event.target.value))}
          aria-describedby={`plan-${userId}-hint`}
        >
          {CANONICAL_PLANS.map((plan) => (
            <option key={plan} value={plan}>
              {planLabel(plan)}
              {plan === currentPlan ? " (current)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Checkbox
        id={`plan-trial-${userId}`}
        name="startTrial"
        label={`Start a ${TRIAL_DAYS}-day trial`}
        description={`A trial is Desk for ${TRIAL_DAYS} days with Deep Research capped at ${TRIAL_DEEP_RESEARCH_CAP}. When it ends the account falls back to the plan above.`}
        checked={trial}
        disabled={pending}
        onChange={(event) => setTrial(event.target.checked)}
      />
      <Checkbox
        id={`plan-confirm-${userId}`}
        name="confirm"
        label="I understand this changes what this account may spend"
        description={
          downgrade ? "Lowering a plan takes allowances away as soon as it is applied." : undefined
        }
        tone={downgrade ? "danger" : "default"}
        required
        disabled={pending}
      />
      {state.message && (
        <Callout
          tone={state.status === "success" ? "success" : "danger"}
          role={state.status === "success" ? "status" : "alert"}
          compact
        >
          {state.message}
        </Callout>
      )}
      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={pending || unchanged}>
          {pending ? "Applying plan…" : "Apply plan"}
        </Button>
      </div>
    </form>
  );
}

function OverrideForm({
  userId,
  state,
  formAction,
  pending,
}: {
  userId: string;
  state: AdminEntitlementOverrideState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const [feature, setFeature] = useState<FeatureKey>("deep_research");
  const [unlimited, setUnlimited] = useState(false);
  const boolean = isBooleanFeature(feature);

  return (
    // Same reason as the plan form: when React puts the fields back, the state that
    // mirrors them goes back with them, so what is shown is what would be sent.
    <form
      className="role-form"
      action={formAction}
      onReset={() => {
        setFeature("deep_research");
        setUnlimited(false);
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <Field
        id={`override-feature-${userId}`}
        label="Feature"
        hint={featureNote(feature)}
        note={featurePeriod(feature) === "month" ? "Monthly" : "Ceiling"}
      >
        <Select
          id={`override-feature-${userId}`}
          name="featureKey"
          value={feature}
          disabled={pending}
          onChange={(event) => setFeature(event.target.value as FeatureKey)}
          aria-describedby={`override-feature-${userId}-hint`}
        >
          {FEATURE_KEYS.map((key) => (
            <option key={key} value={key}>
              {featureLabel(key)}
            </option>
          ))}
        </Select>
      </Field>

      {boolean ? (
        <Checkbox
          id={`override-enabled-${userId}`}
          name="enabled"
          label={`Turn ${featureLabel(feature)} on for this account`}
          description="Leave unticked to record the feature as off; the plan default still applies where it is more generous."
          disabled={pending}
        />
      ) : (
        <Field
          id={`override-allowance-${userId}`}
          label="New allowance"
          hint={`Whole ${featureUnit(feature) || "units"}. An override only ever raises what the plan already grants.`}
        >
          <Input
            id={`override-allowance-${userId}`}
            name="allowance"
            inputMode="numeric"
            pattern="\d*"
            autoComplete="off"
            defaultValue=""
            disabled={pending || unlimited}
            required={!unlimited}
            aria-describedby={`override-allowance-${userId}-hint`}
          />
        </Field>
      )}
      {!boolean && (
        <Checkbox
          id={`override-unlimited-${userId}`}
          name="unlimited"
          label="Unlimited"
          description="No ceiling at all. Unlimited is not zero and cannot be undone by a smaller number — only by removing the override."
          checked={unlimited}
          disabled={pending}
          onChange={(event) => setUnlimited(event.target.checked)}
        />
      )}

      <Field
        id={`override-expiry-${userId}`}
        label="Expires after"
        hint="Every override ends. An open-ended comp is one nobody renews and nobody notices."
      >
        <Select
          id={`override-expiry-${userId}`}
          name="expiresInDays"
          defaultValue="90"
          disabled={pending}
          aria-describedby={`override-expiry-${userId}-hint`}
        >
          {OVERRIDE_EXPIRY_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id={`override-reason-${userId}`}
        label="Reason"
        hint={`${OVERRIDE_REASON_MIN}–${OVERRIDE_REASON_MAX} characters. Recorded against the grant and readable in the audit trail.`}
      >
        <Input
          id={`override-reason-${userId}`}
          name="reason"
          autoComplete="off"
          minLength={OVERRIDE_REASON_MIN}
          maxLength={OVERRIDE_REASON_MAX}
          required
          disabled={pending}
          aria-describedby={`override-reason-${userId}-hint`}
        />
      </Field>

      {state.message && (
        <Callout
          tone={state.status === "success" ? "success" : "danger"}
          role={state.status === "success" ? "status" : "alert"}
          compact
        >
          {state.message}
        </Callout>
      )}

      <div className="form-actions">
        <Button variant="primary" type="submit" name="intent" value="grant" disabled={pending}>
          {pending ? "Recording override…" : "Record override"}
        </Button>
        {/* Removing needs no reason or expiry, so it skips the constraints the grant sets. */}
        <Button
          type="submit"
          name="intent"
          value="remove"
          formNoValidate
          disabled={pending}
          variant="danger"
        >
          Remove override
        </Button>
      </div>
    </form>
  );
}

/**
 * The plan, the allowances behind it, and the two controls that change them.
 *
 * The Account API publishes an account's resolved entitlements only to that account, so
 * this card renders the plan template from the catalogue and shows an override beside
 * the default it replaces. Overrides appear once a change on this screen returns them;
 * the account's own document at /account/subscription is the authority.
 */
export function AdminUserSubscription({
  userId,
  storedTier,
  usage,
  canManage,
  isSelf,
  planAction,
  overrideAction,
  now,
}: AdminUserSubscriptionProps) {
  const [overrideState, overrideFormAction, overridePending] = useActionState(
    overrideAction ?? (async (state: AdminEntitlementOverrideState) => state),
    INITIAL_ADMIN_ENTITLEMENT_OVERRIDE_STATE,
  );
  const plan = canonicalPlan(usage?.plan ?? storedTier);
  const rows = effectiveEntitlements(plan, overrideState.overrides, now);

  return (
    <Section
      id="admin-user-subscription"
      eyebrow="Plan"
      title="Subscription"
      description="What this account is entitled to, and what it has spent in the current period."
    >
      <Card
        eyebrow="Current"
        title={`${planLabel(plan)} plan`}
        titleId="admin-user-subscription-current"
        description={planDescription(plan)}
      >
        <KeyValue columns={2}>
          <KeyValueRow label="Plan">
            <Badge>{planLabel(plan)}</Badge>
          </KeyValueRow>
          <KeyValueRow label="Stored tier" mono>
            {storedTier || "not set"}
          </KeyValueRow>
          <KeyValueRow label="Chat model">{modelLabel(chatModelForPlan(plan))}</KeyValueRow>
          {/* Deep Research runs on its own model, and on Pro it is the stronger one. Showing
              only the chat model told an operator the plan ran Haiku for everything. */}
          <KeyValueRow label="Research model">{modelLabel(researchModelForPlan(plan))}</KeyValueRow>
          <KeyValueRow label="Counters read">
            <Timestamp value={usage?.generated_at} now={now} fallback="Unavailable" />
          </KeyValueRow>
        </KeyValue>
      </Card>

      {!usage && (
        <Callout tone="attention" role="status" compact title="Usage counters are unavailable">
          The plan and its allowances are shown from the account&rsquo;s stored tier. Spend for this
          period could not be read; nothing about the account has changed.
        </Callout>
      )}

      <Callout tone="neutral" compact title="Where these numbers come from">
        Plan defaults are the published catalogue. An override appears beside the default it
        replaces once a change made here returns it; resolved allowances are published only to the
        account that holds them, which sees them on its own subscription page.
      </Callout>

      <DataTable columns={ENTITLEMENT_COLUMNS} caption="Effective entitlements" minWidth={860}>
        {rows.map((row) => {
          const limit = row.effective.kind === "limit" ? row.effective.limit : null;
          const changed = !sameValue(row.planValue, row.effective);
          return (
            <tr key={row.feature}>
              <td>
                <span className="data-table__primary">{featureLabel(row.feature)}</span>
                <span className="data-table__secondary">
                  {featureUnit(row.feature) || "on or off"}
                  {featurePeriod(row.feature) === "month" ? " · resets monthly" : ""}
                </span>
              </td>
              <td>
                <AllowanceValue value={row.planValue} />
              </td>
              <td>
                <OverrideCell feature={row.feature} override={row.override} now={now} />
              </td>
              <td>
                <AllowanceValue value={row.effective} />
                {changed && <span className="data-table__secondary">Raised by override</span>}
              </td>
              <td>
                <UsedCell feature={row.feature} usage={usage} limit={limit} now={now} />
              </td>
            </tr>
          );
        })}
      </DataTable>

      {canManage && planAction && overrideAction ? (
        <div className="card-grid card-grid--2">
          <Card
            eyebrow="Change"
            title="Plan"
            titleId="admin-user-plan-heading"
            important
            description="Moves the account between published plans. The API refuses a plan change on your own account."
          >
            <PlanForm userId={userId} currentPlan={plan} action={planAction} />
          </Card>
          <Card
            eyebrow="Change"
            title="Allowance override"
            titleId="admin-user-override-heading"
            important
            description="Raises one feature above its plan default for a fixed period, with a reason recorded against it."
          >
            <OverrideForm
              userId={userId}
              state={overrideState}
              formAction={overrideFormAction}
              pending={overridePending}
            />
          </Card>
        </div>
      ) : (
        <p className="field__hint">
          {isSelf
            ? "You can't change your own plan or allowances."
            : "Changing plans and allowances needs the Manage subscriptions permission."}
        </p>
      )}
    </Section>
  );
}
