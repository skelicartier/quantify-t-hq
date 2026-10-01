import { z } from "zod";

export const NOTIFICATION_EMAIL_QUEUE_LIMIT = 500;
export const NOTIFICATION_EMAIL_QUEUE_BODY_BYTE_LIMIT = 1_048_576;

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) => !/<[^>]*>|(?:javascript|data|vbscript|file|ftp|http)\s*:|\x00/iu.test(value),
    );

const timestamp = z.union([z.literal(""), z.iso.datetime({ offset: true })]);

export const notificationEmailInputSchema = z
  .object({
    subject: safeText(140),
    body: safeText(4000),
    scheduled_at: timestamp,
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
  .strict();

export const notificationEmailRevisionSchema = z.union([
  z.literal(""),
  z.string().regex(/^[A-Za-z0-9._:-]{8,64}$/u),
]);

export type NotificationEmailInput = z.infer<typeof notificationEmailInputSchema>;
export type NotificationEmailActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_NOTIFICATION_EMAIL_STATE: NotificationEmailActionState = {
  status: "idle",
  message: "",
};
