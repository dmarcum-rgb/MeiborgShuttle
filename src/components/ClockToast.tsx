import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Toast = {
  id: string;
  eventType: 'clock_in' | 'clock_out';
  title: string;
  body: string;
  exiting: boolean;
};

const DISPLAY_MS = 6000;
const EXIT_MS = 400;

export function ClockToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const channel = supabase
      .channel('clock-toast-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const n = payload.new as any;
          if (n.type !== 'clock_event') return;
          addToast(n);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      timers.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const addToast = (n: any) => {
    const toast: Toast = {
      id: n.id,
      eventType: n.metadata?.event_type ?? 'clock_in',
      title: n.title,
      body: n.body,
      exiting: false,
    };

    setToasts(prev => [toast, ...prev].slice(0, 5));

    const exitTimer = setTimeout(() => startExit(toast.id), DISPLAY_MS);
    timers.current.set(toast.id, exitTimer);
  };

  const startExit = (id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    const removeTimer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timers.current.delete(id);
    }, EXIT_MS);
    timers.current.set(id + '-remove', removeTimer);
  };

  const dismiss = (id: string) => {
    const existing = timers.current.get(id);
    if (existing) { clearTimeout(existing); timers.current.delete(id); }
    startExit(id);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden transition-all duration-400 ${
            toast.exiting
              ? 'opacity-0 translate-x-4'
              : 'opacity-100 translate-x-0'
          }`}
          style={{ transition: `opacity ${EXIT_MS}ms ease, transform ${EXIT_MS}ms ease` }}
        >
          {/* Color bar */}
          <div className={`h-1 w-full ${toast.eventType === 'clock_in' ? 'bg-green-500' : 'bg-gray-400'}`} />

          <div className="flex items-start gap-3 p-4">
            {/* Icon */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              toast.eventType === 'clock_in' ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              {toast.eventType === 'clock_in'
                ? <LogIn className="w-5 h-5 text-green-600" />
                : <LogOut className="w-5 h-5 text-gray-500" />
              }
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${
                toast.eventType === 'clock_in' ? 'text-green-700' : 'text-gray-700'
              }`}>
                {toast.title}
              </p>
              <p className="text-sm text-gray-600 mt-0.5 leading-snug">{toast.body}</p>
            </div>

            {/* Dismiss */}
            <button
              onClick={() => dismiss(toast.id)}
              className="p-1 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-all flex-shrink-0 -mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className={`h-0.5 mx-4 mb-3 rounded-full overflow-hidden bg-gray-100`}>
            <div
              className={`h-full rounded-full ${toast.eventType === 'clock_in' ? 'bg-green-400' : 'bg-gray-300'} ${toast.exiting ? '' : 'animate-shrink'}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
