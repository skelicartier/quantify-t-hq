"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FILTER_OPS, OP_LABELS, type FilterField, type FilterOp } from "@/lib/lists/filters";

/**
 * One condition at a time: a field, how it compares, and to what. Adding puts the
 * condition in the URL (`f=field:op:value`), where it joins the others and can be
 * removed as a chip. The list itself applies it on the server, over every row it has.
 */
export function FilterBuilder({
  fields,
  basePath,
  currentQuery,
}: {
  fields: readonly FilterField[];
  /** The list's path, e.g. "/companies". */
  basePath: string;
  /** The list's current query string without the leading `?`; the condition joins it. */
  currentQuery: string;
}) {
  // Built here, not passed in: a server component cannot hand a function to a client one.
  const hrefWith = (condition: string) => {
    const params = new URLSearchParams(currentQuery);
    params.append("f", condition);
    return `${basePath}?${params.toString()}`;
  };
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState(fields[0]?.key ?? "");
  const [op, setOp] = useState<FilterOp>("is");
  const [value, setValue] = useState("");
  const chosen = fields.find((candidate) => candidate.key === field) ?? fields[0];
  const needsValue = !["empty", "set"].includes(op);
  const allowedOps = FILTER_OPS.filter((candidate) =>
    chosen?.kind === "number"
      ? ["is", "not", "gt", "lt", "empty", "set"].includes(candidate)
      : chosen?.kind === "choice"
        ? ["is", "not", "empty", "set"].includes(candidate)
        : ["is", "not", "has", "empty", "set"].includes(candidate),
  );
  if (!open) {
    return (
      <button type="button" className="btn btn--small btn--ghost" onClick={() => setOpen(true)}>
        Add a filter
      </button>
    );
  }
  return (
    <form
      className="filter-builder"
      onSubmit={(event) => {
        event.preventDefault();
        if (needsValue && !value.trim()) return;
        router.push(hrefWith(`${field}:${op}:${needsValue ? value.trim() : ""}`));
        setValue("");
        setOpen(false);
      }}
    >
      <label className="sr-only" htmlFor="filter-field">
        Field
      </label>
      <select
        id="filter-field"
        className="select select--small"
        value={field}
        onChange={(event) => {
          setField(event.target.value);
          setOp("is");
          setValue("");
        }}
      >
        {fields.map((candidate) => (
          <option key={candidate.key} value={candidate.key}>
            {candidate.label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="filter-op">
        Comparison
      </label>
      <select
        id="filter-op"
        className="select select--small"
        value={op}
        onChange={(event) => setOp(event.target.value as FilterOp)}
      >
        {allowedOps.map((candidate) => (
          <option key={candidate} value={candidate}>
            {OP_LABELS[candidate]}
          </option>
        ))}
      </select>
      {needsValue &&
        (chosen?.kind === "choice" ? (
          <select
            className="select select--small"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label="Value"
            required
          >
            <option value="">Choose…</option>
            {chosen.choices?.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="input input--small"
            type={chosen?.kind === "number" ? "number" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label="Value"
            maxLength={120}
            required
          />
        ))}
      <button type="submit" className="btn btn--small btn--primary">
        Apply
      </button>
      <button type="button" className="btn btn--small btn--ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
