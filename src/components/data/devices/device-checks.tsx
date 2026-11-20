import Link from "next/link";

import type { SelfCheck } from "@/lib/data/api/devices";
import { dayWords } from "@/lib/data/labels-company";
import { countWords } from "@/lib/data/labels-controls";
import { CHECK_FLAGS, CHECK_QUESTIONS } from "@/lib/data/labels-devices";

/**
 * What a device's latest self-check found (ws-notes/security/spec.md §7.5, §7.6): each answer
 * as a property, the check lines the service wrote, and the screenshots as links into Files.
 * Words only: never a score, a bar or a per cent sign.
 */

export function CheckLines({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="hqdata-devices__lines" aria-label="What to look at">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

const lockWords = (minutes: number | null): string =>
  minutes === null ? CHECK_FLAGS[""] : `After ${countWords(minutes, "minute")}`;

export function LatestCheck({
  check,
  lines,
  files,
}: {
  check: SelfCheck | null;
  lines: readonly string[];
  files: readonly { file_id: string; title: string }[];
}) {
  if (!check) return <p className="page-note">Not checked yet.</p>;
  const q = CHECK_QUESTIONS;
  const rows: [string, string][] = [
    ["Checked", `${dayWords(check.on)}, by ${check.by_name}`],
    [q.encryption.label, CHECK_FLAGS[check.encryption]],
    ["Screen lock", lockWords(check.screen_lock_minutes)],
    [q.os_version.label, check.os_version || CHECK_FLAGS[""]],
    [q.updates_automatic.label, CHECK_FLAGS[check.updates_automatic]],
    [q.password_manager.label, CHECK_FLAGS[check.password_manager]],
    [q.malware_protection.label, CHECK_FLAGS[check.malware_protection]],
    [q.firewall.label, CHECK_FLAGS[check.firewall]],
    [q.work_data_local.label, CHECK_FLAGS[check.work_data_local]],
  ];
  return (
    <div className="hqdata-devices__latest" data-part="latest-check">
      <dl className="hqdata-devices__answers">
        {rows.map(([label, value]) => (
          <div key={label} className="hqdata-devices__answer">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <CheckLines lines={lines} />
      {check.note && <p className="hqdata-devices__prose">{check.note}</p>}
      {files.length > 0 && (
        <p className="hqdata-devices__files">
          Screenshots:{" "}
          {files.map((file, index) => (
            <span key={file.file_id}>
              {index > 0 && " · "}
              <Link className="text-link" href={`/data/files/${file.file_id}`}>
                {file.title}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
