import { DataTable } from "@/components/ui/data-table";
import type { DataPreview, DataVersion } from "@/lib/data/api/files";
import { TEXT_STATES } from "@/lib/data/labels";
import { formatNumber } from "@/lib/format";

/**
 * A file shown in its own page, as far as it safely can be. A PDF in a frame at desk width
 * (an "Open the PDF" button on a phone, where frames are no use), a picture fitted to the
 * width, a CSV's first 200 rows as a table and a text file's first 256 KB as text, both
 * escaped by the page and never handed to the browser to interpret. Anything else is a
 * download.
 */
export function FilePreview({
  fileId,
  title,
  preview,
  version,
}: {
  fileId: string;
  title: string;
  preview: DataPreview;
  version: DataVersion;
}) {
  const view = `/data/files/${fileId}/view`;
  const stateWords = TEXT_STATES[preview.text_state];
  if (preview.kind === "pdf")
    return (
      <div className="hqdata-preview">
        <iframe className="hqdata-preview__frame" title={title} src={view} />
        <p className="hqdata-preview__open">
          <a className="btn btn--small" href={`${view}?log=open`} target="_blank" rel="noopener">
            Open the PDF
          </a>
        </p>
        <h3 className="hqdata-preview__heading">Text in this PDF</h3>
        {preview.text_state === "read" && preview.text ? (
          <pre className="hqdata-preview__scroll">
            {preview.text}
            {preview.text.length >= 2_000 ? "…" : ""}
          </pre>
        ) : (
          <p className="side-quiet">{stateWords}</p>
        )}
      </div>
    );
  if (preview.kind === "image")
    return (
      <div className="hqdata-preview">
        {/* A private, per-request picture: next/image adds nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hqdata-preview__image" alt={title} src={view} />
      </div>
    );
  if (preview.kind === "csv" && preview.table) {
    const { header, rows } = preview.table;
    const width = Math.max(header.length, ...rows.map((row) => row.length));
    const columns = Array.from({ length: width }, (_, index) => ({
      key: `c${index}`,
      label: header[index] || `Column ${index + 1}`,
    }));
    return (
      <div className="hqdata-preview">
        <p className="hqdata-preview__count">
          {version.rows !== null && version.columns !== null
            ? `${formatNumber(version.rows)} ${version.rows === 1 ? "row" : "rows"} · ${formatNumber(version.columns)} ${version.columns === 1 ? "column" : "columns"}`
            : stateWords === TEXT_STATES.read
              ? "Counted."
              : `Counting the rows: ${stateWords.toLowerCase()}`}
          {rows.length < (version.rows ?? 0)
            ? ` · the first ${formatNumber(rows.length)} are shown`
            : ""}
        </p>
        <DataTable
          caption="Preview"
          columns={columns}
          columnMenu={false}
          isEmpty={rows.length === 0}
        >
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column, cell) => (
                <td key={column.key}>{row[cell] ?? ""}</td>
              ))}
            </tr>
          ))}
        </DataTable>
      </div>
    );
  }
  if (preview.kind === "text")
    return (
      <div className="hqdata-preview">
        <pre className="hqdata-preview__scroll">{preview.text ?? ""}</pre>
      </div>
    );
  return <p className="side-quiet">This kind of file is not shown here. Download it to open it.</p>;
}
