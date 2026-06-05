import React from 'react';
import { Database, Download, Upload, Calendar } from 'lucide-react';

const DataManagement = () => (
    <div className="min-h-screen bg-[#F5F7FA]">
        <header className="border-b border-[#DCE3EB] bg-white px-7 py-5">
            <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF6D8] text-[#C98A00]">
                    <Database className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950">Data Management</h1>
                    <p className="mt-1 text-sm text-slate-600">Backup, restore, and data maintenance for your tenant.</p>
                </div>
            </div>
        </header>

        <main className="space-y-6 p-7">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-[#DCE3EB] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center gap-2 mb-3">
                        <Download className="h-4 w-4 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-800">Data Backup</h2>
                    </div>
                    <p className="text-sm text-slate-500 mb-4">
                        Schedule and run on-demand backups of your business data.
                    </p>
                    <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-500">
                        Coming soon
                    </span>
                </div>

                <div className="rounded-2xl border border-[#DCE3EB] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center gap-2 mb-3">
                        <Upload className="h-4 w-4 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-800">Data Restore</h2>
                    </div>
                    <p className="text-sm text-slate-500 mb-4">
                        Restore from a previously saved backup.
                    </p>
                    <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-500">
                        Coming soon
                    </span>
                </div>

                <div className="rounded-2xl border border-[#DCE3EB] bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] lg:col-span-2">
                    <div className="flex items-center gap-2 mb-3">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-800">Retention Policy</h2>
                    </div>
                    <p className="text-sm text-slate-500">
                        Backup retention, archival storage and purge policies will be configured here.
                    </p>
                </div>
            </div>
        </main>
    </div>
);

export default DataManagement;
