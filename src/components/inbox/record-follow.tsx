import { followAction, remindAction } from "@/app/(portal)/inbox/actions";
import { FollowButton, RemindMe } from "@/components/inbox/follow-remind";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readSubscription } from "@/lib/api/inbox";

/**
 * Follow and Remind me for a record's head. A failed read of the follow state shows the
 * button as not following; pressing it then says what happened.
 */
export async function RecordFollow({
  token,
  subjectType,
  subjectId,
  label,
  path,
}: {
  token: string;
  subjectType: "company" | "person" | "deal" | "lead";
  subjectId: string;
  label: string;
  path: string;
}) {
  let following = false;
  try {
    following = (await readSubscription(token, subjectType, subjectId)).following;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <FollowButton
        action={followAction}
        subjectType={subjectType}
        subject={subjectId}
        following={following}
        returnPath={path}
      />
      <RemindMe
        action={remindAction}
        subjectType={subjectType}
        subjectId={subjectId}
        subjectLabel={label}
        linkPath={path}
      />
    </>
  );
}
