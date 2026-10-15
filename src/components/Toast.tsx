import React, { useEffect } from 'react';

export interface ToastProps {
  id: string;
  type?: 'success' | 'error' | 'info';
  message: string;
  onClose: (id: string) => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  id,
  type = 'success',
  message,
  onClose,
  duration = 3500,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const iconName =
    type === 'success'
      ? 'check_circle'
      : type === 'error'
      ? 'error'
      : 'info';

  const badgeColor =
    type === 'success'
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
      : type === 'error'
      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
      : 'bg-[#7372A5]/15 text-[#7372A5] dark:text-[#a1a0d3] border-[#7372A5]/30';

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-[#1e1d2c] border border-[#d8d7e8] dark:border-[#312f45] shadow-lg text-sm text-[#222138] dark:text-[#f2f1f8] animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div
        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border ${badgeColor}`}
      >
        <span className="material-symbols-outlined text-base">{iconName}</span>
      </div>
      <p className="font-semibold text-xs leading-snug flex-1">{message}</p>
      <button
        onClick={() => onClose(id)}
        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-[#ececf4] dark:hover:bg-[#252436] transition-colors"
        aria-label="Dismiss notification"
      >
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  );
};

export interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}
