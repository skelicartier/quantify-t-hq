import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ReplyForm } from "@/components/data/replies/reply-form";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The reply form (spec §2.5.2): Yes, No and Question record at once with their outcome;
 * Later and Wrong person open their fields first; without scripts every field is there
 * and every answer is its own submit. Raise batch (§7.2.5): Meeting request and Needs
 * review record at once too, "Hold the rest of their firm" is there and ticked, and after
 * a yes the answer to copy is shown under the sentence.
 */

const NOW = Date.parse("2026-11-10T06:30:00.000Z");

/** The address they wrote from (the person they named has an address field of its own). */
const theirAddress = () => screen.getAllByLabelText("Their address")[0]!;
const named = () => within(screen.getByRole("group", { name: "Who they named" }));
const TODAY = "2026-11-10";

function setup(answer: ActionState = { status: "sent", message: "Recorded.", sentAt: 1 }) {
  const seen: FormData[] = [];
  const action = vi.fn(async (_previous: ActionState, formData: FormData) => {
    seen.push(formData);
    return answer;
  });
  render(<ReplyForm action={action} today={TODAY} now={NOW} />);
  return { action, seen, user: userEvent.setup() };
}

describe("ReplyForm", () => {
  it.each([
    ["Record a yes: add the firm to the waitlist", "replied_positive"],
    ["Record a no: put them on the stop list", "not_interested"],
    ["Question", "question"],
    ["Record a meeting request: they asked to meet", "meeting_request"],
    ["Record that it needs review: decide what it means later", "needs_review"],
  ])("“%s” records at once with outcome %s", async (name, outcome) => {
    const { action, seen, user } = setup();
    await user.type(theirAddress(), "asha@peak.example");
    await user.type(screen.getByLabelText("What they said"), "Invented words.");
    await user.click(screen.getByRole("button", { name }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = seen[0]!;
    expect(data.get("outcome")).toBe(outcome);
    expect(data.get("email")).toBe("asha@peak.example");
    expect(data.get("words")).toBe("Invented words.");
    expect(data.get("add_if_missing")).toBe("on");
    expect(data.get("hold_firm")).toBe("on");
    expect(String(data.get("attempt"))).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText("Recorded.")).toBeInTheDocument();
  });

  it("opens Later's fields first: the day defaults to 14 days on, and nothing is recorded yet", async () => {
    const { action, seen, user } = setup();
    const later = screen.getByRole("button", { name: "Later" });
    expect(later).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Write to them again on")).not.toBeVisible();
    await user.click(later);
    expect(action).not.toHaveBeenCalled();
    expect(later).toHaveAttribute("aria-expanded", "true");
    const day = screen.getByLabelText("Write to them again on");
    expect(day).toBeVisible();
    expect(day).toHaveValue("2026-11-24");
    expect(screen.getByLabelText("It was an automatic out-of-office reply")).toBeVisible();
    await user.type(theirAddress(), "asha@peak.example");
    await user.click(screen.getByLabelText("It was an automatic out-of-office reply"));
    await user.click(screen.getByRole("button", { name: "Record: later" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(seen[0]!.get("outcome")).toBe("not_now");
    expect(seen[0]!.get("later_until")).toBe("2026-11-24");
    expect(seen[0]!.get("auto_reply")).toBe("on");
  });

  it("opens Wrong person's fields first, then records who they named", async () => {
    const { action, seen, user } = setup();
    const wrong = screen.getByRole("button", { name: "Wrong person" });
    expect(screen.queryByLabelText("Their title")).not.toBeVisible();
    await user.click(wrong);
    expect(action).not.toHaveBeenCalled();
    await user.type(theirAddress(), "asha@peak.example");
    await user.type(named().getByLabelText("Name"), "Rhea Walkname");
    await user.type(named().getByLabelText("Their address"), "rhea@fund7.example");
    await user.type(named().getByLabelText("Their title"), "Head of research");
    await user.click(screen.getByRole("button", { name: "Record: wrong person" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(seen[0]!.get("outcome")).toBe("wrong_person");
    expect(seen[0]!.get("referral_name")).toBe("Rhea Walkname");
    expect(seen[0]!.get("referral_email")).toBe("rhea@fund7.example");
    expect(seen[0]!.get("referral_title")).toBe("Head of research");
  });

  it("keeps what was typed when the service refuses, with its sentence", async () => {
    const { user } = setup({
      status: "error",
      message:
        "No lead has that address. Tick “If they are not a lead yet, add them” to record it.",
    });
    await user.type(theirAddress(), "stranger@unknown.example");
    await user.type(screen.getByLabelText("What they said"), "Kept words.");
    await user.click(screen.getByRole("button", { name: "Question" }));
    expect(
      await screen.findByText(
        "No lead has that address. Tick “If they are not a lead yet, add them” to record it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("What they said")).toHaveValue("Kept words.");
  });

  it("on a lead's page fixes the address and has no box to add them", () => {
    render(
      <ReplyForm
        action={vi.fn(async () => ({ status: "idle" as const, message: null }))}
        today={TODAY}
        now={NOW}
        email="asha@peak.example"
      />,
    );
    expect(document.querySelector('input[type="email"][name="email"]')).toBeNull();
    expect(screen.queryByLabelText("If they are not a lead yet, add them")).toBeNull();
    expect(document.querySelector('input[type="hidden"][name="email"]')).toHaveValue(
      "asha@peak.example",
    );
  });

  it("without scripts has every field, and every answer is a submit with name outcome", () => {
    const html = renderToString(
      <ReplyForm
        action={vi.fn(async () => ({ status: "idle" as const, message: null }))}
        today={TODAY}
        now={NOW}
      />,
    );
    const page = new DOMParser().parseFromString(html, "text/html");
    for (const name of [
      "email",
      "words",
      "received_at",
      "subject",
      "add_if_missing",
      "later_until",
      "auto_reply",
      "referral_name",
      "referral_email",
      "referral_title",
      "hold_firm",
    ])
      expect(page.querySelector(`[name="${name}"]`), name).not.toBeNull();
    const outcomes = [...page.querySelectorAll('button[name="outcome"]')].map((button) => [
      button.getAttribute("type"),
      button.getAttribute("value"),
    ]);
    expect(outcomes).toEqual([
      ["submit", "replied_positive"],
      ["submit", "meeting_request"],
      ["submit", "not_interested"],
      ["submit", "not_now"],
      ["submit", "wrong_person"],
      ["submit", "question"],
      ["submit", "needs_review"],
      ["submit", "not_now"],
      ["submit", "wrong_person"],
    ]);
    // The hold box is there before scripts run, and ticked.
    expect(page.querySelector('input[name="hold_firm"]')).toHaveProperty("defaultChecked", true);
    // Nothing is hidden before scripts run.
    expect(page.querySelectorAll("fieldset[hidden]")).toHaveLength(0);
    expect(page.querySelector(".hqdata-outcomes")).not.toBeNull();
  });

  it("has “Hold the rest of their firm” ticked, and an unticked box sends nothing", async () => {
    const { action, seen, user } = setup();
    const hold = screen.getByLabelText("Hold the rest of their firm");
    expect(hold).toBeChecked();
    expect(
      screen.getByText(
        "Nobody else at their firm is written to while you answer. Not for free-mail addresses or out-of-office replies; release it from Replies.",
      ),
    ).toBeInTheDocument();
    await user.type(theirAddress(), "asha@peak.example");
    await user.click(hold);
    await user.click(screen.getByRole("button", { name: "Question" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(seen[0]!.get("hold_firm")).toBeNull();
  });

  it("after a yes shows the answer to copy, and copies it", async () => {
    const answer = "Thank you, Asha. Choose a time that suits you here: https://book.example/walk";
    const { user } = setup({
      status: "sent",
      message: "Recorded: Asha Rao said yes. Peak Capital is on the waitlist.",
      sentAt: 2,
      detail: JSON.stringify({ answer }),
    });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.type(theirAddress(), "asha@peak.example");
    await user.click(
      screen.getByRole("button", { name: "Record a yes: add the firm to the waitlist" }),
    );
    const box = await screen.findByLabelText("Your answer, ready to copy");
    expect(box).toHaveValue(answer);
    expect(box).toHaveAttribute("readonly");
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(answer);
    expect(await screen.findByText("Copied.")).toBeInTheDocument();
  });
});
