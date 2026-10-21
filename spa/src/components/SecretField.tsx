import { useState, type ReactNode } from "react";
import { usePhrase } from "../i18n";

function Eye({ off }: { off: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      {off ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.7a2 2 0 002.8 2.8" />
          <path d="M9.9 5.1A11 11 0 0112 4.8c5.2 0 9.3 3.2 11 7.2a12 12 0 01-2.2 3.2" />
          <path d="M6.1 6.2A12 12 0 001 12c1.7 4 5.8 7.2 11 7.2 1.5 0 2.9-.3 4.2-.8" />
        </>
      ) : (
        <>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export function SecretField({
  label,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  disabled,
  confirm,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  confirm?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const say = usePhrase();
  const show = confirm ? "Show confirm password" : "Show password";
  const hide = confirm ? "Hide confirm password" : "Hide password";
  return (
    <label className="secret-field">
      {label}
      <span>
        <input
          type={visible ? "text" : "password"}
          dir="ltr"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          disabled={disabled}
        />
        <button
          className="secret-eye"
          type="button"
          aria-label={say(visible ? hide : show)}
          aria-pressed={visible}
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
        >
          <Eye off={visible} />
        </button>
      </span>
    </label>
  );
}
