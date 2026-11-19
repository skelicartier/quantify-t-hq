import type { ReactNode } from "react";

import { DataUnavailable } from "@/components/data/data-down";
import {
  DomainFields,
  HostFields,
  SecurityTxtFields,
  SigningFields,
} from "@/components/data/domains/domain-fields";
import { RuleLineNote, type RuleLine } from "@/components/data/duties/rule-line";
import { RegistersTabs } from "@/components/data/registers/registers-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readDomains, type DomainsPage, type Expiry } from "@/lib/data/api/domains";
import { FLAGS, dayWords } from "@/lib/data/labels-company";
import {
  DMARC_STAGES,
  DOMAINS_ABOUT,
  DOMAINS_EMPTY,
  DOMAIN_PURPOSES,
  EXPIRY_STATES,
  HOSTS_EMPTY,
  NO_RULE_BOOK,
  PLATFORMS,
  REGISTER_ABOUT,
  SECURITY_TXT_EMPTY,
  SIGNING_EMPTY,
} from "@/lib/data/labels-security";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

import {
  addDomainAction,
  addHostAction,
  addSigningAction,
  addTxtAction,
  checkAllAction,
  checkHostAction,
  releaseDomainAction,
  retireHostAction,
  retireTxtAction,
  signingReplacedAction,
  updateDomainAction,
  updateHostAction,
  updateSigningAction,
  updateTxtAction,
} from "./actions";
import "../registers.css";

export const metadata = { title: "Domains and certificates" };
export const dynamic = "force-dynamic";

const BASE = "/data/registers/domains";
const ABOUT = `The company's domains, the certificates of its public names and of the app, and each security.txt, with the day each must be renewed. ${DOMAINS_ABOUT} ${REGISTER_ABOUT}`;

