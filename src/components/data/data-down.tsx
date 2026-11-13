import { restartDataAction } from "@/app/(portal)/data/actions";
import { MailForm } from "@/components/mail/mail-form";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { Callout } from "@/components/ui/callout";
import { SERVICE_COMMAND } from "@/lib/data/labels";
import type { DataFailure } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

/**
 * The states a Data page shows when it cannot show its data. Each says what is true, that
 * nothing is lost, and what to do: the service is a small program on this computer, and
 * Mail merge keeps going whatever Data does.
 */

function Command() {
  return <pre className="merge-command">{SERVICE_COMMAND}</pre>;
}

/** The socket does not answer: the whole service is not running. */
export function DataDown() {
  return (
    <Callout tone="danger" role="alert" title="The service on this computer is not running">
      Mail merge and Data are run by a small program on this computer, and it is not answering.
      Nothing is lost. Start it in a terminal, leave that window open, and reload this page:
      <Command />
    </Callout>
  );
}

/** The service answers, but it is an older one, or was started with Data switched off. */
export function DataMissing() {
  return (
    <Callout tone="attention" title="Data is not in the service that is running">
      The program on this computer is an older one, or it was started with Data switched off. Mail
      merge works as before. When today&rsquo;s batch has gone, stop it (Ctrl-C in its window) and
      start it again:
      <Command />
    </Callout>
  );
}

/** Data is reading its files, or coming back after an error. */
export function DataOpening({
  restarting,
  detail,
  progress,
  message,
}: {
  restarting: boolean;
  detail?: string | undefined;
  progress?: { done: number; total: number } | null | undefined;
  message?: string | undefined;
}) {
  const body = restarting
    ? "It stopped after an error and is coming back. Nothing was lost, and Mail merge kept sending."
    : detail
      ? progress
        ? `${detail}: ${formatNumber(progress.done)} of ${formatNumber(progress.total)}.`
        : `${detail}.`
      : message || "It is reading its files and will answer in a moment.";
  return (
    <Callout
      tone="attention"
      role="status"
      title={restarting ? "Data is restarting" : "Data is opening"}
    >
      {body}
      <div>
        <LiveRefresh intervalSeconds={5} label="Data" />
      </div>
    </Callout>
  );
}

/** Left off after five errors in ten minutes; one button starts it again. */
export function DataStopped() {
  return (
    <Callout tone="danger" title="Data stopped after an error">
      It stopped five times in ten minutes, so it was left off. Mail merge is still sending. Nothing
      was lost.
      <MailForm
        action={restartDataAction}
        submitLabel="Restart Data"
        pendingLabel="Restarting…"
        className="inline-form"
      />
      If it stops again, the service&rsquo;s window says what went wrong.
    </Callout>
  );
}

/** A failed read, drawn as its state; every Data page renders this for a read that was not `ok`. */
export function DataUnavailable({ failure }: { failure: DataFailure }) {
  switch (failure.state) {
    case "down":
      return <DataDown />;
    case "missing":
      return <DataMissing />;
    case "opening":
      return (
        <DataOpening
          restarting={false}
          detail={failure.detail}
          progress={failure.progress}
          message={failure.message}
        />
      );
    case "restarting":
      return <DataOpening restarting />;
    case "stopped":
      return <DataStopped />;
    case "refused":
      return (
        <Callout tone="danger" role="alert">
          {failure.message}
        </Callout>
      );
  }
}
