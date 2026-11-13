import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readBuild, type DataBuild } from "@/lib/data/api/builds";
import { dataRead } from "@/lib/data/read";
import { formatBytes, formatNumber } from "@/lib/format";

export const metadata = { title: "Download" };
export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Where the browser lands when a download is not ready within the time a route may wait:
 * only very large zips and backups. It says how far the file has got, and offers it once
 * it is ready. The file stays for ten minutes.
 */
export default async function DownloadPage({ params }: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await params;
  if (!ID.test(buildId)) notFound();
  const { allowed } = await requireData(`/data/downloads/${buildId}`);
  const read = allowed ? await dataRead(() => readBuild(buildId)) : null;
  const build = read?.ok ? read.data.build : null;
  return (
    <>
      <PageHeader
        title="Preparing your download"
        meta={
          build?.state === "building" ? (
            <LiveRefresh intervalSeconds={3} label="The download" />
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Download build={read.data.build} buildId={buildId} />
        )}
      </div>
    </>
  );
}

function Download({ build, buildId }: { build: DataBuild; buildId: string }) {
  const name = build.name || "Your download";
  const unit = build.kind.endsWith("_csv") ? "" : " files";
  if (build.state === "failed")
    return (
      <Callout tone="danger" role="alert" title="The download could not be made">
        {build.detail || "Something went wrong while it was being made. Try again."}
      </Callout>
    );
  return (
    <div className="hqdata-download">
      <p className="hqdata-download__progress" role="status">
        {name} · {formatNumber(build.progress.done)} of {formatNumber(build.progress.total)}
        {unit}
      </p>
      {build.state === "ready" ? (
        <>
          <ButtonLink href={`/data/downloads/${buildId}/file`} variant="primary" size="small">
            Download {name} ({formatBytes(build.bytes ?? 0)})
          </ButtonLink>
          <p className="side-quiet">It stays here for ten minutes.</p>
        </>
      ) : (
        <p className="side-quiet">
          This page refreshes on its own and offers the file when it is ready.
        </p>
      )}
    </div>
  );
}
