"use client";

/**
 * The header checkbox: selects or clears every row the table shows. It toggles the rows'
 * own checkboxes and lets one of them announce the change, so the selection bar counts
 * the result the same way it counts a click.
 */
export function SelectAll({ tableId }: { tableId: string }) {
  return (
    <input
      type="checkbox"
      data-select-all=""
      aria-label="Select every row shown"
      onChange={(event) => {
        const table = document.getElementById(tableId);
        if (!table) return;
        const boxes = Array.from(
          table.querySelectorAll<HTMLInputElement>("tbody input[data-select]"),
        );
        for (const box of boxes) box.checked = event.currentTarget.checked;
        boxes[0]?.dispatchEvent(new Event("change", { bubbles: true }));
      }}
    />
  );
}