export default async function DomainsRegisterPage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(readDomains) : null;
  const data = read?.ok ? read.data : null;
  const live = data
    ? data.domains.filter((item) => !item.released).length +
      data.hosts.filter((item) => !item.retired).length +
      data.signing.filter((item) => !item.replaced).length +
      data.security_txt.filter((item) => !item.retired).length
    : 0;
  return (
    <>
      <PageHeader
        title="Domains and certificates"
        description={ABOUT}
        meta={data ? <span className="quiet">{formatNumber(live)} recorded</span> : undefined}
      />
      <div className="page-content">
        <RegistersTabs current="domains" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-domains">
            <p className="page-note">
              {DOMAINS_ABOUT} {REGISTER_ABOUT}
            </p>
            {!read.data.rules.signing && (
              <p className="hqdata-rule-line">
                {NO_RULE_BOOK} The certificate checks are not worked out.
              </p>
            )}
            <Domains page={read.data} />
            <Hosts page={read.data} />
            <Signing page={read.data} />
            <SecurityTxt page={read.data} />
            {read.data.domains.length + read.data.hosts.length > 0 && (
              <p className="page-note hqdata-registers__links">
                <a className="text-link" href={`${BASE}/export`}>
                  Download as CSV
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Expires({ expiry, extra }: { expiry: Expiry; extra?: ReactNode }) {
  if (!expiry.on) return <span className="quiet">Not known</span>;
  const state = EXPIRY_STATES[expiry.state];
  return (
    <>
      <span className="nowrap">{dayWords(expiry.on)}</span>
      {expiry.state !== "ok" && (
        <span className="table-sub">
          <StatusPill value={expiry.state} label={state.label} tone={state.tone} />
        </span>
      )}
      {extra}
    </>
  );
}

function Checks({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map((line) => (
        <span key={line} className="hqdata-registers__check">
          {line}
        </span>
      ))}
    </>
  );
}

function Section({
  id,
  title,
  add,
  rule,
  children,
}: {
  id: string;
  title: string;
  add: ReactNode;
  rule?: RuleLine | null;
  children: ReactNode;
}) {
  return (
    <section data-section={id}>
      <div className="hqdata-registers__tools">
        <h2 className="hqdata-registers__heading">{title}</h2>
        <div className="hqdata-registers__acts">{add}</div>
      </div>
      {rule && (
        <p>
          <RuleLineNote line={rule} />
        </p>
      )}
      {children}
    </section>
  );
}

function Domains({ page }: { page: DomainsPage }) {
  return (
    <Section
      id="domains-domains"
      title="Domains"
      add={
        <Popover label="Add a domain" variant="primary" align="end" width="wide">
          <MailForm
            action={addDomainAction}
            submitLabel="Add the domain"
            pendingLabel="Adding…"
            className="stack-form stack-form--tight"
          >
            <DomainFields prefix="domain-new" values={null} />
          </MailForm>
        </Popover>
      }
    >
      <DataTable
        caption="Domains"
        columns={[
          { key: "domain", label: "Domain", width: "18%" },
          { key: "for", label: "For" },
          { key: "registrar", label: "Registrar" },
          { key: "holder", label: "Login held by" },
          { key: "expires", label: "Expires" },
          { key: "renew", label: "Auto-renew" },
          { key: "lock", label: "Lock" },
          { key: "dns", label: "DNS" },
          { key: "mail", label: "Mail" },
          { key: "dmarc", label: "DMARC" },
        ]}
        columnMenu={false}
        isEmpty={page.domains.length === 0}
        empty={<EmptyState compact title="No domains" description={DOMAINS_EMPTY} />}
      >
        {page.domains.map((domain) => (
          <tr
            key={domain.domain_id}
            id={`domain-${domain.domain_id}`}
            className={domain.released ? "hqdata-registers__gone" : undefined}
          >
            <td>
              <span className="table-title mono">{domain.name}</span>
              {domain.released && (
                <span className="table-sub">
                  Released {dayWords(domain.released.on)}: {domain.released.why}
                </span>
              )}
              <Checks lines={domain.checks} />
              {!domain.released && (
                <div className="hqdata-registers__acts">
                  <Popover label="Edit" align="start" width="wide">
                    <MailForm
                      action={updateDomainAction}
                      fields={{ domain_id: domain.domain_id }}
                      submitLabel="Save"
                      pendingLabel="Saving…"
                      className="stack-form stack-form--tight"
                    >
                      <DomainFields prefix={`domain-${domain.domain_id}`} values={domain} />
                    </MailForm>
                  </Popover>
                  <Popover label="Release" align="start">
                    <MailForm
                      action={releaseDomainAction}
                      fields={{ domain_id: domain.domain_id }}
                      submitLabel="Release it"
                      pendingLabel="Saving…"
                    >
                      <Field id={`release-${domain.domain_id}-on`} label="On">
                        <Input
                          id={`release-${domain.domain_id}-on`}
                          name="on"
                          type="date"
                          max={page.today}
                          defaultValue={page.today}
                        />
                      </Field>
                      <Field id={`release-${domain.domain_id}-why`} label="Why">
                        <Input
                          id={`release-${domain.domain_id}-why`}
                          name="why"
                          required
                          maxLength={300}
                        />
                      </Field>
                    </MailForm>
                  </Popover>
                </div>
              )}
            </td>
            <td>{DOMAIN_PURPOSES[domain.purpose]}</td>
            <td>{domain.registrar || <span className="quiet">Not recorded</span>}</td>
            <td>{domain.account_holder || <span className="quiet">Not recorded</span>}</td>
            <td>
              <Expires expiry={domain.expiry} />
            </td>
            <td>{FLAGS[domain.auto_renew]}</td>
            <td>{FLAGS[domain.locked]}</td>
            <td>{domain.dns_host || <span className="quiet">Not recorded</span>}</td>
            <td>
              {domain.mx || <span className="quiet">None</span>}
              {domain.sends_as.length > 0 && (
                <span className="table-sub">Sends as: {domain.sends_as.join(", ")}</span>
              )}
            </td>
            <td>{DMARC_STAGES[domain.dmarc]}</td>
          </tr>
        ))}
      </DataTable>
    </Section>
  );
}

function Hosts({ page }: { page: DomainsPage }) {
  const live = page.hosts.filter((host) => !host.retired).length;
  return (
    <Section
      id="domains-hosts"
      title="Website certificates"
      rule={page.rules.tls}
      add={
        <>
          {page.prober && live > 0 && (
            <RowAction
              action={checkAllAction}
              fields={{}}
              buttons={[
                { label: "Check all", className: "btn btn--small", pendingLabel: "Checking…" },
              ]}
            />
          )}
          <Popover label="Add a hostname" variant="primary" align="end" width="wide">
            <MailForm
              action={addHostAction}
              submitLabel="Add the hostname"
              pendingLabel="Adding…"
              className="stack-form stack-form--tight"
            >
              <HostFields prefix="host-new" values={null} />
            </MailForm>
          </Popover>
        </>
      }
    >
      {page.checking && (
        <p className="page-note">
          Checking each hostname: {formatNumber(page.checking.done)} of{" "}
          {formatNumber(page.checking.total)} read.
        </p>
      )}
      {!page.prober && <p className="page-note">Checking is off in this copy.</p>}
      <DataTable
        caption="Website certificates"
        columns={[
          { key: "hostname", label: "Hostname", width: "24%" },
          { key: "what", label: "What it is" },
          { key: "expires", label: "Expires" },
          { key: "issuer", label: "Issuer" },
          { key: "read", label: "Read" },
          { key: "renew", label: "Auto-renew" },
        ]}
        columnMenu={false}
        isEmpty={page.hosts.length === 0}
        empty={<EmptyState compact title="No hostnames" description={HOSTS_EMPTY} />}
      >
        {page.hosts.map((host) => (
          <tr
            key={host.host_id}
            id={`host-${host.host_id}`}
            className={host.retired ? "hqdata-registers__gone" : undefined}
          >
            <td>
              <span className="table-title mono">{host.hostname}</span>
              {host.retired && <span className="table-sub">Retired</span>}
              <Checks lines={host.checks} />
              {!host.retired && (
                <div className="hqdata-registers__acts">
                  {page.prober && (
                    <RowAction
                      action={checkHostAction}
                      fields={{ host_id: host.host_id }}
                      buttons={[
                        {
                          label: "Check now",
                          className: "btn btn--small",
                          pendingLabel: "Checking…",
                        },
                      ]}
                    />
                  )}
                  <Popover label="Edit" align="start" width="wide">
                    <MailForm
                      action={updateHostAction}
                      fields={{ host_id: host.host_id }}
                      submitLabel="Save"
                      pendingLabel="Saving…"
                      className="stack-form stack-form--tight"
                    >
                      <HostFields prefix={`host-${host.host_id}`} values={host} />
                    </MailForm>
                  </Popover>
                  <RowAction
                    action={retireHostAction}
                    fields={{ host_id: host.host_id }}
                    buttons={[{ label: "Retire", className: "btn btn--small btn--ghost" }]}
                  />
                </div>
              )}
            </td>
            <td>{host.what || <span className="quiet">Not recorded</span>}</td>
            <td>
              <Expires
                expiry={host.expiry}
                extra={
                  host.expiry.on && (
                    <span className="table-sub">
                      {host.expiry.source === "handshake" ? "Read by the handshake" : "Typed"}
                    </span>
                  )
                }
              />
            </td>
            <td>{host.probe?.issuer || <span className="quiet">Not read</span>}</td>
            <td className="nowrap">
              {host.read_on ? dayWords(host.read_on) : <span className="quiet">Never</span>}
            </td>
            <td>{FLAGS[host.auto_renew]}</td>
          </tr>
        ))}
      </DataTable>
    </Section>
  );
}

function Signing({ page }: { page: DomainsPage }) {
  return (
    <Section
      id="domains-signing"
      title="Signing certificates"
      rule={page.rules.signing}
      add={
        <Popover label="Add a signing certificate" variant="primary" align="end" width="wide">
          <MailForm
            action={addSigningAction}
            submitLabel="Add the certificate"
            pendingLabel="Adding…"
            className="stack-form stack-form--tight"
          >
            <SigningFields prefix="signing-new" values={null} today={page.today} />
          </MailForm>
        </Popover>
      }
    >
      <DataTable
        caption="Signing certificates"
        columns={[
          { key: "name", label: "Name", width: "24%" },
          { key: "platform", label: "Platform" },
          { key: "issued", label: "Issued" },
          { key: "expires", label: "Expires" },
          { key: "kept", label: "Kept" },
          { key: "due", label: "In Due from" },
        ]}
        columnMenu={false}
        isEmpty={page.signing.length === 0}
        empty={<EmptyState compact title="No signing certificates" description={SIGNING_EMPTY} />}
      >
        {page.signing.map((cert) => (
          <tr
            key={cert.cert_id}
            id={`signing-${cert.cert_id}`}
            className={cert.replaced ? "hqdata-registers__gone" : undefined}
          >
            <td>
              <span className="table-title">{cert.name}</span>
              {cert.issuer && <span className="table-sub">{cert.issuer}</span>}
              {cert.replaced && <span className="table-sub">Replaced</span>}
              <Checks lines={cert.checks} />
              {!cert.replaced && (
                <div className="hqdata-registers__acts">
                  <Popover label="Edit" align="start" width="wide">
                    <MailForm
                      action={updateSigningAction}
                      fields={{ cert_id: cert.cert_id }}
                      submitLabel="Save"
                      pendingLabel="Saving…"
                      className="stack-form stack-form--tight"
                    >
                      <SigningFields
                        prefix={`signing-${cert.cert_id}`}
                        values={cert}
                        today={page.today}
                      />
                    </MailForm>
                  </Popover>
                  <RowAction
                    action={signingReplacedAction}
                    fields={{ cert_id: cert.cert_id }}
                    buttons={[{ label: "Replaced", className: "btn btn--small btn--ghost" }]}
                  />
                </div>
              )}
            </td>
            <td>{PLATFORMS[cert.platform]}</td>
            <td className="nowrap">
              {cert.issued_on ? dayWords(cert.issued_on) : <span className="quiet">Not known</span>}
            </td>
            <td>
              <Expires expiry={cert.expiry} />
            </td>
            <td>{cert.kept || <span className="quiet">Not recorded</span>}</td>
            <td className="nowrap">
              {dayWords(cert.due_from)}
              <span className="table-sub">
                {formatNumber(cert.lead_days)} days before it expires
              </span>
            </td>
          </tr>
        ))}
      </DataTable>
    </Section>
  );
}

function SecurityTxt({ page }: { page: DomainsPage }) {
  return (
    <Section
      id="domains-security-txt"
      title="security.txt"
      rule={page.rules.security_txt}
      add={
        <Popover label="Add a security.txt" variant="primary" align="end" width="wide">
          <MailForm
            action={addTxtAction}
            submitLabel="Add it"
            pendingLabel="Adding…"
            className="stack-form stack-form--tight"
          >
            <SecurityTxtFields prefix="txt-new" values={null} today={page.today} />
          </MailForm>
        </Popover>
      }
    >
      <DataTable
        caption="security.txt"
        columns={[
          { key: "hostname", label: "Hostname", width: "24%" },
          { key: "published", label: "Published" },
          { key: "expires", label: "Expires" },
          { key: "contact", label: "Contact" },
          { key: "policy", label: "Policy" },
        ]}
        columnMenu={false}
        isEmpty={page.security_txt.length === 0}
        empty={<EmptyState compact title="No security.txt" description={SECURITY_TXT_EMPTY} />}
      >
        {page.security_txt.map((txt) => (
          <tr
            key={txt.txt_id}
            id={`txt-${txt.txt_id}`}
            className={txt.retired ? "hqdata-registers__gone" : undefined}
          >
            <td>
              <span className="table-title mono">{txt.hostname}</span>
              {txt.retired && <span className="table-sub">Retired</span>}
              <Checks lines={txt.checks} />
              {!txt.retired && (
                <div className="hqdata-registers__acts">
                  <Popover label="Edit" align="start" width="wide">
                    <MailForm
                      action={updateTxtAction}
                      fields={{ txt_id: txt.txt_id }}
                      submitLabel="Save"
                      pendingLabel="Saving…"
                      className="stack-form stack-form--tight"
                    >
                      <SecurityTxtFields
                        prefix={`txt-${txt.txt_id}`}
                        values={txt}
                        today={page.today}
                      />
                    </MailForm>
                  </Popover>
                  <RowAction
                    action={retireTxtAction}
                    fields={{ txt_id: txt.txt_id }}
                    buttons={[{ label: "Retire", className: "btn btn--small btn--ghost" }]}
                  />
                </div>
              )}
            </td>
            <td className="nowrap">
              {txt.published_on ? (
                dayWords(txt.published_on)
              ) : (
                <span className="quiet">Not known</span>
              )}
            </td>
            <td>
              <Expires expiry={txt.expiry} />
            </td>
            <td>{txt.contact || <span className="quiet">Not recorded</span>}</td>
            <td>
              {txt.policy_url ? (
                <>
                  <a className="text-link" href={txt.policy_url} rel="noreferrer" target="_blank">
                    Policy
                  </a>
                  <span className="hqdata-print-only"> ({txt.policy_url})</span>
                </>
              ) : (
                <span className="quiet">None</span>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </Section>
  );
}
