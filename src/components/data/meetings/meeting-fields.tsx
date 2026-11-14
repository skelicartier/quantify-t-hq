import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { MEETING_MODES } from "@/lib/data/labels-registers";

/** The kinds a meeting is planned as; a resolution by circulation has its own form. */
const PLANNED_KINDS = { board: "Board meeting", agm: "AGM", egm: "EGM" } as const;

/**
 * "Plan a meeting" (ws-notes/company/spec.md §7.7.2): the kind, an optional title, the day,
 * the time, the place, how it is held, the agenda; the board's size when the company record
 * has no directors; and "It was held on that day", which records it as held at once.
 */
export function MeetingFields({
  prefix,
  today,
  askBoard,
}: {
  prefix: string;
  today: string;
  /** The company record has no directors here, so the board's size is asked. */
  askBoard: boolean;
}) {
  const id = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <div className="hqdata-meeting-form__pair">
        <Field id={id("kind")} label="Kind">
          <Select id={id("kind")} name="kind" defaultValue="board">
            {Object.entries(PLANNED_KINDS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={id("title")} label="Title">
          <Input
            id={id("title")}
            name="title"
            maxLength={200}
            placeholder="Leave it empty for “Board meeting 1”"
          />
        </Field>
      </div>
      <div className="hqdata-meeting-form__pair">
        <Field id={id("day")} label="Day">
          <Input id={id("day")} name="scheduled_on" type="date" required defaultValue={today} />
        </Field>
        <Field id={id("time")} label="Time">
          <Input id={id("time")} name="time" type="time" />
        </Field>
      </div>
      <div className="hqdata-meeting-form__pair">
        <Field id={id("place")} label="Place">
          <Input
            id={id("place")}
            name="place"
            maxLength={200}
            defaultValue="The registered office"
          />
        </Field>
        <Field id={id("mode")} label="How">
          <Select id={id("mode")} name="mode" defaultValue="in_person">
            {Object.entries(MEETING_MODES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id={id("agenda")} label="Agenda">
        <Textarea id={id("agenda")} name="agenda" rows={4} maxLength={4_000} />
      </Field>
      {askBoard && (
        <Field
          id={id("board-size")}
          label="Directors on the board"
          hint="The company record has no directors yet, so say how many the board had that day. It works out the quorum."
        >
          <Input
            id={id("board-size")}
            name="board_size"
            type="number"
            min={1}
            max={15}
            step={1}
            inputMode="numeric"
          />
        </Field>
      )}
      <Checkbox
        id={id("held")}
        name="held"
        label="It was held on that day"
        description="Then the meeting is recorded as held, and its page asks who was there."
      />
    </>
  );
}
