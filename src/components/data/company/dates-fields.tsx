"use client";

import { useState } from "react";

import { Field, Input, Select } from "@/components/ui/field";
import { dayWords, firstFyEndOptions } from "@/lib/data/labels-company";

/**
 * The incorporation day and the first financial year's end (company spec §5.2): as the day
 * is typed, the end offers only the days the law allows for it (one, or two for a company
 * incorporated from January to March). Never guessed: with two, he chooses.
 */
export function DatesFields({
  prefix,
  incorporatedOn,
  firstFyEnd,
  today,
}: {
  prefix: string;
  incorporatedOn: string | null;
  firstFyEnd: string | null;
  today: string;
}) {
  const [day, setDay] = useState(incorporatedOn ?? "");
  const options = firstFyEndOptions(day);
  const [end, setEnd] = useState(firstFyEnd ?? "");
  const chosen = options.includes(end) ? end : options.length === 1 ? options[0]! : "";
  return (
    <>
      <input type="hidden" name="group" value="dates" />
      <Field id={`${prefix}-incorporated`} label="Incorporated on">
        <Input
          id={`${prefix}-incorporated`}
          name="incorporated_on"
          type="date"
          max={today}
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
      </Field>
      <Field
        id={`${prefix}-fy-end`}
        label="First financial year ends"
        hint="A company incorporated from 1 January to 31 March may end its first year on the next 31 March instead. Confirm with your CA."
      >
        <Select
          id={`${prefix}-fy-end`}
          name={options.length === 0 ? undefined : "first_fy_end"}
          value={chosen}
          onChange={(event) => setEnd(event.target.value)}
          disabled={options.length === 0}
        >
          <option value="">
            {options.length === 0 ? "Give the incorporation day first" : "Not known"}
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {dayWords(option)}
            </option>
          ))}
        </Select>
      </Field>
      {options.length === 0 && <input type="hidden" name="first_fy_end" value="" />}
    </>
  );
}
