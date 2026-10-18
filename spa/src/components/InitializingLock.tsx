import { useEffect } from "react";

type Props = { open: boolean; message?: string };

/** Full-screen lock while tenant DynamoDB tables are created on activate. */
export function InitializingLock({ open, message = "Initializing. Please wait..." }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="init-lock" role="alertdialog" aria-modal="true" aria-busy="true" aria-live="assertive">
      <div className="init-lock__card">
        <div className="init-lock__spinner" aria-hidden="true" />
        <p className="init-lock__title">{message}</p>
      </div>
    </div>
  );
}
