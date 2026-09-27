import {
  Award,
  Building2,
  CalendarClock,
  CalendarOff,
  KeyRound,
  NotebookPen,
  ChartNoAxesCombined,
  ClipboardList,
  Contact,
  FileSpreadsheet,
  Handshake,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  ShieldCheck,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Marks the link current for nested routes (e.g. a company page under Companies). */
  activePrefix?: string;
  /** Shown only when the signed-in staff member holds this capability. */
  capability?: string;
};

export type NavGroup = {
  label: string;
  links: readonly NavLink[];
};

/**
 * The whole portal, grouped the way the week is worked. Groups and links are filtered
 * server-side by capability before rendering, so an intern's sidebar simply has no
 * Business or Team group rather than disabled entries.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Command",
    links: [{ href: "/home", label: "Home", icon: LayoutDashboard }],
  },
  {
    label: "CRM",
    links: [
      {
        href: "/leads",
        label: "Leads",
        icon: Inbox,
        activePrefix: "/leads/",
        capability: "crm:read",
      },
      {
        href: "/companies",
        label: "Companies",
        icon: Building2,
        activePrefix: "/companies/",
        capability: "crm:read",
      },
      {
        href: "/people",
        label: "People",
        icon: Contact,
        activePrefix: "/people/",
        capability: "crm:read",
      },
      {
        href: "/deals",
        label: "Deals",
        icon: Handshake,
        activePrefix: "/deals/",
        capability: "deals:read",
      },
    ],
  },
  {
    label: "Work",
    links: [
      {
        href: "/meetings",
        label: "Meetings",
        icon: CalendarClock,
        activePrefix: "/meetings/",
        capability: "crm:read",
      },
      { href: "/tasks", label: "Tasks", icon: ClipboardList, capability: "crm:read" },
      // Everyone's: a check-in and time off are about the person, not a capability.
      { href: "/checkin", label: "Check-in", icon: NotebookPen },
      { href: "/time-off", label: "Time off", icon: CalendarOff },
    ],
  },
  {
    label: "Desk",
    links: [
      {
        href: "/support",
        label: "Support",
        icon: LifeBuoy,
        activePrefix: "/support/",
        capability: "tickets:read",
      },
    ],
  },
  {
    label: "Business",
    links: [
      {
        href: "/revenue/contracts",
        label: "Revenue",
        icon: ChartNoAxesCombined,
        activePrefix: "/revenue/",
        capability: "revenue:read",
      },
      {
        href: "/reports",
        label: "Reports",
        icon: FileSpreadsheet,
        capability: "revenue:read",
      },
    ],
  },
  {
    label: "Team",
    links: [
      {
        href: "/team",
        label: "Team",
        icon: UsersRound,
        activePrefix: "/team/",
        capability: "hr:read",
      },
      {
        href: "/certificates",
        label: "Certificates",
        icon: Award,
        capability: "certificates:issue",
      },
      {
        href: "/access-review",
        label: "Access review",
        icon: KeyRound,
        activePrefix: "/access-review",
        capability: "hr:read",
      },
    ],
  },
  {
    label: "System",
    links: [
      {
        href: "/admin/staff",
        label: "Admin",
        icon: UserCog,
        activePrefix: "/admin/",
        capability: "hq:admin",
      },
      { href: "/admin/audit", label: "Audit", icon: ScrollText, capability: "audit:read" },
      { href: "/me/security", label: "My security", icon: ShieldCheck, activePrefix: "/me/" },
    ],
  },
];

/** The groups a set of capabilities may see, with unreachable links removed. */
export function visibleNavGroups(capabilities: readonly string[]): NavGroup[] {
  const held = new Set(capabilities);
  return NAV_GROUPS.map((group) => ({
    label: group.label,
    links: group.links.filter((link) => !link.capability || held.has(link.capability)),
  })).filter((group) => group.links.length > 0);
}
