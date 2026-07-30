import React, { useEffect, useState } from 'react';
import {
  Loader2, Inbox, Clock, CheckCircle2, PlayCircle, XCircle, AlertTriangle, Ban, CalendarDays, CalendarRange, Tags,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { getCorrectionDashboard } from '../../api/posAdminReportingApi';
import CorrectionExportButtons from '../../components/common/CorrectionExportButtons';

const PIE_COLORS = ['#F5C742', '#327F74', '#3B82F6', '#EF4444', '#8B5CF6', '#F59E0B', '#10B981'];

const STAT_CARDS = [
  { key: 'REQUESTED', label: 'Open Requests', icon: Inbox, color: 'text-slate-600 bg-slate-100' },
  { key: 'PENDING_APPROVAL', label: 'Pending Approval', icon: Clock, color: 'text-amber-700 bg-amber-100' },
  { key: 'APPROVED', label: 'Approved', icon: CheckCircle2, color: 'text-blue-700 bg-blue-100' },
  { key: 'APPLIED', label: 'Applied', icon: PlayCircle, color: 'text-emerald-700 bg-emerald-100' },
  { key: 'REJECTED', label: 'Rejected', icon: XCircle, color: 'text-red-700 bg-red-100' },
  { key: 'FAILED', label: 'Failed', icon: AlertTriangle, color: 'text-red-700 bg-red-100' },
  { key: 'CANCELLED', label: 'Cancelled', icon: Ban, color: 'text-slate-500 bg-slate-100' },
];

export default function PosCorrectionDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCorrectionDashboard()
      .then(setData)
      .catch((e) => toast.error(e?.response?.data?.message || 'Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" size={24} /></div>;
  }
  if (!data) {
    return <div className="text-center text-slate-400 py-16 text-sm">No dashboard data available.</div>;
  }

  const typeDistribution = Object.entries(data.correctionTypeCounts || {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));

  const exportRows = [
    ...STAT_CARDS.map((c) => ({ metric: c.label, value: data.statusCounts?.[c.key] ?? 0 })),
    { metric: "Today's Corrections", value: data.todayCount },
    { metric: 'Corrections This Month', value: data.thisMonthCount },
    { metric: 'Active Categories', value: data.activeCategoriesCount },
  ];
  const exportColumns = [{ header: 'Metric', key: 'metric' }, { header: 'Value', key: 'value' }];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CorrectionExportButtons data={exportRows} columns={exportColumns} title="POS Administration Dashboard Summary" fileName="pos-admin-dashboard-summary" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {STAT_CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${c.color}`}><Icon size={16} /></div>
              <p className="text-2xl font-bold text-slate-800">{data.statusCounts?.[c.key] ?? 0}</p>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{c.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mb-2"><CalendarDays size={16} /></div>
          <p className="text-2xl font-bold text-slate-800">{data.todayCount}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Today's Corrections</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mb-2"><CalendarRange size={16} /></div>
          <p className="text-2xl font-bold text-slate-800">{data.thisMonthCount}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Corrections This Month</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mb-2"><Tags size={16} /></div>
          <p className="text-2xl font-bold text-slate-800">{data.activeCategoriesCount}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Active Cash Movement Categories</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h4 className="text-xs font-bold text-slate-700 mb-3">Correction Types Distribution</h4>
          {typeDistribution.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No corrections yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={typeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {typeDistribution.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h4 className="text-xs font-bold text-slate-700 mb-3">Most Corrected Users / Cashiers (Requesters)</h4>
          {(!data.topRequesters || data.topRequesters.length === 0) ? (
            <p className="text-xs text-slate-400 text-center py-8">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.topRequesters}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#327F74" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 lg:col-span-2">
          <h4 className="text-xs font-bold text-slate-700 mb-3">Most Corrected Branches</h4>
          {(!data.topBranches || data.topBranches.length === 0) ? (
            <p className="text-xs text-slate-400 text-center py-8">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.topBranches}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#F5C742" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
