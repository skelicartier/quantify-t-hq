import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { DomainRow, HostRow, SecurityTxtRow, SigningRow } from "@/lib/data/api/domains";
import { FLAGS } from "@/lib/data/labels-company";
import { DMARC_STAGES, DOMAIN_PURPOSES, PLATFORMS } from "@/lib/data/labels-security";

/**
 * The forms of Domains and certificates (ws-notes/duties/spec.md §6.5): a domain, a public
 * hostname, a signing certificate and a security.txt record. Adding and editing share the
 * fields; a field that might attract a password says where it is kept, never the password.
 */

function FlagSelect({
  id,
  name,
  label,
  value,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
}) {
  return (
    <Field id={id} label={label}>
      <Select id={id} name={name} defaultValue={value}>
        {(["", "yes", "no"] as const).map((key) => (
          <option key={key || "unknown"} value={key}>
            {FLAGS[key]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function DomainFields({ prefix, values }: { prefix: string; values: DomainRow | null }) {
  return (
    <>
      <Field id={`${prefix}-name`} label="Domain" hint="Such as walk.example: no https, no path.">
        <Input
          id={`${prefix}-name`}
          name="name"
          required
          maxLength={253}
          spellCheck={false}
          autoCapitalize="none"
          defaultValue={values?.name ?? ""}
        />
      </Field>
      <Field id={`${prefix}-purpose`} label="For">
        <Select id={`${prefix}-purpose`} name="purpose" defaultValue={values?.purpose ?? "main"}>
          {Object.entries(DOMAIN_PURPOSES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-registrar`} label="Registrar">
        <Input
          id={`${prefix}-registrar`}
          name="registrar"
          maxLength={120}
          defaultValue={values?.registrar ?? ""}
        />
      </Field>
      <Field
        id={`${prefix}-holder`}
        label="Login held by"
        hint="A name. Never the password: that stays in the password manager."
      >
        <Input
          id={`${prefix}-holder`}
          name="account_holder"
          maxLength={120}
          defaultValue={values?.account_holder ?? ""}
        />
      </Field>
      <Field id={`${prefix}-expires`} label="Expires on">
        <Input
          id={`${prefix}-expires`}
          name="expires_on"
          type="date"
          defaultValue={values?.expires_on ?? ""}
        />
      </Field>
      <div className="hqdata-registers__pair">
        <FlagSelect
          id={`${prefix}-renew`}
          name="auto_renew"
          label="Auto-renew"
          value={values?.auto_renew ?? ""}
        />
        <FlagSelect
          id={`${prefix}-lock`}
          name="locked"
          label="Registrar lock"
          value={values?.locked ?? ""}
        />
      </div>
      <Field id={`${prefix}-dns`} label="DNS">
        <Input
          id={`${prefix}-dns`}
          name="dns_host"
          maxLength={120}
          defaultValue={values?.dns_host ?? ""}
        />
      </Field>
      <Field id={`${prefix}-mx`} label="Mail" hint="Who handles its mail. Leave it empty for none.">
        <Input id={`${prefix}-mx`} name="mx" maxLength={120} defaultValue={values?.mx ?? ""} />
      </Field>
      <Field
        id={`${prefix}-sends`}
        label="Sends mail as it"
        hint="The services that send as this domain, separated by commas: 12 at most."
      >
        <Input
          id={`${prefix}-sends`}
          name="sends_as"
          maxLength={1000}
          defaultValue={values?.sends_as.join(", ") ?? ""}
        />
      </Field>
      <Field id={`${prefix}-dmarc`} label="DMARC">
        <Select id={`${prefix}-dmarc`} name="dmarc" defaultValue={values?.dmarc ?? ""}>
          {(["", "none", "quarantine", "reject"] as const).map((key) => (
            <option key={key || "unknown"} value={key}>
              {DMARC_STAGES[key]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-notes`} label="Notes">
        <Textarea
          id={`${prefix}-notes`}
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={values?.notes ?? ""}
        />
      </Field>
    </>
  );
}

export function HostFields({ prefix, values }: { prefix: string; values: HostRow | null }) {
  return (
    <>
      <Field
        id={`${prefix}-hostname`}
        label="Hostname"
        hint="A public name, such as www.example.com. Its certificate is read on port 443."
      >
        <Input
          id={`${prefix}-hostname`}
          name="hostname"
          required
          maxLength={253}
          spellCheck={false}
          autoCapitalize="none"
          defaultValue={values?.hostname ?? ""}
        />
      </Field>
      <Field id={`${prefix}-what`} label="What it is">
        <Input
          id={`${prefix}-what`}
          name="what"
          maxLength={120}
          defaultValue={values?.what ?? ""}
        />
      </Field>
      <FlagSelect
        id={`${prefix}-renew`}
        name="auto_renew"
        label="Auto-renew"
        value={values?.auto_renew ?? ""}
      />
      <Field
        id={`${prefix}-typed`}
        label="Expires on, typed"
        hint="Only when the name cannot be reached from this computer."
      >
        <Input
          id={`${prefix}-typed`}
          name="typed_not_after"
          type="date"
          defaultValue={values?.typed_not_after ?? ""}
        />
      </Field>
    </>
  );
}

export function SigningFields({
  prefix,
  values,
  today,
}: {
  prefix: string;
  values: SigningRow | null;
  today: string;
}) {
  return (
    <>
      <Field id={`${prefix}-name`} label="Name" hint="Such as “Mac developer ID”.">
        <Input
          id={`${prefix}-name`}
          name="name"
          required
          maxLength={120}
          defaultValue={values?.name ?? ""}
        />
      </Field>
      <Field id={`${prefix}-platform`} label="Platform">
        <Select id={`${prefix}-platform`} name="platform" defaultValue={values?.platform ?? "mac"}>
          {Object.entries(PLATFORMS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`${prefix}-issuer`} label="Issuer">
        <Input
          id={`${prefix}-issuer`}
          name="issuer"
          maxLength={120}
          defaultValue={values?.issuer ?? ""}
        />
      </Field>
      <div className="hqdata-registers__pair">
        <Field id={`${prefix}-issued`} label="Issued on">
          <Input
            id={`${prefix}-issued`}
            name="issued_on"
            type="date"
            max={today}
            defaultValue={values?.issued_on ?? ""}
          />
        </Field>
        <Field id={`${prefix}-expires`} label="Expires on">
          <Input
            id={`${prefix}-expires`}
            name="expires_on"
            type="date"
            required
            defaultValue={values?.expires_on ?? ""}
          />
        </Field>
      </div>
      <Field
        id={`${prefix}-kept`}
        label="Where it is kept"
        hint="Such as “a token in the office safe”. Never its PIN or password."
      >
        <Input
          id={`${prefix}-kept`}
          name="kept"
          maxLength={120}
          defaultValue={values?.kept ?? ""}
        />
      </Field>
      <Field
        id={`${prefix}-lead`}
        label="Days before expiry it enters Due"
        hint="7 to 180. A new certificate can take weeks to arrive."
      >
        <Input
          id={`${prefix}-lead`}
          name="lead_days"
          inputMode="numeric"
          maxLength={3}
          defaultValue={String(values?.lead_days ?? 45)}
        />
      </Field>
      <Field id={`${prefix}-notes`} label="Notes">
        <Textarea
          id={`${prefix}-notes`}
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={values?.notes ?? ""}
        />
      </Field>
    </>
  );
}

export function SecurityTxtFields({
  prefix,
  values,
  today,
}: {
  prefix: string;
  values: SecurityTxtRow | null;
  today: string;
}) {
  return (
    <>
      <Field id={`${prefix}-hostname`} label="Hostname">
        <Input
          id={`${prefix}-hostname`}
          name="hostname"
          required
          maxLength={253}
          spellCheck={false}
          autoCapitalize="none"
          defaultValue={values?.hostname ?? ""}
        />
      </Field>
      <div className="hqdata-registers__pair">
        <Field id={`${prefix}-published`} label="Published on">
          <Input
            id={`${prefix}-published`}
            name="published_on"
            type="date"
            max={today}
            defaultValue={values?.published_on ?? ""}
          />
        </Field>
        <Field id={`${prefix}-expires`} label="Expires">
          <Input
            id={`${prefix}-expires`}
            name="expires_on"
            type="date"
            required
            defaultValue={values?.expires_on ?? ""}
          />
        </Field>
      </div>
      <Field id={`${prefix}-contact`} label="Contact" hint="The Contact line, as published.">
        <Input
          id={`${prefix}-contact`}
          name="contact"
          maxLength={254}
          defaultValue={values?.contact ?? ""}
        />
      </Field>
      <Field id={`${prefix}-policy`} label="Policy" hint="The policy's https link, if any.">
        <Input
          id={`${prefix}-policy`}
          name="policy_url"
          type="url"
          maxLength={500}
          defaultValue={values?.policy_url ?? ""}
        />
      </Field>
    </>
  );
}
