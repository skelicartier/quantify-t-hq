import { decideSignalAction } from "@/app/(portal)/leads/actions";
import { SignalList } from "@/components/crm/signal-list";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readSignals, type SignalList as SignalListPage } from "@/lib/api/signals";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Signs of interest" };
export const dynamic = "force-dynamic";

const BASE = "/leads/signals";
const STATES = [
  { key: "open", label: "Open" },
  { key: "acted", label: "Acted on" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
] as const;

type SignalsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function href(state: string, kind: string): string {
  const params = new URLSearchParams();
  if (state && state !== "open") params.set("state", state);
  if (kind) params.set("kind", kind);
  const text = params.toString();
  return text ? `${BASE}?${text}` : BASE;
}

/**
 * First-party signs that a firm being worked is paying attention — a product account
 * made, a click through from our mail, a colleague writing in, product use — each with
 * what it rests on, closed by acting on it or dismissing it.
 */
export default async function SignalsPage({ searchParams }: SignalsPageProps) {
  const context = await requireStaff(BASE);
  const now = requestNow();
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.state) ?? "open";
  const state = STATES.some((item) => item.key === asked) ? asked : "open";
  const kind = firstSearchValue(parameters.kind) ?? "";
  let page: SignalListPage | null = null;
  try {
    page = await readSignals(context.token, { state, kind });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Signs of interest"
        description="Read from what HQ and the product already hold: someone at a firm being worked made a product account, clicked through from our mail, wrote in while a colleague was being written to, or signed in to the product. Each is kept once; the record's owner hears of it."
      />
      <div className="page-content">
        {page === null ? (
          <Callout tone="danger" role="alert">
            The signs could not be read just now. This is a read failure, not a quiet week.
          </Callout>
        ) : (
          <>
            <div className="list-bar">
              <SegmentedLinks
                label="Which"
                items={STATES.map((item) => ({
                  href: href(item.key, kind),
                  label:
                    item.key === "open" && page.counts.open
                      ? `Open ${page.counts.open}`
                      : item.label,
                  current: state === item.key,
                }))}
              />
              <SegmentedLinks
                label="Kind"
                items={[
                  { href: href(state, ""), label: "Every kind", current: !kind },
                  ...page.kinds.map((item) => ({
                    href: href(state, item.kind),
                    label: item.label,
                    current: kind === item.kind,
                  })),
                ]}
              />
            </div>
            <Card>
              {page.signals.length === 0 ? (
                <EmptyState
                  compact
                  title={state === "open" ? "No open signs" : "None here"}
                  description={
                    state === "open"
                      ? `Nothing in the last ${page.lookback_days} days that has not been acted on or dismissed.`
                      : undefined
                  }
                />
              ) : (
                <SignalList
                  signals={page.signals}
                  now={now}
                  action={decideSignalAction}
                  canWrite={canWrite}
                  returnPath={BASE}
                  showSubject
                />
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
