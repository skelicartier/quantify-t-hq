import {
  addCommentAction,
  deleteCommentAction,
  resolveCommentAction,
} from "@/app/(portal)/_actions/platform";
import { CommentForm } from "@/components/platform/platform-forms";
import { Callout } from "@/components/ui/callout";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import type { Comment, CommentThreads } from "@/lib/api/platform";
import { formatAbsolute } from "@/lib/format";

function CommentLine({ comment, returnPath }: { comment: Comment; returnPath: string }) {
  return (
    <div className="comment">
      <p className="comment__head">
        <strong>{comment.author_name || "A colleague"}</strong>
        <span className="quiet">
          {" "}
          · {formatAbsolute(comment.created_at ?? "")}
          {comment.edited_at ? " · edited" : ""}
        </span>
      </p>
      <p className="comment__body">{comment.deleted ? "Deleted." : comment.body}</p>
      {comment.mine && !comment.deleted && (
        <RowAction
          action={deleteCommentAction}
          fields={{ comment_id: comment.comment_id, return_path: returnPath }}
          buttons={[
            {
              label: "Delete",
              pendingLabel: "Deleting…",
              className: "btn btn--small btn--ghost",
              ariaLabel: "Delete this comment",
            },
          ]}
        />
      )}
    </div>
  );
}

/**
 * The threads on a record: a question, its replies, resolved when it is settled. A reply
 * to a resolved thread reopens it. Nothing here changes the record itself.
 */
export function CommentsSection({
  threads,
  subjectType,
  subjectId,
  returnPath,
  canWrite,
}: {
  threads: CommentThreads | null;
  subjectType: string;
  subjectId: string;
  returnPath: string;
  canWrite: boolean;
}) {
  return (
    <div className="comments">
      {threads === null ? (
        <Callout tone="danger" compact>
          The comments could not be read just now.
        </Callout>
      ) : threads.threads.length === 0 ? (
        <p className="muted">No threads yet.</p>
      ) : (
        <ol className="comment-list">
          {threads.threads.map((thread) => (
            <li
              key={thread.comment_id}
              className={
                thread.resolved_at ? "comment-thread comment-thread--resolved" : "comment-thread"
              }
            >
              <div className="comment-thread__state">
                {thread.resolved_at ? (
                  <StatusPill
                    value="resolved"
                    label={`Resolved${thread.resolved_by_name ? ` by ${thread.resolved_by_name}` : ""}`}
                    tone="live"
                  />
                ) : (
                  <StatusPill value="open" label="Open" tone="attention" />
                )}
                {canWrite && !thread.deleted && (
                  <RowAction
                    action={resolveCommentAction}
                    fields={{
                      comment_id: thread.comment_id,
                      resolved: thread.resolved_at ? "false" : "true",
                      return_path: returnPath,
                    }}
                    buttons={[
                      {
                        label: thread.resolved_at ? "Reopen" : "Resolve",
                        pendingLabel: "Saving…",
                        className: "btn btn--small btn--ghost",
                        ariaLabel: thread.resolved_at
                          ? "Reopen this thread"
                          : "Resolve this thread",
                      },
                    ]}
                  />
                )}
              </div>
              <CommentLine comment={thread} returnPath={returnPath} />
              {thread.replies.length > 0 && (
                <ol className="comment-list comment-list--replies">
                  {thread.replies.map((reply) => (
                    <li key={reply.comment_id}>
                      <CommentLine comment={reply} returnPath={returnPath} />
                    </li>
                  ))}
                </ol>
              )}
              {canWrite && !thread.deleted && (
                <details className="disclosure comment-thread__reply">
                  <summary>Reply</summary>
                  <CommentForm
                    action={addCommentAction}
                    subjectType={subjectType}
                    subjectId={subjectId}
                    returnPath={returnPath}
                    parentId={thread.comment_id}
                    compact
                  />
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      {canWrite && (
        <CommentForm
          action={addCommentAction}
          subjectType={subjectType}
          subjectId={subjectId}
          returnPath={returnPath}
        />
      )}
    </div>
  );
}

/** The threads on a record, read as the page renders; a failed read says so. */
export async function RecordComments({
  token,
  subjectType,
  subjectId,
  returnPath,
  canWrite,
}: {
  token: string;
  subjectType: string;
  subjectId: string;
  returnPath: string;
  canWrite: boolean;
}) {
  const { readComments } = await import("@/lib/api/platform");
  let threads: CommentThreads | null = null;
  try {
    threads = await readComments(token, subjectType, subjectId);
  } catch {
    threads = null;
  }
  return (
    <CommentsSection
      threads={threads}
      subjectType={subjectType}
      subjectId={subjectId}
      returnPath={returnPath}
      canWrite={canWrite}
    />
  );
}
