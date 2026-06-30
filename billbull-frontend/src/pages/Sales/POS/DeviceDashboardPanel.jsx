import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    LayoutDashboard, Printer, Wallet, AlertTriangle, Radar, ListOrdered, History, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getDashboardOverview, getDashboardRefreshToken, ignoreDiscoveredDevice } from '../../../api/posDeviceDashboardApi';

// Phase F — Device Dashboard, integrated directly into the BillBull Console (POS > Devices)
// rather than shipped as a separate sidebar module. Same backend contract as before
// (GET /api/pos/devices/dashboard/overview) — only the host/styling changed.
//
// "Consume the Configuration Changed event": polls the cheap /dashboard/refresh-token
// endpoint (backed by DashboardRefreshSignal, the backend's subscriber to
// PosConfigurationChangedEvent) and only re-fetches the full overview when that version
// number has moved, instead of polling the heavier overview on a blind timer.

const REFRESH_TOKEN_POLL_MS = 8000;

const HEALTH_BADGE = {
    ONLINE: 'bg-emerald-50 text-emerald-700',
    BUSY: 'bg-blue-50 text-blue-700',
    OFFLINE: 'bg-gray-200 text-gray-600',
    DISCONNECTED: 'bg-gray-200 text-gray-600',
    ERROR: 'bg-red-50 text-red-700',
    PAPER_OUT: 'bg-amber-50 text-amber-700',
    COVER_OPEN: 'bg-amber-50 text-amber-700',
    UNKNOWN: 'bg-gray-100 text-gray-500',
};

const MetricCard = ({ icon: Icon, label, value, tone = 'gray' }) => (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
        <div className={`p-2 rounded-xl bg-${tone}-100`}>
            <Icon className={`h-4 w-4 text-${tone}-600`} />
        </div>
        <div>
            <div className="text-lg font-bold text-[#1E293B] leading-none">{value}</div>
            <div className="text-[11px] text-gray-400 mt-1">{label}</div>
        </div>
    </div>
);

