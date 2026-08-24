import React, { useEffect, useRef } from 'react';

/**
 * Shell padrão para modais — layout responsivo (mobile/tablet).
 * Acessibilidade: fecha com Esc, foca o primeiro campo ao abrir e
 * devolve o foco ao elemento de origem ao fechar.
 */
function ModalShell({
  open,
  onClose,
  disabled = false,
  children,
  maxWidth = 600,
  panelClassName = '',
  handleBackdropMouseDown,
  handleBackdropClick,
}) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    onCloseRef.current = onClose;
    disabledRef.current = disabled;
  }, [onClose, disabled]);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const panel = panelRef.current;

    if (panel && !panel.contains(document.activeElement)) {
      const firstField = panel.querySelector(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
      );
      (firstField || panel).focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !disabledRef.current && onCloseRef.current) {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={handleBackdropMouseDown}
      onClick={(e) => {
        if (handleBackdropClick && onClose) {
          handleBackdropClick(e, () => {
            if (!disabled) onClose();
          });
        } else if (e.target === e.currentTarget && onClose && !disabled) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`modal-panel${panelClassName ? ` ${panelClassName}` : ''}`}
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export default ModalShell;
