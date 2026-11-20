import { RuleLineNote, type RuleLine } from "@/components/data/duties/rule-line";
import { ControlRefNote } from "@/components/data/security/control-ref";
import type { LogLine, LogsPage } from "@/lib/data/api/logs";
import { TIME_SERVERS_LINE } from "@/lib/data/labels-devices";

/**
 * Logs and time's words beside each system (ws-notes/security/spec.md §7.5, §7.6): a short
 * retention carries the `cert-in-logs` rule line, an unknown or other clock the `cert-in-time`
 * one; logs kept outside India get both readings, each with its source, and "Confirm with your
 * lawyer", never a pass or a fail; a cloud's own time service says FAQ 42 allows it. Then the
 * block "What CERT-In asks".
 */

type Reading = LogsPage["readings"][number];

function Readings({ readings }: { readings: readonly Reading[] }) {
  return (
    <>
      {readings.map((reading) => (
        <span key={reading.label} className="hqdata-devices__reading">
          <span className="hqdata-devices__reading-label">{reading.label}.</span>{" "}
          <span>
            {reading.words}{" "}
            <span className="hqdata-control-ref">
              {reading.sources.map((source, index) => (
                <span key={source.url}>
                  {index > 0 && " · "}
                  <a
                    className="text-link"
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={source.name}
                  >
                    Source
                  </a>
                  <span className="hqdata-control-ref__url"> ({source.url})</span>
                </span>
              ))}
            </span>
          </span>
        </span>
      ))}
    </>
  );
}

export function LogLines({
  lines,
  rules,
  readings,
}: {
  lines: readonly LogLine[];
  rules: { logs: RuleLine | null; time: RuleLine | null };
  readings: readonly Reading[];
}) {
  if (lines.length === 0) return null;
  return (
    <ul className="hqdata-devices__lines hqdata-logs__lines" aria-label="What to look at">
      {lines.map((line) => (
        <li
          key={line.key}
          className={line.attention ? undefined : "hqdata-logs__said"}
          data-line={line.key}
        >
          {line.key === "place_outside" && <Readings readings={readings} />}
          <span>{line.words}</span>
          {line.key === "retention_short" && rules.logs && (
            <>
              {" "}
              <RuleLineNote line={rules.logs} />
            </>
          )}
          {(line.key === "time_unknown" || line.key === "time_other") && rules.time && (
            <>
              {" "}
              <RuleLineNote line={rules.time} />
            </>
          )}
          {line.key === "time_cloud" && (
            <>
              {" "}
              <ControlRefNote refs={["certin_q42"]} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CertInAsks({
  rules,
  readings,
}: {
  rules: { logs: RuleLine | null; time: RuleLine | null };
  readings: readonly Reading[];
}) {
  return (
    <section className="hqdata-devices__asks" data-section="logs-cert-in">
      <h2 className="hqdata-devices__heading">What CERT-In asks</h2>
      <ul>
        <li>
          {rules.logs ? (
            <>
              {rules.logs.title}: a rolling 180 days. <RuleLineNote line={rules.logs} />
            </>
          ) : (
            "The duties rule book is not loaded here, so its rule on logs is not shown."
          )}
        </li>
        <li>
          {rules.time ? (
            <>
              {rules.time.title}. <RuleLineNote line={rules.time} />
            </>
          ) : (
            "The duties rule book is not loaded here, so its rule on clocks is not shown."
          )}
        </li>
        <li>{TIME_SERVERS_LINE}</li>
      </ul>
      <p className="hqdata-devices__subheading">Where logs may be kept: the sources disagree</p>
      <div className="hqdata-logs__readings">
        <Readings readings={readings} />
      </div>
      <p>
        <ControlRefNote
          refs={["certin_iv", "certin_i", "certin_q35", "certin_q42", "a8_15", "a8_17"]}
        />
      </p>
    </section>
  );
}
