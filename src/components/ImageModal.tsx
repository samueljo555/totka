import { useCallback, useEffect, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { ExamDialog } from "./ExamDialog";

export function ImageModal({
  isOpen,
  imageUrl,
  altText = "Gambar soal diperbesar",
  onClose,
}: {
  isOpen: boolean;
  imageUrl: string | null;
  altText?: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const change = useCallback(
    (delta: number) =>
      setZoom((value) => Math.min(3, Math.max(0.5, value + delta))),
    [],
  );
  useEffect(() => {
    if (isOpen) setZoom(1);
  }, [isOpen, imageUrl]);
  useEffect(() => {
    if (!isOpen) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        change(0.25);
      } else if (event.key === "-") {
        event.preventDefault();
        change(-0.25);
      } else if (event.key === "0") {
        event.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [isOpen, change]);
  return (
    <ExamDialog
      open={isOpen && !!imageUrl}
      title="Gambar soal"
      closeLabel="Tutup"
      className="student-image-dialog"
      onClose={onClose}
    >
      <div className="student-image-controls">
        <button
          type="button"
          aria-label="Perkecil gambar"
          disabled={zoom <= 0.5}
          onClick={() => change(-0.25)}
        >
          <ZoomOut size={16} />
        </button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="Perbesar gambar"
          disabled={zoom >= 3}
          onClick={() => change(0.25)}
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          aria-label="Reset ukuran gambar"
          onClick={() => setZoom(1)}
        >
          <RotateCcw size={15} />
          Reset
        </button>
      </div>
      <div className="student-image-viewport">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={altText}
            style={{ width: `${zoom * 100}%` }}
            onDoubleClick={() => setZoom((value) => (value === 1 ? 2 : 1))}
          />
        )}
      </div>
      <p className="student-image-help">
        Gunakan + / − untuk zoom, 0 untuk reset, dan Escape untuk menutup.
      </p>
    </ExamDialog>
  );
}
