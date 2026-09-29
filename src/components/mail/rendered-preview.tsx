/**
 * An email as it will arrive: the HTML in a sandboxed frame (no scripts, no forms, no
 * reach into this page), the plain-text part beside it, and the subject over both.
 */
export function RenderedPreview({
  subject,
  html,
  text,
  label = "Rendered email",
}: {
  subject: string;
  html: string;
  text: string;
  label?: string;
}) {
  return (
    <div className="mail-preview">
      <p className="mail-preview__subject">
        <span className="mail-preview__label">Subject</span> {subject}
      </p>
      <iframe className="mail-preview__frame" title={label} sandbox="" srcDoc={html} />
      <details className="mail-preview__text">
        <summary>Plain-text part</summary>
        <pre>{text}</pre>
      </details>
    </div>
  );
}
