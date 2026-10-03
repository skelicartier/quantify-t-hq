import {
  Activity,
  Award,
  BadgeCheck,
  BookOpen,
  Bell,
  Building2,
  CalendarClock,
  CalendarOff,
  KeyRound,
  Landmark,
  NotebookPen,
  ChartNoAxesCombined,
  ClipboardList,
  MessagesSquare,
  Contact,
  FileSpreadsheet,
  Handshake,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  HeartHandshake,
  Mail,
  Newspaper,
  Receipt,
  Scale,
  ScrollText,
  ShieldCheck,
  UserCog,
  UsersRound,
  UserPlus,
  Wallet,
  Waypoints,
  Gauge,
  Users,
  CreditCard,
  Megaphone,
  AtSign,
  Rocket,
  FileText,
  FileClock,
  Settings2,
  KeySquare,
  ShieldEllipsis,
  UserCheck,
  Stethoscope,
  ListChecks,
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
  /** The letter after `g` that jumps here from anywhere; printed in the palette. */
  key?: string;
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
    links: [
      { href: "/home", label: "Home", icon: LayoutDashboard, key: "h" },
      // Everyone's: what needs this person, with the reason it is here.
      { href: "/inbox", label: "Inbox", icon: Bell, key: "i" },
    ],
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
        key: "l",
      },
      {
        href: "/companies",
        label: "Companies",
        icon: Building2,
        activePrefix: "/companies/",
        capability: "crm:read",
        key: "c",
      },
      {
        href: "/people",
        label: "People",
        icon: Contact,
        activePrefix: "/people/",
        capability: "crm:read",
        key: "p",
      },
      {
        href: "/deals",
        label: "Deals",
        icon: Handshake,
        activePrefix: "/deals/",
        capability: "deals:read",
        key: "d",
      },
      {
        href: "/success",
        label: "Customer success",
        icon: HeartHandshake,
        activePrefix: "/success/",
        capability: "crm:read",
        key: "u",
      },
      {
        href: "/data-health",
        label: "Data health",
        icon: Stethoscope,
        activePrefix: "/data-health/",
        capability: "crm:read",
        key: "q",
      },
    ],
  },
  {
    label: "Outreach",
    links: [
      {
        href: "/mail",
        label: "Mail",
        icon: Mail,
        activePrefix: "/mail/",
        capability: "crm:read",
        key: "o",
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
        key: "m",
      },
      {
        href: "/tasks",
        label: "Tasks",
        icon: ClipboardList,
        activePrefix: "/tasks/",
        capability: "crm:read",
        key: "t",
      },
      // Everyone's: a check-in and time off are about the person, not a capability.
      { href: "/checkin", label: "Check-in", icon: NotebookPen },
      { href: "/time-off", label: "Time off", icon: CalendarOff },
      // Anyone named to interview an applicant scores them here, whatever their role.
      { href: "/hiring/interviews", label: "Interviews", icon: MessagesSquare },
      // Everyone claims their own; deciding one is checked by the service.
      { href: "/expenses", label: "Expenses", icon: Receipt, activePrefix: "/expenses/" },
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
        key: "s",
      },
      {
        href: "/help",
        label: "Help centre",
        icon: BookOpen,
        activePrefix: "/help/",
        capability: "tickets:read",
      },
      {
        href: "/privacy",
        label: "Privacy",
        icon: Scale,
        activePrefix: "/privacy/",
        capability: "privacy:read",
        key: "v",
      },
      // Sales opens it for the answer library; the registers behind it are the owners'.
      {
        href: "/trust",
        label: "Trust",
        icon: BadgeCheck,
        activePrefix: "/trust/",
        capability: "crm:read",
      },
      {
        href: "/service-status",
        label: "Status",
        icon: Activity,
        activePrefix: "/service-status/",
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
        key: "r",
      },
      {
        href: "/reports",
        label: "Reports",
        icon: FileSpreadsheet,
        capability: "revenue:read",
        key: "w",
      },
      {
        href: "/reports/review",
        label: "Weekly review",
        icon: ListChecks,
        capability: "revenue:read",
        key: "y",
      },
      {
        href: "/reports/attribution",
        label: "Lead sources",
        icon: Waypoints,
        capability: "revenue:read",
      },
      {
        href: "/finance",
        label: "Finance",
        icon: Wallet,
        activePrefix: "/finance/",
        capability: "revenue:write",
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
        key: "e",
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
      {
        href: "/hiring",
        label: "Hiring",
        icon: UserPlus,
        activePrefix: "/hiring/",
        capability: "hr:read",
      },
    ],
  },
  {
    // The product's administration (the console's, moved here), run as each person's own
    // linked Quantify Terminal account; the product's role on it decides what they may do.
    label: "Product",
    links: [
      { href: "/product", label: "Overview", icon: Gauge, capability: "product:access" },
      {
        href: "/product/users",
        label: "Accounts",
        icon: Users,
        activePrefix: "/product/users",
        capability: "product:access",
      },
      {
        href: "/product/subscriptions",
        label: "Subscriptions",
        icon: CreditCard,
        capability: "product:access",
      },
      {
        href: "/product/notifications",
        label: "Notices",
        icon: Megaphone,
        capability: "product:access",
      },
      {
        href: "/product/email",
        label: "Product email",
        icon: AtSign,
        capability: "product:access",
      },
      { href: "/product/releases", label: "Releases", icon: Rocket, capability: "product:access" },
      { href: "/product/reports", label: "Reports", icon: FileText, capability: "product:access" },
      {
        href: "/product/audit",
        label: "Product audit",
        icon: FileClock,
        capability: "product:access",
      },
      {
        href: "/product/configuration",
        label: "Configuration",
        icon: Settings2,
        capability: "product:access",
      },
      {
        href: "/product/secrets",
        label: "Provider keys",
        icon: KeySquare,
        capability: "product:access",
      },
      {
        href: "/product/credentials",
        label: "Credentials",
        icon: ShieldEllipsis,
        capability: "product:access",
      },
      {
        href: "/product/roles",
        label: "Product roles",
        icon: UserCog,
        capability: "product:access",
      },
      {
        href: "/product/access",
        label: "Product staff",
        icon: UserCheck,
        capability: "product:access",
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
      // Everyone's: the registered particulars every document prints, and the brand.
      { href: "/company", label: "Company", icon: Landmark, activePrefix: "/company" },
      {
        href: "/me/security",
        label: "My security",
        icon: ShieldCheck,
        activePrefix: "/me/security",
      },
      // A reader of any list may have its saved views mailed.
      { href: "/me/digests", label: "My digests", icon: Newspaper, capability: "crm:read" },
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

/** Every link a set of capabilities may reach, flattened, for the palette and `g` keys. */
export function visibleNavLinks(capabilities: readonly string[]): NavLink[] {
  return visibleNavGroups(capabilities).flatMap((group) => group.links);
}
