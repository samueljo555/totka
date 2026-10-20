import React, { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react';

interface ImageModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  altText?: string;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  imageUrl,
  altText = 'Pratinjau Gambar',
  onClose,
}) => {
  const [zoom, setZoom] = useState(1);

  // Reset zoom whenever image changes or opens
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
    }
  }, [isOpen, imageUrl]);

  // Handle keyboard shortcuts (ESC, +, -, 0)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setZoom((prev) => Math.min(3, Math.round((prev + 0.25) * 100) / 100));
      } else if (e.key === '-') {
        setZoom((prev) => Math.max(0.5, Math.round((prev - 0.25) * 100) / 100));
      } else if (e.key === '0') {
        setZoom(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  const handleZoomIn = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setZoom((prev) => Math.min(3, Math.round((prev + 0.25) * 100) / 100));
  };

  const handleZoomOut = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setZoom((prev) => Math.max(0.5, Math.round((prev - 0.25) * 100) / 100));
  };

  const handleReset = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setZoom(1);
  };

  const handleToggleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((prev) => (prev === 1 ? 2 : 1));
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-out',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      {/* Top Bar Close Button */}
      <div
        style={{
          position: 'absolute',
          top: '1.25rem',
          right: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          zIndex: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Tutup"
          title="Tutup (ESC)"
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: 'white',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Main Image Viewport with Scrollable Area */}
      <div
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          padding: '2rem',
          userSelect: 'none',
        }}
        onClick={onClose}
      >
        <img
          src={imageUrl}
          alt={altText}
          onClick={handleToggleDoubleClick}
          style={{
            maxWidth: zoom <= 1 ? '85vw' : 'none',
            maxHeight: zoom <= 1 ? '75vh' : 'none',
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease-out',
            borderRadius: '8px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            cursor: zoom > 1 ? 'zoom-out' : 'zoom-in',
            backgroundColor: 'white',
          }}
          title="Klik ganda untuk memperbesar / memperkecil"
        />
      </div>

      {/* Floating Bottom Control Toolbar */}
      <div
        style={{
          position: 'absolute',
          bottom: '1.5rem',
          background: 'rgba(30, 41, 59, 0.9)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '9999px',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
          color: 'white',
          zIndex: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleZoomOut}
          disabled={zoom <= 0.5}
          title="Perkecil (-)"
          style={{
            background: 'none',
            border: 'none',
            color: zoom <= 0.5 ? '#64748b' : 'white',
            cursor: zoom <= 0.5 ? 'not-allowed' : 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '4px',
          }}
        >
          <ZoomOut size={18} />
        </button>

        <span
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            minWidth: '50px',
            textAlign: 'center',
            color: '#e2e8f0',
          }}
        >
          {Math.round(zoom * 100)}%
        </span>

        <button
          onClick={handleZoomIn}
          disabled={zoom >= 3}
          title="Perbesar (+)"
          style={{
            background: 'none',
            border: 'none',
            color: zoom >= 3 ? '#64748b' : 'white',
            cursor: zoom >= 3 ? 'not-allowed' : 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '4px',
          }}
        >
          <ZoomIn size={18} />
        </button>

        <div
          style={{
            width: '1px',
            height: '18px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
          }}
        />

        <button
          onClick={handleReset}
          title="Reset Ukuran (0)"
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '4px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            borderRadius: '4px',
          }}
        >
          <RotateCcw size={15} />
          <span>Reset</span>
        </button>

        <div
          style={{
            width: '1px',
            height: '18px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
          }}
        />

        <span
          style={{
            fontSize: '0.75rem',
            color: '#94a3b8',
          }}
        >
          ESC / Klik luar untuk tutup
        </span>
      </div>
    </div>
  );
};
