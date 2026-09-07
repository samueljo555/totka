import React from 'react';

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

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Yakin',
  cancelText = 'Batal',
  onConfirm,
  onCancel,
  isDestructive = false
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div className="glass-panel" style={{
        maxWidth: '400px',
        width: '90%',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-main)' }}>{title}</h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: '1.5' }}>{message}</p>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
          <button className="btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button 
            className="btn" 
            style={isDestructive ? { backgroundColor: '#ef4444' } : {}}
            onClick={() => {
              onConfirm();
              onCancel(); // auto close
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
