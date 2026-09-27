import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Form primitives. `Field` owns the label, hint and error wiring; the control inside
 * gets `aria-describedby`/`aria-invalid` from `describedBy()` so every form in the
 * console announces its state the same way.
 */

export function describedBy(id: string, options: { hint?: ReactNode; error?: ReactNode }) {
  const ids: string[] = [];
  if (options.error) ids.push(`${id}-error`);
  if (options.hint) ids.push(`${id}-hint`);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

type FieldProps = {
  id: string;
  label: ReactNode;
  note?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function Field({ id, label, note, hint, error, className, children }: FieldProps) {
  return (
    <div className={["field", className ?? ""].filter(Boolean).join(" ")}>
      {/* The note sits beside the label, not inside it, so the accessible name is only the label. */}
      <div className="field__label">
        <label htmlFor={id}>{label}</label>
        {note && <span className="field__label-note">{note}</span>}
      </div>
      {children}
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export function Input({ className, invalid, ...rest }: InputProps) {
  return (
    <input
      className={["input", className ?? ""].filter(Boolean).join(" ")}
      aria-invalid={invalid}
      {...rest}
    />
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

export function Select({ className, invalid, children, ...rest }: SelectProps) {
  return (
    <select
      className={["select", className ?? ""].filter(Boolean).join(" ")}
      aria-invalid={invalid}
      {...rest}
    >
      {children}
    </select>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export function Textarea({ className, invalid, ...rest }: TextareaProps) {
  return (
    <textarea
      className={["textarea", className ?? ""].filter(Boolean).join(" ")}
      aria-invalid={invalid}
      {...rest}
    />
  );
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id"> & {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  tone?: "default" | "danger";
};

/**
 * The label element carries only the visible label, so the accessible name is exactly
 * that text; the description sits beside it and is linked through `aria-describedby`.
 */
export function Checkbox({
  id,
  label,
  description,
  tone = "default",
  className,
  ...rest
}: CheckboxProps) {
  return (
    <div
      className={["checkbox", tone === "danger" ? "checkbox--danger" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <input
        type="checkbox"
        id={id}
        aria-describedby={description ? `${id}-desc` : undefined}
        {...rest}
      />
      <label className="checkbox__label" htmlFor={id}>
        {label}
      </label>
      {description && (
        <span className="checkbox__desc" id={`${id}-desc`}>
          {description}
        </span>
      )}
    </div>
  );
}
