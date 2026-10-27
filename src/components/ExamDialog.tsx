import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/** Native modal supplies focus containment, Escape handling and background isolation. */
export function ExamDialog({ open, title, onClose, busy = false, className = '', children }: {
  open: boolean; title: string; onClose: () => void; busy?: boolean; className?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={`exam-dialog ${className}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget || busy) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className="exam-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="exam-icon-button" aria-label={`Tutup ${title}`} disabled={busy} onClick={onClose}><X size={17} /></button></div>
    {children}
  </dialog>;
}
