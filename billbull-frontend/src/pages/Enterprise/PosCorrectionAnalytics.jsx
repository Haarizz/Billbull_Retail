import React, { useEffect, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, Timer, Gauge } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import { getCorrectionAnalytics } from '../../api/posAdminReportingApi';

const PIE_COLORS = ['#F5C742', '#327F74', '#3B82F6', '#EF4444', '#8B5CF6', '#F59E0B', '#10B981'];

export default function PosCorrectionAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCorrectionAnalytics()
      .then(setData)
      .catch((e) => toast.error(e?.response?.data?.message || 'Failed to load analytics.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="animate-spin" size={24} /></div>;
  }
  if (!data) {
    return <div className="text-center text-slate-400 py-16 text-sm">No analytics data available.</div>;
  }

  const typeDistribution = Object.entries(data.correctionTypeCounts || {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));
  const byDate = [...(data.correctionsByBusinessDate || [])].reverse();
  const byMonth = [...(data.correctionsByMonth || [])].reverse();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2"><TrendingUp size={16} /></div>
          <p className="text-2xl font-bold text-slate-800">{data.successRatePercent}%</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Correction Success Rate</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center mb-2"><TrendingDown size={16} /></div>
          <p className="text-2xl font-bold text-slate-800">{data.failureRatePercent}%</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Correction Failure Rate</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-2"><Timer size={16} /></div>
          <p className="text-2xl font-bold text-slate-800">{data.averageApprovalMinutes != null ? `${data.averageApprovalMinutes}m` : '-'}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Avg. Approval Time</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center mb-2"><Gauge size={16} /></div>
          <p className="text-2xl font-bold text-slate-800">{data.averageExecutionMinutes != null ? `${data.averageExecutionMinutes}m` : '-'}</p>
          <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Avg. Execution Time</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h4 className="text-xs font-bold text-slate-700 mb-3">Most Frequent Correction Types</h4>
          {typeDistribution.length === 0 ? <p className="text-xs text-slate-400 text-center py-8">No data yet.</p> : (
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
          <h4 className="text-xs font-bold text-slate-700 mb-3">Corrections by Business Date (last 30)</h4>
          {byDate.length === 0 ? <p className="text-xs text-slate-400 text-center py-8">No data yet.</p> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={byDate}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#327F74" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h4 className="text-xs font-bold text-slate-700 mb-3">Corrections by Month</h4>
          {byMonth.length === 0 ? <p className="text-xs text-slate-400 text-center py-8">No data yet.</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byMonth}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#F5C742" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h4 className="text-xs font-bold text-slate-700 mb-3">Most Corrected Branches</h4>
          {(!data.topBranches || data.topBranches.length === 0) ? <p className="text-xs text-slate-400 text-center py-8">No data yet.</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.topBranches}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
