/** API imperativa para toasts e confirmações (registrada pelo FeedbackProvider). */

let toastImpl = null;
let confirmImpl = null;

export function registerFeedback({ toast, confirm }) {
  toastImpl = toast;
  confirmImpl = confirm;
}

function fallbackToast(message) {
  if (typeof window !== 'undefined') window.alert(message);
}

function fallbackConfirm(message) {
  if (typeof window !== 'undefined') return window.confirm(message);
  return false;
}

export const toast = Object.assign(
  (message, options = {}) => {
    if (toastImpl) toastImpl(message, { type: 'info', ...options });
    else fallbackToast(message);
  },
  {
    info(message, options) {
      if (toastImpl) toastImpl(message, { type: 'info', ...options });
      else fallbackToast(message);
    },
    success(message, options) {
      if (toastImpl) toastImpl(message, { type: 'success', ...options });
      else fallbackToast(message);
    },
    warn(message, options) {
      if (toastImpl) toastImpl(message, { type: 'warn', ...options });
      else fallbackToast(message);
    },
    error(message, options) {
      if (toastImpl) toastImpl(message, { type: 'error', ...options });
      else fallbackToast(message);
    },
  },
);

/**
 * @param {string | { message: string, title?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }}
 * @returns {Promise<boolean>}
 */
export async function confirmAction(options) {
  const opts = typeof options === 'string' ? { message: options } : options;
  if (confirmImpl) return confirmImpl(opts);
  return fallbackConfirm(opts.message);
}
