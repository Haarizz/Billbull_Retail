import billBullLogo from '@billbull/shared/assets/billBullLogo.png';

// Full-screen frame for every shell state that is not the workspace itself (login, loading,
// branch choice, access denied, errors), so the till never shows a half-rendered POS.
export default function TillScreen({ title, subtitle, children, tone = 'default' }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#F7F7FA] px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-gray-100 bg-white p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={billBullLogo} alt="BillBull" className="h-10 w-auto" />
          <span className="rounded-full bg-[#FFF8E7] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#8a6a10] border border-[#FDE6A9]">
            Point of Sale
          </span>
          {title && (
            <h1 className={`text-2xl font-semibold ${tone === 'danger' ? 'text-red-600' : 'text-[#26333C]'}`}>{title}</h1>
          )}
          {subtitle && <p className="text-sm text-[#66737F]">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function TillSpinner({ label }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4" role="status">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#F5C742] border-t-transparent" />
      {label && <p className="text-sm text-gray-500">{label}</p>}
    </div>
  );
}

export const tillButton =
  'w-full h-12 rounded-xl bg-[#F5C742] text-base font-bold text-[#1A1A1A] shadow hover:bg-[#E5B732] disabled:opacity-50 flex items-center justify-center gap-2';
export const tillSecondaryButton =
  'w-full h-11 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50';
