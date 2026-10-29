import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

let modalCount = 0,
  bodyOverflow = "";
function lockScroll() {
  if (modalCount++ === 0) {
    bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return () => {
    modalCount = Math.max(0, modalCount - 1);
    if (!modalCount) document.body.style.overflow = bodyOverflow;
  };
}
/** Native modal keeps background content inert; nested previews share one scroll lock. */
export function ExamDialog({
  open,
  title,
  onClose,
  busy = false,
  className = "",
  closeLabel,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  className?: string;
  closeLabel?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    const unlock = lockScroll();
    return () => {
      dialog.close();
      unlock();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      className={`exam-dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
          ),
        ].filter((el) => el.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <div className="exam-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="exam-icon-button"
          aria-label={closeLabel || `Tutup ${title}`}
          disabled={busy}
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
