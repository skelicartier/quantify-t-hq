type RailStage = { key: string; label: string; outcome: string; exit_criteria: string };

type StageRailProps = {
  stages: readonly RailStage[];
  currentKey: string;
  status: string;
};

/**
 * Where the deal sits in the pipeline, with the exit criteria for the stage it is in —
 * the one question a stage move should answer: "has this actually happened?"
 */
export function StageRail({ stages, currentKey, status }: StageRailProps) {
  const working = stages.filter((stage) => !stage.outcome);
  const currentIndex = working.findIndex((stage) => stage.key === currentKey);
  const current = working[currentIndex];
  const closed = status !== "open";
  return (
    <div className="stage-rail">
      <ol className="stage-rail__steps" aria-label="Pipeline stages">
        {working.map((stage, index) => {
          const state = closed
            ? status === "won"
              ? "passed"
              : "idle"
            : index < currentIndex
              ? "passed"
              : index === currentIndex
                ? "current"
                : "idle";
          return (
            <li
              key={stage.key}
              className={`stage-rail__step stage-rail__step--${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="stage-rail__label">{stage.label}</span>
            </li>
          );
        })}
      </ol>
      {!closed && current?.exit_criteria && (
        <p className="stage-rail__criteria">
          <span className="stage-rail__criteria-label">To leave this stage</span>
          {current.exit_criteria}
        </p>
      )}
    </div>
  );
}
