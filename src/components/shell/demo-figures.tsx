import { onDemoService } from "@/lib/demo-figures";

/** One line above a page whose figures are the local demo service's, never the company's. */
export function DemoFiguresNote() {
  if (!onDemoService()) return null;
  return (
    <p className="demo-figures" role="note">
      <span className="demo-figures__dot" aria-hidden="true" />
      Demo data, not company figures.
    </p>
  );
}
