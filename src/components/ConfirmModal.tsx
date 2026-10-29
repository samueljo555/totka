import { ExamDialog } from "./ExamDialog";
import "../confirm-design.css";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Yakin",
  cancelText = "Batal",
  onConfirm,
  onCancel,
  isDestructive = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;
  return (
    <ExamDialog
      open={isOpen}
      title={title}
      onClose={onCancel}
      className="workspace-confirm-dialog"
    >
      <p className="workspace-confirm-message">{message}</p>
      <div className="workspace-confirm-actions">
        <button
          type="button"
          className="workspace-confirm-button"
          onClick={onCancel}
        >
          {cancelText}
        </button>
        <button
          type="button"
          className={`workspace-confirm-button primary${isDestructive ? " danger" : ""}`}
          onClick={onConfirm}
        >
          {confirmText}
        </button>
      </div>
    </ExamDialog>
  );
}
