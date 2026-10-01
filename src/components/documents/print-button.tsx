"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Prints the page. The print style lays it out as a document: the letterhead on top,
 * the company's particulars and the page number at the foot, the controls left out.
 */
export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <Button type="button" size="small" onClick={() => window.print()}>
      <Printer size={14} aria-hidden="true" />
      {label}
    </Button>
  );
}
