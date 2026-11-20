import Link from "next/link";

import { SegmentedLinks } from "@/components/ui/toolbar";

/** The questionnaire pages' own strip (ws-notes/security/spec.md §9.7): Questionnaires · Answer library. */
export const QUESTIONNAIRE_TABS = [
  {
    key: "questionnaires",
    label: "Questionnaires",
    href: "/data/waitlist/diligence/questionnaires",
  },
  { key: "answers", label: "Answer library", href: "/data/waitlist/diligence/answers" },
] as const;

export type QuestionnaireTab = (typeof QUESTIONNAIRE_TABS)[number]["key"];

export function QuestionnaireTabs({ current }: { current: QuestionnaireTab }) {
  return (
    <div className="hqdata-qtabs">
      <SegmentedLinks
        label="Questionnaires"
        items={QUESTIONNAIRE_TABS.map((tab) => ({
          href: tab.href,
          label: tab.label,
          current: tab.key === current,
        }))}
      />
      <Link className="text-link hqdata-qtabs__back" href="/data/waitlist/diligence">
        Back to Diligence
      </Link>
    </div>
  );
}
