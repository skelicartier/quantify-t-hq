"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId } from "react";

import { formatNumber } from "@/lib/format";

export type NavFolder = {
  folder_id: string;
  name: string;
  depth: number;
  files: number;
  path: string;
};

const hrefOf = (folderId: string) => `/data/files?folder=${folderId}`;

/** The folder column at desk width: the defaults in number order, subfolders indented, each with its count. */
export function FolderNav({
  folders,
  current,
}: {
  folders: readonly NavFolder[];
  current: string | null;
}) {
  return (
    <nav className="hqdata-folders" aria-label="Folders">
      <ul className="hqdata-folders__list">
        {folders.map((folder) => (
          <li key={folder.folder_id} data-depth={Math.min(4, folder.depth)}>
            <Link
              className="hqdata-folders__item"
              href={hrefOf(folder.folder_id)}
              aria-current={folder.folder_id === current ? "page" : undefined}
            >
              <span className="hqdata-folders__name">{folder.name}</span>
              <span className="hqdata-folders__count">{formatNumber(folder.files)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The folder column on a phone: one select labelled "Folder". It opens the chosen folder
 * as soon as it changes; without script, the "Open" button does.
 */
export function FolderSelect({
  folders,
  current,
}: {
  folders: readonly NavFolder[];
  current: string | null;
}) {
  const router = useRouter();
  const selectId = useId();
  return (
    <form className="hqdata-folder-select" method="get" action="/data/files">
      <label className="field__label" htmlFor={selectId}>
        Folder
      </label>
      <div className="hqdata-folder-select__row">
        <select
          id={selectId}
          className="select select--small"
          name="folder"
          defaultValue={current ?? ""}
          onChange={(event) => router.push(hrefOf(event.currentTarget.value))}
        >
          {current === null && (
            <option value="" disabled>
              Choose a folder
            </option>
          )}
          {folders.map((folder) => (
            <option key={folder.folder_id} value={folder.folder_id}>
              {folder.path} ({formatNumber(folder.files)})
            </option>
          ))}
        </select>
        <noscript>
          <button className="btn btn--small" type="submit">
            Open
          </button>
        </noscript>
      </div>
    </form>
  );
}
