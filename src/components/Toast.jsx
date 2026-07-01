import React, { createContext, useContext, useCallback, useState } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

// Lightweight, non-blocking toast system to replace the app's blocking alert()s.
// Usage: const toast = useToast(); toast('Logged to Lunch', 'success').
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback((message, type = 'info', duration = 3200) => {
    const id = ++idCounter;
    setToasts((t) => [...t, { id, message, type }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-4 inset-x-0 z-[200] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((t) => {
          const Icon = t.type === 'success' ? CheckCircle : t.type === 'error' ? AlertTriangle : Info;
          const color =
            t.type === 'success' ? 'border-emerald-500/40 text-emerald-300'
            : t.type === 'error' ? 'border-red-500/40 text-red-300'
            : 'border-blue-500/40 text-blue-200';
          return (
            <div
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={`pointer-events-auto w-full max-w-sm bg-gray-900/95 backdrop-blur border ${color} rounded-xl shadow-2xl px-4 py-3 flex items-start gap-3 animate-in slide-in-from-top-2 fade-in cursor-pointer`}
            >
              <Icon className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm text-gray-100 flex-1 whitespace-pre-line">{t.message}</span>
              <X className="w-4 h-4 text-gray-500 shrink-0" />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
