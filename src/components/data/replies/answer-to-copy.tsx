"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * "Your answer, ready to copy": the answer to a yes with their name, their firm and the
 * booking link filled in, in a read-only box with one button. Nothing is sent; he pastes
 * it into his own reply. When the browser will not copy, it says to select the text.
 */
export function AnswerToCopy({ answer }: { answer: string }) {
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [said, setSaid] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(answer);
      setSaid("Copied.");
    } catch {
      box.current?.select();
      setSaid("Select the text and copy it.");
    }
  }
  return (
    <div className="hqdata-answer">
      <label className="hqdata-answer__label" htmlFor={id}>
        Your answer, ready to copy
      </label>
      <textarea
        ref={box}
        id={id}
        className="textarea hqdata-answer__text"
        readOnly
        rows={4}
        value={answer}
        onFocus={(event) => event.currentTarget.select()}
      />
      <div className="hqdata-answer__acts">
        <Button type="button" size="small" onClick={copy}>
          Copy
        </Button>
        <span className="quiet" role="status" aria-live="polite">
          {said}
        </span>
      </div>
    </div>
  );
}
