import React from 'react';
import { Database, Download, Upload, Calendar } from 'lucide-react';

const DataManagement = () => (
    <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                    <Database className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-slate-900">Data Management</h1>
                    <p className="text-xs text-slate-500">Backup, restore, and data maintenance for your tenant</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
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

                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
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

                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm lg:col-span-2">
                    <div className="flex items-center gap-2 mb-3">
                        <Calendar className="h-4 w-4 text-slate-500" />
                        <h2 className="text-sm font-semibold text-slate-800">Retention Policy</h2>
                    </div>
                    <p className="text-sm text-slate-500">
                        Backup retention, archival storage and purge policies will be configured here.
                    </p>
                </div>
            </div>
        </div>
    </div>
);

export default DataManagement;
