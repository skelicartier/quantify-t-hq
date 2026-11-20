import { DataUnavailable } from "@/components/data/data-down";
import { DeviceFields } from "@/components/data/devices/device-fields";
import { DevicesTable } from "@/components/data/devices/devices-table";
import { ControlRefNote, PracticeNote } from "@/components/data/security/control-ref";
import { SystemsTabs } from "@/components/data/systems/systems-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readDevices, type DevicesPage } from "@/lib/data/api/devices";
import { NOT_ADVICE, countWords } from "@/lib/data/labels-controls";
import { DEVICES_ABOUT, DEVICE_VIEWS, type DeviceView } from "@/lib/data/labels-devices";
import { isDataOwner } from "@/lib/data/owner";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import { addDeviceAction, saveSetupAction } from "./actions";
import "@/components/data/devices/devices.css";

export const metadata = { title: "Devices" };
export const dynamic = "force-dynamic";

const BASE = "/data/systems/devices";

type Params = Record<string, string | string[] | undefined>;

export default async function DevicesRegisterPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const { context, allowed } = await requireData(BASE);
  const owner = allowed && isDataOwner(context);
  const asked = firstSearchValue((await searchParams).view) ?? "";
  const view: DeviceView = asked in DEVICE_VIEWS ? (asked as DeviceView) : "active";
  const read = allowed ? await dataRead(() => readDevices(view, owner)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Devices"
        description={`${DEVICES_ABOUT} ${NOT_ADVICE}`}
        meta={
          data ? (
            <span className="quiet">
              {countWords(data.counts.active, "device")} in use ·{" "}
              {formatNumber(data.counts.checked)} checked in time
            </span>
          ) : undefined
        }
        actions={data ? <HeaderActions page={data} /> : undefined}
      />
      <div className="page-content">
        <SystemsTabs current="devices" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Register page={read.data} owner={owner} />
        )}
      </div>
    </>
  );
}

function HeaderActions({ page }: { page: DevicesPage }) {
  return (
    <>
      <Popover label="Settings" align="end" width="wide">
        <MailForm
          action={saveSetupAction}
          submitLabel="Save"
          pendingLabel="Saving…"
          className="stack-form stack-form--tight"
        >
          <Field
            id="devices-setup-lock"
            label="Your personal devices policy's screen-lock limit, in minutes"
            hint="Leave it empty to compare nothing: each check then says its own minutes."
          >
            <Input
              id="devices-setup-lock"
              name="screen_lock_max"
              type="number"
              min={1}
              max={1440}
              step={1}
              inputMode="numeric"
              defaultValue={page.setup.screen_lock_max ?? ""}
            />
          </Field>
          <Field id="devices-setup-months" label="Self-check every … months">
            <Input
              id="devices-setup-months"
              name="check_months"
              type="number"
              min={1}
              max={12}
              step={1}
              inputMode="numeric"
              defaultValue={page.setup.check_months ?? ""}
            />
          </Field>
          <p className="field__hint">
            <PracticeNote
              practice="device_check"
              {...(page.setup.check_months !== null ? { amount: page.setup.check_months } : {})}
            />
          </p>
        </MailForm>
      </Popover>
      {page.counts.active + page.devices.length > 0 && (
        <a className="btn btn--small" href={`${BASE}/export`}>
          Download
        </a>
      )}
      <Popover label="Add a device" variant="primary" align="end" width="wide">
        <MailForm
          action={addDeviceAction}
          submitLabel="Add the device"
          pendingLabel="Adding…"
          className="stack-form stack-form--tight"
        >
          <DeviceFields prefix="device-new" values={null} />
        </MailForm>
      </Popover>
    </>
  );
}

function Register({ page, owner }: { page: DevicesPage; owner: boolean }) {
  const counts = page.counts;
  return (
    <div className="hqdata-devices">
      <p className="page-note">{NOT_ADVICE}</p>
      <section data-section="devices-register">
        <p>
          <ControlRefNote refs={["a8_1", "a6_7"]} />
        </p>
        <p>
          <PracticeNote
            practice="device_check"
            {...(page.setup.check_months !== null ? { amount: page.setup.check_months } : {})}
          />
        </p>
        {page.policy_line && <p className="hqdata-devices__attention">{page.policy_line}</p>}
        {page.policy && (
          <p className="page-note">
            The personal devices policy is {page.policy.title}, version {page.policy.version}.
          </p>
        )}
        <div className="hqdata-devices__tools">
          <SegmentedLinks
            label="Devices"
            items={(Object.keys(DEVICE_VIEWS) as DeviceView[]).map((key) => ({
              href: key === "active" ? BASE : `${BASE}?view=${key}`,
              label:
                key === "active"
                  ? `${DEVICE_VIEWS.active} ${formatNumber(counts.active)}`
                  : DEVICE_VIEWS[key],
              current: page.view === key,
            }))}
          />
        </div>
        <p className="hqdata-print-only">{DEVICE_VIEWS[page.view]}</p>
        <DevicesTable page={page} owner={owner} />
      </section>
    </div>
  );
}
