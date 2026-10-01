import { z } from "zod";

export const NOTIFICATION_DOCUMENT_BYTE_LIMIT = 1_048_576;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/<[^>]*>|javascript\s*:|\x00/iu.test(value));
const timestamp = z.union([z.literal(""), z.iso.datetime({ offset: true })]);
const httpsUrl = z.union([
  z.literal(""),
  z
    .url({ protocol: /^https$/u })
    .max(500)
    .refine((value) => {
      const url = new URL(value);
      return !url.username && !url.password;
    }),
]);

export const notificationInputSchema = z
  .object({
    id: z.union([z.literal(""), z.string().regex(/^[a-z0-9][a-z0-9_-]{5,63}$/u)]),
    title: text(140),
    body: text(4000),
    severity: z.enum(["info", "success", "warning", "critical"]),
    display: z.enum(["popup", "center"]),
    active: z.boolean(),
    dismissible: z.boolean(),
    starts_at: timestamp,
    expires_at: timestamp,
    actions: z
      .array(
        z
          .object({
            label: text(60).refine(Boolean),
            url: httpsUrl,
            kind: z.enum(["link", "update", "dismiss"]),
            primary: z.boolean(),
          })
          .strict()
          .refine((action) => action.kind === "dismiss" || Boolean(action.url)),
      )
      .max(4),
    target: z
      .object({
        mode: z.enum(["all", "active", "selected"]),
        user_ids: z.array(z.uuid()).max(5000),
        emails: z.array(z.email().max(254)).max(5000),
      })
      .strict()
      .refine(
        (target) => target.mode !== "selected" || target.user_ids.length + target.emails.length > 0,
      ),
  })
  .strict()
  .refine((note) => Boolean(note.title || note.body))
  .refine(
    (note) =>
      !note.starts_at ||
      !note.expires_at ||
      Date.parse(note.expires_at) > Date.parse(note.starts_at),
  );

export type NotificationInput = z.infer<typeof notificationInputSchema>;
export type NotificationActionState = { status: "idle" | "success" | "error"; message: string };
export const INITIAL_NOTIFICATION_STATE: NotificationActionState = { status: "idle", message: "" };

export const notificationRevisionSchema = z.union([
  z.literal(""),
  z.string().regex(/^[A-Za-z0-9._:-]{8,64}$/u),
]);

export function safeNotificationHref(value: string): string | null {
  return value && httpsUrl.safeParse(value).success ? value : null;
}
