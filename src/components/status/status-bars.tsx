import type { StatusComponent } from "@/lib/api/status";
import { formatDate } from "@/lib/format";

const WORDS: Record<string, string> = {
  operational: "no incident reported",
  maintenance: "maintenance",
  degraded: "degraded performance reported",
  partial: "partial outage reported",
  major: "major outage reported",
};

/**
 * A component's last ninety days, one bar a day, coloured by the worst incident we
 * reported that day. Reported, not measured: HQ does not probe the service, and the
 * caption beside every set of bars says so.
 */
export function StatusBars({ component }: { component: StatusComponent }) {
  const bad = component.bars.filter((bar) => bar.state !== "operational").length;
  return (
    <div className="status-bars">
      <ol
        className="status-bars__row"
        aria-label={`${component.name}: ${bad} of ${component.bars.length} days with a reported incident`}
      >
        {component.bars.map((bar) => (
          <li
            key={bar.day}
            className={`status-bars__bar status-bars__bar--${bar.state}`}
            title={`${formatDate(bar.day)}: ${WORDS[bar.state] ?? bar.state}${bar.incidents > 1 ? ` (${bar.incidents} incidents)` : ""}`}
          />
        ))}
      </ol>
      <div className="status-bars__scale">
        <span>{component.bars.length} days ago</span>
        <span>
          {bad === 0
            ? "No incident reported"
            : `${bad} day${bad === 1 ? "" : "s"} with a reported incident`}
        </span>
        <span>Today</span>
      </div>
    </div>
  );
}
