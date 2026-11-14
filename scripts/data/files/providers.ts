/**
 * What Files offers the calendar and the search (raise spec §8.11): `agenda:files`, every
 * file not in the trash with a review date, and `search:files`, the Files search over the
 * files not in the trash. Both answer `[]` rather than throw.
 */

import type { DataCore } from "../core";
import { LIMITS, clean } from "../guard";
import {
  agendaService,
  searchService,
  type AgendaItem,
  type AgendaSource,
  type DataSearchHit,
  type SearchSource,
} from "../raise-contracts";
import { byMatch, matchFile, termsOf, type Match } from "./search";
import type { TextJobs } from "./text-jobs";
import type { Vault } from "./vault";

export function registerFileSources(core: DataCore, vault: Vault, text: TextJobs): void {
  const agenda: AgendaSource = {
    agenda: () => {
      try {
        return vault
          .files()
          .filter((file) => !file.trashed && file.review_by !== null)
          .sort(
            (a, b) =>
              (a.review_by ?? "").localeCompare(b.review_by ?? "") ||
              a.title.localeCompare(b.title),
          )
          .map((file): AgendaItem => ({
            key: `file_review:${file.file_id}`,
            kind: "file_review",
            title: `Review ${file.title}`,
            plain: "File review",
            sub: vault.folderPath(file.folder_id),
            on: file.review_by!,
            remind_days: [0],
            href: `/data/files/${file.file_id}`,
          }));
      } catch (error) {
        core.log(`the files agenda failed: ${error instanceof Error ? error.name : "error"}`);
        return [];
      }
    },
  };
  core.provide(agendaService("files"), agenda);

  const search: SearchSource = {
    search: (input) => {
      try {
        if (input.kind !== null && input.kind !== "file") return [];
        const terms = [
          ...new Set(input.terms.map((term) => term.toLowerCase().trim()).filter(Boolean)),
        ];
        if (terms.length === 0) return [];
        const matched: { hit: DataSearchHit; match: Match; updated_at: string }[] = [];
        for (const file of vault.files()) {
          if (file.trashed) continue;
          const current = vault.current(file);
          const match = matchFile(
            file,
            current.original_name,
            () => text.textOf(current.sha256),
            input.query,
            terms,
          );
          if (!match) continue;
          matched.push({
            match,
            updated_at: file.updated_at,
            hit: {
              kind: "file",
              id: file.file_id,
              title: file.title,
              subtitle: vault.folderPath(file.folder_id),
              snippet: match.snippet,
              href: `/data/files/${file.file_id}`,
            },
          });
        }
        matched.sort(byMatch);
        const limit = Math.max(0, Math.floor(input.limit));
        return [
          {
            kind: "file",
            count: matched.length,
            hits: matched.slice(0, limit).map((item) => item.hit),
          },
        ];
      } catch (error) {
        core.log(`the files search failed: ${error instanceof Error ? error.name : "error"}`);
        return [];
      }
    },
  };
  core.provide(searchService("files"), search);

  if (core.testRoutes)
    // Both sources as the calendar and the search would see them, for the tests.
    core.route("GET", "/data/_test/files/raise", (ctx) => {
      const q = clean(ctx.query.get("q"), LIMITS.search);
      return {
        agenda: agenda.agenda(core.day()),
        search: search.search({ query: q, terms: termsOf(q), kind: null, limit: 5 }),
      };
    });
}
