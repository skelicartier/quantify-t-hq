/**
 * The starter categories (ws-notes/duties/spec.md §8.2): added only when he presses "Add the
 * starter categories", and only those whose name is not there yet. Ledgers and Schedule III
 * lines stay empty for the CA. No vendor or provider is named: "Cloud hosting", never a
 * provider.
 */

import type { CategoryKind } from "./types";

export type StarterCategory = { name: string; kind: CategoryKind; people: boolean };

const expense = (name: string, people = false): StarterCategory => ({
  name,
  kind: "expense",
  people,
});
const of =
  (kind: CategoryKind) =>
  (name: string): StarterCategory => ({ name, kind, people: false });

export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  expense("Cloud hosting"),
  expense("AI API usage"),
  expense("Data licences"),
  expense("Software subscriptions"),
  expense("Contractor fees"),
  expense("Professional fees"),
  expense("Rent"),
  expense("Travel"),
  expense("Bank charges"),
  expense("Other expenses"),
  expense("Stipends", true),
  expense("Salaries", true),
  ...["Customer receipts", "Export receipts"].map(of("income")),
  ...["Reverse-charge IGST", "GST paid", "Tax deducted and deposited", "Income tax"].map(of("tax")),
  of("funding")("Funding received"),
  of("transfer")("Between own accounts"),
  ...["Interest received", "Deferred revenue", "Exchange gain or loss", "Refunds received"].map(
    of("other"),
  ),
];
