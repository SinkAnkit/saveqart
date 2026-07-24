import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const toast = useCallback(
    (message, { type = 'success', duration = 3000 } = {}) => {
      const id = ++idCounter;
      setToasts((list) => [...list, { id, message, type }]);
      timers.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {/* Toast viewport — bottom-right, flat color blocks */}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-auto"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-3 rounded-lg px-4 py-3 animate-[toastIn_0.2s_ease-out]
              ${t.type === 'error'
                ? 'bg-accent text-accent-foreground'
                : 'bg-secondary text-secondary-foreground'}`}
          >
            {t.type === 'error' ? (
              <AlertCircle size={20} strokeWidth={2.5} className="shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 size={20} strokeWidth={2.5} className="shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-sm font-semibold">{t.message}</div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
