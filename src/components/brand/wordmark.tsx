type WordmarkSize = "small" | "rail" | "default" | "large";

/**
 * "quantify terminal." — the brand wherever HQ shows it: lowercase in Poppins 600, the full
 * stop heavier and in the brand purple. Never a symbol beside it, never "Quantify" alone.
 */
export function Wordmark({ size = "default" }: { size?: WordmarkSize }) {
  return (
    <span className={`wordmark wordmark--${size}`} translate="no">
      quantify terminal<span className="wordmark__dot">.</span>
    </span>
  );
}
