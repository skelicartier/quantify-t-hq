"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Prints the page; the print style keeps only the order form. */
export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <Button type="button" size="small" onClick={() => window.print()}>
      <Printer size={14} aria-hidden="true" />
      {label}
    </Button>
  );
}
