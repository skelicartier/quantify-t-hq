import { BrandMark } from "@/components/brand/brand-mark";
import { MobileNavToggle } from "@/components/shell/mobile-nav-toggle";
import { SidebarClock } from "@/components/shell/sidebar-clock";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/**
 * The slim bar across the top of the content column: navigation toggle and brand on
 * phones, then the live clock and the theme switch.
 */
export function AppBar() {
  return (
    <div className="appbar">
      <div className="appbar__lead">
        <MobileNavToggle />
        <BrandMark compact href="/home" />
        <span className="appbar__section">Headquarters</span>
      </div>
      <div className="appbar__tools">
        <span className="appbar__status">
          <span className="appbar__dot" aria-hidden="true" />
          <SidebarClock />
        </span>
        <ThemeToggle />
      </div>
    </div>
  );
}
