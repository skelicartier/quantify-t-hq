import { Properties, Property } from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readRecordReads, type RecordReads } from "@/lib/api/security";

/**
 * Who opened this record in the last 90 days, for people who may read the audit log.
 * The answer to "has anyone been looking at this firm?" — and, with the read watch, to
 * who was copying what. A failed read says so rather than showing nobody.
 */
export async function ViewedBy({
  token,
  entityType,
  record,
  now,
}: {
  token: string;
  entityType: "company" | "person" | "deal" | "lead" | "contract" | "ticket" | "meeting";
  record: string;
  now: number;
}) {
  let reads: RecordReads | null = null;
  try {
    reads = await readRecordReads(token, entityType, record);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <Properties title="Viewed by">
      {reads === null ? (
        <Property label="Readers">Could not be read just now</Property>
      ) : reads.readers.length === 0 ? (
        <Property label="Readers">Nobody in {reads.days} days</Property>
      ) : (
        reads.readers.slice(0, 8).map((reader) => (
          <Property key={reader.staff_id} label={reader.name || "A colleague"}>
            {reader.reads} {reader.reads === 1 ? "time" : "times"}
            <span className="quiet">
              {" "}
              · last <Timestamp value={reader.last_read_at} now={now} mode="relative" />
            </span>
          </Property>
        ))
      )}
    </Properties>
  );
}
