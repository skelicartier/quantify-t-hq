import Link from "next/link";

import { deleteViewAction, saveViewAction } from "@/app/(portal)/_actions/views";
import { SaveViewForm } from "@/components/ui/save-view-form";
import { RowAction } from "@/components/ui/row-action";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readViews, type SavedView } from "@/lib/api/views";

/**
 * Saved views: a name for a combination of filters, sort and view that a person keeps
 * coming back to. A view is nothing but the list's URL query, kept with the account —
 * private, or shared so it sits on everyone's tabs for this list. The built-in filter
 * strips stay the way to browse; this row is for the combinations they cannot express in
 * one click.
 */

/** Query strings compare by their sorted parameters, so `?a=1&b=2` equals `?b=2&a=1`. */
export function normaliseQuery(query: string): string {
  const params = new URLSearchParams(query);
  return [...params.entries()]
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export async function ViewTabs({
  token,
  listKey,
  basePath,
  currentQuery,
  canShare = true,
}: {
  token: string;
  listKey: string;
  basePath: string;
  /** The list's current query string, without the leading `?`. */
  currentQuery: string;
  canShare?: boolean;
}) {
  let views: SavedView[] | null = null;
  try {
    views = (await readViews(token, listKey)).views;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const current = normaliseQuery(currentQuery);
  const list = views ?? [];
  const matches = list.find((view) => normaliseQuery(view.query) === current);
  if (list.length === 0 && !current && views !== null) return null;

  return (
    <div className="views" aria-label="Saved views">
      {views === null && <span className="views__note">Saved views could not be read.</span>}
      {list.length > 0 && (
        <ul className="views__list">
          {list.map((view) => (
            <li key={view.view_id} className="views__item">
              <Link
                className="views__tab"
                href={view.query ? `${basePath}?${view.query}` : basePath}
                aria-current={matches?.view_id === view.view_id ? "page" : undefined}
                title={
                  view.shared
                    ? view.mine
                      ? "Shared with the team"
                      : "A colleague's shared view"
                    : "Only you see this view"
                }
              >
                {view.name}
                {view.shared && (
                  <span className="views__shared" aria-label="shared with the team">
                    ·team
                  </span>
                )}
              </Link>
              {view.mine && (
                <RowAction
                  action={deleteViewAction}
                  fields={{ view_id: view.view_id, base_path: basePath }}
                  buttons={[
                    {
                      label: "×",
                      className: "views__remove",
                      ariaLabel: `Forget the view ${view.name}`,
                    },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {current && !matches && (
        <SaveViewForm
          action={saveViewAction}
          listKey={listKey}
          basePath={basePath}
          query={current}
          canShare={canShare}
        />
      )}
      {current && (
        <Link className="views__reset" href={basePath}>
          Reset
        </Link>
      )}
    </div>
  );
}
