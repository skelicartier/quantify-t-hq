import Link from "next/link";

import { RecordSection } from "@/components/ui/record-shell";
import { readEntryProfile } from "@/lib/data/api/profiles";
import { countWords, ofWords } from "@/lib/data/labels-controls";
import { PROFILE_SECTION_NOTE } from "@/lib/data/labels-questionnaires";
import { dataRead } from "@/lib/data/read";

/**
 * A waitlist firm's regulatory profile, on the firm's page and on a pilot's page
 * (ws-notes/security/spec.md §4.2, §9.7): "SEBI CSCRF (mid-size) · 4 of 6 duties in the
 * contract · 2 not checked. Open the profile." once there is one; Step 0's sentence and link
 * before, or when the profile cannot be read.
 */
export async function EntryProfileSection({ entryId }: { entryId: string }) {
  const read = await dataRead(() => readEntryProfile(entryId));
  const profile = read.ok ? read.data.profile : null;
  const href = `/data/waitlist/${entryId}/profile`;
  if (!profile)
    return (
      <RecordSection id="entry-profile" title="Regulatory profile">
        <p className="page-note">
          {PROFILE_SECTION_NOTE}{" "}
          <Link className="text-link" href={href}>
            Open the profile
          </Link>
        </p>
      </RecordSection>
    );
  const live = profile.duties.filter((duty) => !duty.withdrawn);
  const inContract = live.filter((duty) => duty.state === "in_contract").length;
  const unchecked = live.filter((duty) => duty.state === "").length;
  return (
    <RecordSection id="entry-profile" title="Regulatory profile">
      <p className="page-note">
        {profile.rules} · {ofWords(inContract, live.length, "duties in the contract")} ·{" "}
        {countWords(unchecked, "not checked", "not checked")}.{" "}
        <Link className="text-link" href={href}>
          Open the profile
        </Link>
      </p>
    </RecordSection>
  );
}
