import { useEffect } from "react";
import "./Toast.css";

export type ToastKind = "error" | "info" | "success";

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div className={`toast toast--${toast.kind}`} data-testid={`toast-${toast.kind}`}>
      <span className="toast-message">{toast.message}</span>
      <button aria-label="Dismiss" className="toast-dismiss" onClick={() => onDismiss(toast.id)}>
        ×
      </button>
    </div>
  );
}
