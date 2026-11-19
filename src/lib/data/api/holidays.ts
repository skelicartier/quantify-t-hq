import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Holidays (duties spec §7.4): the holiday set he keeps, the working week, the checks on a
 * year and the working-day count. National, state and company days are days off; optional
 * ones are listed and are not. Nothing is guessed: the one button adds 26 January, 15 August
 * and 2 October of a year.
 */

export const holidayKindSchema = z.enum(["national", "state", "company", "optional"]);
export type HolidayKind = z.infer<typeof holidayKindSchema>;

/** The line beside a worked-out value (the contract's `RuleLine`), passed on as it is. */
export const ruleLineSchema = z.object({
  key: z.string(),
  title: z.string(),
  confirm_with: z.enum(["CA", "CS", "lawyer", "agent", "bank"]).nullable(),
  confirmed_by: z.string().nullable(),
  confirmed_on: z.string().nullable(),
  usable: z.boolean(),
  starts_on: z.string().nullable(),
  readings: z.array(z.string()),
});

export const holidaySchema = z.object({
  holiday_id: z.string(),
  on: z.string(),
  name: z.string(),
  kind: holidayKindSchema,
  note: z.string(),
  created_at: z.string(),
  created_by: staffSchema,
  weekday: z.string(),
  on_week_off: z.boolean(),
});
export type Holiday = z.infer<typeof holidaySchema>;

export const holidaySetupSchema = z.object({
  week_off: z.array(z.number()),
  state: z.string(),
  state_minimum: z.number().nullable(),
  optional_allowance: z.number().nullable(),
  updated_at: z.string().nullable(),
  updated_by: staffSchema.nullable(),
});
export type HolidaySetup = z.infer<typeof holidaySetupSchema>;

export const holidaysPageSchema = ok.extend({
  year: z.number(),
  years: z.array(z.number()),
  setup: holidaySetupSchema,
  holidays: z.array(holidaySchema),
  checks: z.array(z.string()),
  counts: z.object({
    national: z.number(),
    state: z.number(),
    company: z.number(),
    optional: z.number(),
  }),
  rules: z.object({ national: ruleLineSchema.nullable(), state: ruleLineSchema.nullable() }),
  today: z.string(),
});
export type HolidaysPage = z.infer<typeof holidaysPageSchema>;

export const holidayViewSchema = z.object({
  on: z.string(),
  name: z.string(),
  kind: holidayKindSchema,
});

export const workingDaysSchema = ok.extend({
  from: z.string(),
  count: z.number(),
  on: z.string(),
  off_between: z.array(holidayViewSchema),
  fallback: z.boolean(),
});
export type WorkingDays = z.infer<typeof workingDaysSchema>;

export const readHolidays = (year?: number) =>
  dataAsk(holidaysPageSchema, "GET", year ? `/data/holidays?year=${year}` : "/data/holidays");

export type HolidayInput = { on: string; name: string; kind: string; note?: string };

const holidayAnswer = ok.extend({ holiday: holidaySchema });
const addedAnswer = ok.extend({ added: z.number() });

export const addHoliday = (input: HolidayInput, by: Staff, attempt: string) =>
  dataAsk(holidayAnswer, "POST", "/data/holidays", { ...input, by, attempt });

export const addNationalHolidays = (year: number, by: Staff) =>
  dataAsk(addedAnswer, "POST", "/data/holidays/national", { year, by });

export const pasteHolidays = (text: string, by: Staff, attempt: string) =>
  dataAsk(addedAnswer, "POST", "/data/holidays/bulk", { text, by, attempt });

export const updateHoliday = (holidayId: string, input: Partial<HolidayInput>, by: Staff) =>
  dataAsk(holidayAnswer, "POST", `/data/holidays/${id(holidayId)}/update`, { ...input, by });

export const removeHoliday = (holidayId: string, by: Staff) =>
  dataAsk(
    ok.extend({ removed: z.literal(true) }),
    "POST",
    `/data/holidays/${id(holidayId)}/remove`,
    {
      by,
    },
  );

export type SetupInput = {
  week_off?: number[];
  state?: string;
  state_minimum?: string | number | null;
  optional_allowance?: string | number | null;
};

export const saveHolidaySetup = (input: SetupInput, by: Staff) =>
  dataAsk(ok.extend({ setup: holidaySetupSchema }), "POST", "/data/holidays/setup", {
    ...input,
    by,
  });

export const countWorkingDays = (from: string, count: number) =>
  dataAsk(
    workingDaysSchema,
    "GET",
    `/data/holidays/working-days?from=${encodeURIComponent(from)}&count=${count}`,
  );
