import React, { useCallback, useEffect, useRef, useState } from 'react';
import { registerFeedback } from '../../utils/appFeedback';

const TOAST_DURATION_MS = 4500;

const TOAST_ICONS = {
  info: 'i',
  success: '✓',
  warn: '!',
  error: '×',
};

function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolver = useRef(null);
  const idRef = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, options = {}) => {
    const id = ++idRef.current;
    const type = options.type || 'info';
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => dismissToast(id), options.duration ?? TOAST_DURATION_MS);
  }, [dismissToast]);

  const showConfirm = useCallback((options) => {
    return new Promise((resolve) => {
      confirmResolver.current = resolve;
      setConfirmState({
        title: options.title || 'Confirmar',
        message: options.message,
        confirmLabel: options.confirmLabel || 'Confirmar',
        cancelLabel: options.cancelLabel || 'Cancelar',
        danger: Boolean(options.danger),
      });
    });
  }, []);

  const closeConfirm = useCallback((result) => {
    setConfirmState(null);
    confirmResolver.current?.(result);
    confirmResolver.current = null;
  }, []);

  useEffect(() => {
    registerFeedback({ toast: showToast, confirm: showConfirm });
    return () => registerFeedback({ toast: null, confirm: null });
  }, [showToast, showConfirm]);

  useEffect(() => {
    if (!confirmState) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmState, closeConfirm]);

  return (
    <>
      {children}

      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`} role="status">
            <span className="toast__icon" aria-hidden="true">{TOAST_ICONS[t.type] || TOAST_ICONS.info}</span>
            <span className="toast__message">{t.message}</span>
            <button
              type="button"
              className="toast__close"
              onClick={() => dismissToast(t.id)}
              aria-label="Fechar aviso"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ))}
      </div>

      {confirmState && (
        <div
          className="confirm-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeConfirm(false);
          }}
        >
          <div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <h3 id="confirm-title" className="confirm-dialog__title">{confirmState.title}</h3>
            <p className="confirm-dialog__message">{confirmState.message}</p>
            <div className="confirm-dialog__actions">
              <button type="button" className="btn-secondary" onClick={() => closeConfirm(false)}>
                {confirmState.cancelLabel}
              </button>
              <button
                type="button"
                className={confirmState.danger ? 'btn-danger' : 'btn-primary'}
                onClick={() => closeConfirm(true)}
                autoFocus
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default FeedbackProvider;
