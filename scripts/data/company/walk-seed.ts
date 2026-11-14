/**
 * The walk's director (ws-notes/company/spec.md §6.4, §6.11): invented, with the reserved
 * DIN 00000000 no real director holds, on a `.example` address, pinned as `walk-director`
 * so the harness can open the page without asking the service. Made once.
 */

import { addDays } from "../days";

export const WALK_DIRECTOR_ID = "walk-director";

export function walkDirector(today: string): Record<string, unknown> {
  return {
    name: "Walk Director",
    din: "00000000",
    din_allotted_on: "2025-08-01",
    designation: "director",
    appointed_on: "2025-08-14",
    is_founder: true,
    dsc_expires_on: addDays(today, 40),
    dsc_kept: "The office safe",
    mca_email: "director@walk-company.example",
    mca_mobile: "+91 00000 00000",
    mca_address: "1 Invented Lane, Walk Town",
  };
}