const HealthBadge = ({ health }) => (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full ${HEALTH_BADGE[health] || HEALTH_BADGE.UNKNOWN}`}>
        {health || 'UNKNOWN'}
    </span>
);

const SectionCard = ({ icon: Icon, title, children }) => (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Icon className="h-4 w-4 text-[#F5C742]" />
            <h3 className="text-sm font-bold text-[#1E293B]">{title}</h3>
        </div>
        {children}
    </div>
);

const EmptyRow = ({ colSpan, children }) => (
    <tr><td colSpan={colSpan} className="py-8 text-center text-gray-400 text-sm">{children}</td></tr>
);

const formatDateTime = (value) => {
    if (!value) return '—';
    try { return new Date(value).toLocaleString(); } catch { return value; }
};

const DeviceDashboardPanel = ({ branchId }) => {
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const versionRef = useRef(-1);

    const load = useCallback(async () => {
        if (!branchId) return;
        try {
            const data = await getDashboardOverview(branchId);
            setOverview(data);
            versionRef.current = data?.refreshSignal?.version ?? 0;
        } catch {
            toast.error('Failed to load device dashboard');
        } finally {
            setLoading(false);
        }
    }, [branchId]);

    useEffect(() => {
        setLoading(true);
        load();
    }, [load]);

    useEffect(() => {
        if (!branchId) return undefined;
        const interval = setInterval(async () => {
            try {
                const token = await getDashboardRefreshToken();
                if (token?.version != null && token.version !== versionRef.current) {
                    load();
                }
            } catch {
                // Best-effort polling — a missed check just means we try again next interval.
            }
        }, REFRESH_TOKEN_POLL_MS);
        return () => clearInterval(interval);
    }, [branchId, load]);

    const handleIgnore = async (id) => {
        try {
            await ignoreDiscoveredDevice(id);
            toast.success('Discovered device ignored');
            load();
        } catch {
            toast.error('Failed to ignore device');
        }
    };

    const metrics = overview?.metrics || {};
    const devices = overview?.devices || [];
    const profiles = overview?.hardwareProfiles || [];
    const discovered = overview?.discoveredDevices || [];
    const printQueue = overview?.printQueue || [];
    const recentEvents = overview?.recentEvents || [];

    if (!branchId) {
        return <div className="py-10 text-center text-gray-400 text-sm">Select a terminal to view its Device Dashboard.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-base font-bold text-[#1E293B]">Device Dashboard</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Hardware Profiles, devices, health, discovery, print queue and event log for this branch.</p>
                </div>
                <button
                    onClick={load}
                    className="flex items-center gap-2 border border-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
                >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
            </div>

            {loading ? (
                <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
            ) : (
                <>
                    {/* Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                        <MetricCard icon={Printer} label="Devices Online" value={metrics.devicesOnline ?? 0} tone="emerald" />
                        <MetricCard icon={Printer} label="Devices Offline" value={metrics.devicesOffline ?? 0} tone="gray" />
                        <MetricCard icon={ListOrdered} label="Pending Print Jobs" value={metrics.pendingPrintJobs ?? 0} tone="blue" />
                        <MetricCard icon={ListOrdered} label="Queue Length" value={metrics.totalQueueLength ?? 0} tone="blue" />
                        <MetricCard icon={Radar} label="Discovered Devices" value={metrics.discoveredDevicesAwaiting ?? 0} tone="purple" />
                        <MetricCard icon={AlertTriangle} label="Health Warnings" value={metrics.healthWarnings ?? 0} tone="amber" />
                        <MetricCard icon={Wallet} label="Drawer Failures" value={metrics.drawerFailures ?? 0} tone="red" />
                        <MetricCard
                            icon={History}
                            label="Avg Print Duration"
                            value={metrics.averagePrintDurationSeconds != null ? `${metrics.averagePrintDurationSeconds.toFixed(1)}s` : '—'}
                            tone="yellow"
                        />
                    </div>

                    {/* Hardware Profiles */}
                    <SectionCard icon={LayoutDashboard} title={`Hardware Profiles (${profiles.length})`}>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Scope</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Version</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {profiles.length === 0 ? (
                                    <EmptyRow colSpan={4}>No hardware profiles for this branch yet.</EmptyRow>
                                ) : profiles.map((p) => (
                                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-2 font-medium text-[#1E293B]">{p.profileName}</td>
                                        <td className="px-4 py-2 text-gray-500">{p.branchId ? 'Branch' : 'Global template'}</td>
                                        <td className="px-4 py-2 text-gray-500">{p.status}</td>
                                        <td className="px-4 py-2 text-gray-500">v{p.version}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </SectionCard>

                    {/* Devices */}
                    <SectionCard icon={Printer} title={`Devices (${devices.length})`}>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Device</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Terminal</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Health</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Last Heartbeat</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {devices.length === 0 ? (
                                    <EmptyRow colSpan={6}>No registered devices for this branch yet.</EmptyRow>
                                ) : devices.map((d) => (
                                    <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-2 font-medium text-[#1E293B]">{d.deviceName} <span className="text-gray-400 text-xs">({d.deviceCode})</span></td>
                                        <td className="px-4 py-2 text-gray-500">{d.deviceType}</td>
                                        <td className="px-4 py-2 text-gray-500">{d.terminalId || '—'}</td>
                                        <td className="px-4 py-2 text-gray-500">{d.status}</td>
                                        <td className="px-4 py-2"><HealthBadge health={d.runtimeHealth} /></td>
                                        <td className="px-4 py-2 text-gray-500">{formatDateTime(d.lastHeartbeat)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </SectionCard>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Discovered Devices */}
                        <SectionCard icon={Radar} title={`Discovered Devices Awaiting Registration (${discovered.length})`}>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50">
                                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Identifier</th>
                                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Method</th>
                                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Suggested Type</th>
                                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {discovered.length === 0 ? (
                                        <EmptyRow colSpan={4}>Nothing awaiting registration.</EmptyRow>
                                    ) : discovered.map((c) => (
                                        <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-2 font-medium text-[#1E293B]">{c.rawIdentifier}</td>
                                            <td className="px-4 py-2 text-gray-500">{c.discoveryMethod}</td>
                                            <td className="px-4 py-2 text-gray-500">{c.suggestedDeviceType || '—'}</td>
                                            <td className="px-4 py-2 text-right">
                                                <button
                                                    onClick={() => handleIgnore(c.id)}
                                                    className="text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors"
                                                >
                                                    Ignore
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </SectionCard>

                        {/* Print Queue */}
                        <SectionCard icon={ListOrdered} title={`Print Queue (${printQueue.length} in flight)`}>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50">
                                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Job</th>
                                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</th>
                                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Attempts</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {printQueue.length === 0 ? (
                                        <EmptyRow colSpan={4}>No jobs queued or dispatched right now.</EmptyRow>
                                    ) : printQueue.map((j) => (
                                        <tr key={j.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-2 font-medium text-[#1E293B]">#{j.id} · {j.jobType}</td>
                                            <td className="px-4 py-2 text-gray-500">{j.priority}</td>
                                            <td className="px-4 py-2 text-gray-500">{j.status}</td>
                                            <td className="px-4 py-2 text-gray-500">{j.attemptCount}/{j.maxAttempts}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </SectionCard>
                    </div>

                    {/* Recent Events */}
                    <SectionCard icon={History} title="Recent Device Events">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50">
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Result</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Operation</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Error</th>
                                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">When</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {recentEvents.length === 0 ? (
                                    <EmptyRow colSpan={5}>No recent events.</EmptyRow>
                                ) : recentEvents.map((e) => (
                                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-2 font-medium text-[#1E293B]">{e.eventType}</td>
                                        <td className="px-4 py-2 text-gray-500">{e.result || '—'}</td>
                                        <td className="px-4 py-2 text-gray-500">{e.operation || '—'}</td>
                                        <td className="px-4 py-2 text-red-600">{e.errorMessage || '—'}</td>
                                        <td className="px-4 py-2 text-gray-500">{formatDateTime(e.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </SectionCard>

                    <p className="text-[11px] text-gray-400">
                        Auto-refreshes when the backend reports a configuration change (Hardware Profile assignment, etc.) — polled every {REFRESH_TOKEN_POLL_MS / 1000}s.
                    </p>
                </>
            )}
        </div>
    );
};

export default DeviceDashboardPanel;
