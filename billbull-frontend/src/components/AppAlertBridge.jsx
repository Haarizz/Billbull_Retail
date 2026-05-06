import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const normalizeMessage = (message) => {
  if (message instanceof Error) return message.message;
  if (message === null || message === undefined) return '';
  return String(message);
};

const getAlertTone = (message) => {
  const value = message.toLowerCase();
  if (value.includes('success') || value.includes('saved') || value.includes('created') || value.includes('updated') || value.includes('approved') || value.includes('posted')) {
    return 'success';
  }
  if (value.includes('failed') || value.includes('error') || value.includes('cannot') || value.includes('invalid') || value.includes('required')) {
    return 'error';
  }
  return 'info';
};

const toneConfig = {
  success: {
    title: 'Success',
    icon: CheckCircle2,
    iconClass: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700 text-white'
  },
  error: {
    title: 'Notice',
    icon: AlertCircle,
    iconClass: 'bg-red-50 text-red-600 border-red-100',
    buttonClass: 'bg-slate-900 hover:bg-slate-800 text-white'
  },
  info: {
    title: 'Notice',
    icon: Info,
    iconClass: 'bg-amber-50 text-amber-600 border-amber-100',
    buttonClass: 'bg-slate-900 hover:bg-slate-800 text-white'
  }
};

const AppAlertBridge = () => {
  const [alerts, setAlerts] = useState([]);
  const activeAlert = alerts[0] || null;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const originalAlert = window.alert;
    window.alert = (message = '') => {
      setAlerts((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          message: normalizeMessage(message)
        }
      ]);
    };

    return () => {
      window.alert = originalAlert;
    };
  }, []);

  const config = useMemo(() => {
    if (!activeAlert) return toneConfig.info;
    return toneConfig[getAlertTone(activeAlert.message)];
  }, [activeAlert]);

  if (!activeAlert) return null;

  const Icon = config.icon;
  const close = () => setAlerts((prev) => prev.slice(1));

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px] print:hidden">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3 p-5">
          <div className={`mt-0.5 rounded-full border p-2 ${config.iconClass}`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900">{config.title}</h3>
            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">{activeAlert.message || 'Action completed.'}</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close notice"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={close}
            className={`rounded-md px-4 py-2 text-xs font-bold shadow-sm transition-colors ${config.buttonClass}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppAlertBridge;
