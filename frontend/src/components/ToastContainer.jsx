import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export default function ToastContainer({ toasts, onClose }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-md w-full px-4 pointer-events-none">
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start justify-between gap-3 p-4 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 animate-in slide-in-from-top-4 ${
              isError
                ? 'bg-slate-900/95 border-rose-500/60 text-rose-100 shadow-rose-950/40'
                : isSuccess
                ? 'bg-slate-900/95 border-emerald-500/60 text-emerald-100 shadow-emerald-950/40'
                : 'bg-slate-900/95 border-indigo-500/60 text-indigo-100 shadow-indigo-950/40'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              {isError ? (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5 min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider block opacity-80">
                  {isError ? 'Ошибка' : isSuccess ? 'Успешно' : 'Уведомление'}
                </span>
                <p className="text-xs font-sans font-medium leading-relaxed break-words">
                  {toast.message}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onClose(toast.id)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition shrink-0"
              aria-label="Закрыть уведомление"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
