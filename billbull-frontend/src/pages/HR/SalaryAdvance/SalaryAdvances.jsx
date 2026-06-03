import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  CreditCard,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  Plus,
  Download,
  Eye,
  Trash2,
  Calendar,
  Check,
  TrendingUp,
  Users,
  X as XIcon,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUpDown,
  UploadCloud,
  File,
  RotateCcw,
  Calculator
} from 'lucide-react';

// --- API IMPORTS ---
import { salaryAdvanceApi } from '../../../api/salaryAdvanceApi';
import { employeesApi } from '../../../api/employeesApi';
import CurrencyAmount, { CurrencySymbol } from '../../../components/CurrencyAmount';
import PaginationFooter from '../../../components/common/PaginationFooter';
import TableSkeleton from '../../../components/common/TableSkeleton';

// --- Configuration ---

const COLORS = {
  primary: '#F5C742',
  bg: '#F7F7FA'
};

const STATUSES = ['All Statuses', 'Active', 'Pending Approval', 'Rejected', 'Completed'];
const SORT_OPTIONS = ['Sort By: Newest', 'Sort By: Oldest', 'Sort By: Amount High', 'Sort By: Amount Low'];

// --- Helper Functions ---

const parseAmount = (val) => {
  if (!val) return 0;
  return parseFloat(val.toString().replace(/[^0-9.]/g, '')) || 0;
};

// --- Sub-Components ---

const StatCard = ({ label, value, subValue, trend, icon: Icon, color }) => (
  <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col justify-between h-full">
    <div className="flex justify-between items-start mb-2">
      <div className="text-sm text-slate-500 font-medium">{label}</div>
      <div className={`p-1.5 rounded-full ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <div className="flex items-end justify-between">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      {subValue && (
        <div className={`text-xs font-medium flex items-center gap-1 ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-500'}`}>
          {trend === 'up' && <ArrowUpRight className="w-3 h-3" />}
          {trend === 'down' && <ArrowDownRight className="w-3 h-3" />}
          {subValue}
        </div>
      )}
    </div>
  </div>
);

const StatusBadge = ({ status }) => {
  // Normalize backend status enum to UI strings if needed
  const normalizedStatus = status === 'PENDING_APPROVAL' ? 'Pending Approval'
    : status === 'ACTIVE' ? 'Active'
      : status === 'COMPLETED' ? 'Completed'
        : status === 'REJECTED' ? 'Rejected'
          : status;

  const styles = {
    'Active': 'bg-green-100 text-green-700 border-green-200',
    'Completed': 'bg-slate-100 text-slate-700 border-slate-200',
    'Pending Approval': 'bg-amber-100 text-amber-700 border-amber-200',
    'Rejected': 'bg-red-100 text-red-700 border-red-200'
  };
  const Icon = { 'Active': CheckCircle2, 'Completed': Check, 'Pending Approval': Clock, 'Rejected': AlertCircle }[normalizedStatus] || Clock;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium border ${styles[normalizedStatus] || 'bg-gray-100'}`}>
      <Icon className="w-3 h-3" />
      {normalizedStatus}
    </span>
  );
};

const TabButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${active
      ? 'bg-[#F5C742] text-slate-900 shadow-sm font-bold'
      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
      }`}
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
);

const FilterDropdown = ({ options, value, onChange, minWidth }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative w-full sm:w-auto">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full sm:w-auto flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap ${minWidth}`}
      >
        {value} <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="absolute top-full mt-1 left-0 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto min-w-[160px]" onClick={() => setIsOpen(false)}>
          {options.map((option) => (
            <button key={option} onClick={() => onChange(option)} className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${option === value ? 'text-slate-900 font-bold bg-[#F5C742]/10' : 'text-slate-600'}`}>
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const SummaryReportCard = ({ title, subtext, metrics, buttonLabel = "Download Report", icon: Icon, iconColor }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col h-full">
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-5 h-5 ${iconColor}`} />
        <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
      </div>
      <p className="text-xs text-slate-500">{subtext}</p>
    </div>
    <div className="space-y-4 flex-1">
      {metrics.map((m, idx) => (
        <div key={idx} className="flex justify-between items-center text-sm">
          <span className="text-slate-500 font-medium">{m.label}</span>
          <span className={`font-bold ${m.color || 'text-slate-900'}`}>{m.val}</span>
        </div>
      ))}
    </div>
    <button className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
      <Download className="w-4 h-4" /> {buttonLabel}
    </button>
  </div>
);

// --- Modals ---

const NewRequestModal = ({ isOpen, onClose, onSave, employeeList }) => {
  const [formData, setFormData] = useState({
    empId: '',
    empName: '',
    dept: '',
    requestDate: new Date().toISOString().split('T')[0],
    type: 'SALARY_ADVANCE', // Backend enum value
    amount: '',
    months: 1,
    remarks: '',
    file: null
  });
  const [fileError, setFileError] = useState('');

  const handleEmployeeChange = (e) => {
    const selectedId = e.target.value;
    const staff = employeeList.find(s => s.id.toString() === selectedId);

    if (staff) {
      setFormData(prev => ({
        ...prev,
        empId: staff.employeeCode,
        empName: `${staff.firstName} ${staff.lastName}`,
        dept: staff.department || 'General'
      }));
    } else {
      setFormData(prev => ({ ...prev, empId: '', empName: '', dept: '' }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFileError('');
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setFileError('File size exceeds 5MB limit.');
        return;
      }
      setFormData(prev => ({ ...prev, file: file }));
    }
  };

  const handleSubmit = () => {
    if (!formData.empId) return;
    if (!formData.amount || formData.amount <= 0) return;
    if (!formData.months || formData.months < 1) return;

    // Prepare payload for backend
    const payload = {
      employeeId: formData.empId,
      employeeName: formData.empName,
      department: formData.dept,
      requestDate: formData.requestDate,
      type: formData.type,
      requestedAmount: formData.amount,
      repaymentPeriodMonths: formData.months,
      remarks: formData.remarks
    };

    onSave(payload, formData.file);
    onClose();
  };

  const monthlyDeduction = formData.amount && formData.months
    ? (parseFloat(formData.amount) / parseInt(formData.months)).toFixed(2)
    : '0.00';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg m-4 max-h-[90vh] flex flex-col overflow-hidden">

        <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">New Advance Request</h3>
            <p className="text-xs text-slate-500">Create a new salary advance or loan request</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><XIcon className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Employee <span className="text-red-500">*</span></label>
              <div className="relative">
                <select
                  className="w-full pl-4 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 appearance-none"
                  onChange={handleEmployeeChange}
                  defaultValue=""
                >
                  <option value="" disabled>Select employee</option>
                  {employeeList.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.firstName} {staff.lastName}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Employee ID</label>
              <input type="text" readOnly disabled placeholder="Auto-filled" value={formData.empId} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Department</label>
            <input type="text" readOnly disabled placeholder="Auto-filled" value={formData.dept} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Request Date <span className="text-red-500">*</span></label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="date" value={formData.requestDate} onChange={(e) => setFormData({ ...formData, requestDate: e.target.value })} className="w-full pl-10 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Advance Type <span className="text-red-500">*</span></label>
              <div className="relative">
                <select className="w-full pl-4 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 appearance-none" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                  <option value="SALARY_ADVANCE">Salary Advance</option>
                  <option value="LOAN">Loan</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Amount (<CurrencySymbol />) <span className="text-red-500">*</span></label>
              <input type="number" placeholder="0.00" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Period (Months) <span className="text-red-500">*</span></label>
              <input type="number" min="1" max="60" value={formData.months} onChange={(e) => setFormData({ ...formData, months: e.target.value })} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400" />
            </div>
          </div>

          <div className="bg-[#F5C742]/10 p-3 rounded-lg border border-[#F5C742]/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-slate-600" />
              <span className="text-sm font-medium text-slate-700">Monthly:</span>
            </div>
            <CurrencyAmount value={monthlyDeduction} className="text-sm font-bold text-slate-900" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Remarks</label>
            <textarea rows="2" placeholder="Reason..." value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400 resize-none"></textarea>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Attachment (Optional)</label>
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors text-center relative">
              <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
              <div className="flex flex-col items-center justify-center gap-1 pointer-events-none">
                {formData.file ? (
                  <>
                    <div className="w-8 h-8 bg-green-50 text-green-600 rounded-full flex items-center justify-center"><Check className="w-4 h-4" /></div>
                    <p className="text-xs font-medium text-slate-900 truncate max-w-[200px]">{formData.file.name}</p>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center"><UploadCloud className="w-4 h-4" /></div>
                    <p className="text-xs text-slate-600 font-medium">Click to upload</p>
                  </>
                )}
              </div>
            </div>
            {fileError && <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {fileError}</p>}
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 shrink-0">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded-lg text-sm font-bold shadow-sm transition-colors">Submit</button>
        </div>
      </div>
    </div>
  );
};

const ViewRequestModal = ({ isOpen, onClose, request }) => {
  if (!isOpen || !request) return null;

  const paidAmount = request.paidAmount || request.paid || 0;
  const totalAmount = request.approvedAmount || request.total || request.requestedAmount || 0;
  const balance = totalAmount - paidAmount;
  const percentage = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        <div className="p-6 border-b border-slate-100 flex justify-between items-start shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Advance Details & Repayment Schedule</h3>
            <p className="text-sm text-slate-500">{request.employeeName} - {request.type}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><XIcon className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 border border-slate-200 rounded-xl text-center">
              <div className="text-xs text-slate-500 mb-1 font-medium uppercase">Approved Amount</div>
              <CurrencyAmount value={totalAmount} className="text-2xl font-bold text-[#0F766E]" />
            </div>
            <div className="p-4 border border-slate-200 rounded-xl text-center">
              <div className="text-xs text-slate-500 mb-1 font-medium uppercase">Deducted</div>
              <CurrencyAmount value={paidAmount} className="text-2xl font-bold text-slate-900" />
            </div>
            <div className="p-4 border border-slate-200 rounded-xl text-center">
              <div className="text-xs text-slate-500 mb-1 font-medium uppercase">Balance</div>
              <CurrencyAmount value={balance} className="text-2xl font-bold text-red-500" />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-2 font-medium">
              <span className="text-slate-700">Repayment Progress</span>
              <span className="text-slate-900">{percentage}%</span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0F766E] rounded-full"
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-5 bg-white">
            <h4 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Request Details</h4>
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">Employee ID</div>
                <div className="font-medium text-slate-900">{request.employeeId}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">Department</div>
                <div className="font-medium text-slate-900">{request.department}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">Request Date</div>
                <div className="font-medium text-slate-900">{request.requestDate}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">Advance Type</div>
                <div className="font-medium text-slate-900">{request.type}</div>
              </div>
              <div className="col-span-2 pt-2 border-t border-slate-50">
                <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">Remarks</div>
                <div className="text-slate-700 italic">{request.remarks || "No remarks"}</div>
              </div>
            </div>
          </div>

          {/* Note: In view mode for a Request, we show basic schedule data if approved */}
          {request.status === 'ACTIVE' || request.status === 'COMPLETED' ? (
            <div className="border border-slate-200 rounded-xl p-5 bg-white">
              <h4 className="text-sm font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Schedule Info</h4>
              <div className="grid grid-cols-2 gap-y-4 text-sm">
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">Repayment Period</div>
                  <div className="font-medium text-slate-900">{request.repaymentPeriodMonths} Months</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1 uppercase">Est. Installment</div>
                  <CurrencyAmount value={Math.round(totalAmount / (request.repaymentPeriodMonths || 1))} className="font-bold text-slate-900" />
                </div>
              </div>
            </div>
          ) : null}

          {request.attachmentFileName && (
            <div className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white border border-slate-200 rounded text-slate-500">
                  <File className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-slate-700">{request.attachmentFileName}</span>
              </div>
              <button className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                <Download className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---

const SalaryAdvances = () => {
  const [activeTab, setActiveTab] = useState('requests');
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);

  // Data States
  const [requestsList, setRequestsList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [repaymentList, setRepaymentList] = useState([]);
  const [employeeList, setEmployeeList] = useState([]);
  const [statsData, setStatsData] = useState(null);

  const [viewModalData, setViewModalData] = useState(null);

  // Filters
  const [reqSearchTerm, setReqSearchTerm] = useState('');
  const [reqStatusFilter, setReqStatusFilter] = useState('All Statuses');
  const [reqDeptFilter, setReqDeptFilter] = useState('All Departments');

  const [schedSearchTerm, setSchedSearchTerm] = useState('');
  const [schedStatusFilter, setSchedStatusFilter] = useState('All Statuses');
  const [schedDeptFilter, setSchedDeptFilter] = useState('All Departments');
  const [schedSort, setSchedSort] = useState('Sort By: Newest');

  const [repSearchTerm, setRepSearchTerm] = useState('');
  const [repSortConfig, setRepSortConfig] = useState({ key: null, direction: 'ascending' });

  // --- Initial Data Fetching ---
  useEffect(() => {
    fetchData();
    fetchEmployees();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [requests, schedules, stats] = await Promise.all([
        salaryAdvanceApi.getAllRequests(),
        salaryAdvanceApi.getAllSchedules(),
        salaryAdvanceApi.getStats()
      ]);
      setRequestsList(requests);
      setRepaymentList(schedules);
      setStatsData(stats);
    } catch (error) {
      console.error("Failed to fetch salary advance data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await employeesApi.getActiveEmployees();
      setEmployeeList(data);
    } catch (error) {
      console.error("Failed to fetch employees:", error);
    }
  };

  // --- Dynamic Calculations ---

  const topStats = useMemo(() => {
    // If stats fetched from backend, use them. Else calculate locally or show 0
    if (!statsData) {
      return [
        { label: "Active Advances", value: "0", subValue: "Currently being repaid", trend: 'neutral', icon: CreditCard, color: "bg-emerald-50 text-emerald-600" },
        { label: "Outstanding Amount", value: <CurrencyAmount value={0} />, subValue: "Total balance", trend: 'neutral', icon: Wallet, color: "bg-red-50 text-red-600" },
        { label: "Pending Requests", value: "0", subValue: "Awaiting approval", trend: 'neutral', icon: Clock, color: "bg-orange-50 text-orange-600" },
        { label: "Approved This Month", value: "0", subValue: "New advances", trend: 'neutral', icon: CheckCircle2, color: "bg-blue-50 text-blue-600" },
      ];
    }

    return [
      {
        label: "Active Advances",
        value: statsData.activeAdvances.toString(),
        subValue: "Currently being repaid",
        trend: 'neutral',
        icon: CreditCard,
        color: "bg-emerald-50 text-emerald-600"
      },
      {
        label: "Outstanding Amount",
        value: <CurrencyAmount value={statsData.outstandingAmount} />,
        subValue: "Total balance",
        trend: statsData.outstandingAmount > 0 ? 'down' : 'neutral',
        icon: Wallet,
        color: "bg-red-50 text-red-600"
      },
      {
        label: "Pending Requests",
        value: statsData.pendingRequests.toString(),
        subValue: "Awaiting approval",
        trend: statsData.pendingRequests > 0 ? 'up' : 'neutral',
        icon: Clock,
        color: "bg-orange-50 text-orange-600"
      },
      {
        label: "Approved This Month",
        value: statsData.approvedThisMonth.toString(),
        subValue: "New advances",
        trend: 'neutral',
        icon: CheckCircle2,
        color: "bg-blue-50 text-blue-600"
      },
    ];
  }, [statsData]);

  // Unique Departments
  const uniqueDepartments = useMemo(() => {
    const depts = new Set(requestsList.map(r => r.department));
    return ['All Departments', ...Array.from(depts)];
  }, [requestsList]);

  // --- Handlers ---

  const handleSaveNewRequest = async (data, file) => {
    try {
      await salaryAdvanceApi.createRequest(data, file);
      fetchData(); // Refresh all data
    } catch (error) {
      console.error("Create failed:", error);
      alert("Failed to create request");
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this request?")) {
      try {
        await salaryAdvanceApi.deleteRequest(id);
        fetchData();
      } catch (error) {
        console.error("Delete failed:", error);
      }
    }
  };

  const handleApprove = async (id) => {
    try {
      await salaryAdvanceApi.approveRequest(id);
      fetchData(); // Refresh UI to show new status and new schedule
    } catch (error) {
      // Backend usually throws error if active loan exists
      alert(error.response?.data || "Failed to approve request");
    }
  };

  const handleView = (req) => {
    setViewModalData(req);
  };

  // ✅ Mark Paid Handler
  const handleRepayment = async (repaymentId) => {
    try {
      await salaryAdvanceApi.markInstallmentPaid(repaymentId);
      fetchData(); // Refresh to show updated paid/remaining and potentially status change
    } catch (error) {
      console.error("Repayment failed:", error);
    }
  };

  // ✅ Revoke Handler
  const handleRevokeRepayment = async (repaymentId) => {
    try {
      await salaryAdvanceApi.revokePayment(repaymentId);
      fetchData();
    } catch (error) {
      console.error("Revoke failed:", error);
    }
  };

  // --- Dynamic Report Calculations (Frontend Logic for Report Tab) ---
  const reportMetrics = useMemo(() => {
    const totalRequests = requestsList.length;
    const approved = requestsList.filter(r => r.status === 'ACTIVE' || r.status === 'COMPLETED').length;

    // Summing Approved Amounts
    const totalAmount = requestsList.reduce((acc, curr) => acc + (curr.approvedAmount || 0), 0);

    const activeDeductions = repaymentList.filter(r => r.status === 'ACTIVE').length;
    const totalDeducted = repaymentList.reduce((acc, curr) => acc + (curr.paidAmount || 0), 0);
    const completedLoans = repaymentList.filter(r => r.remainingAmount === 0).length;

    const activeLoans = repaymentList.filter(r => r.remainingAmount > 0).length;
    const outstandingBalance = repaymentList.reduce((acc, curr) => acc + (curr.remainingAmount || 0), 0);

    return {
      summary: { totalRequests, approved, totalAmount },
      deduction: { activeDeductions, totalDeducted, completedLoans },
      outstanding: { activeLoans, outstandingBalance }
    };
  }, [requestsList, repaymentList]);

  const dynamicReportDeptData = useMemo(() => {
    const deptMap = {};

    requestsList.forEach(req => {
      const dpt = req.department || 'Unknown';
      if (!deptMap[dpt]) {
        deptMap[dpt] = { dept: dpt, requests: 0, approved: 0, active: 0, total: 0, outstanding: 0 };
      }
      deptMap[dpt].requests += 1;
      if (req.status === 'ACTIVE' || req.status === 'COMPLETED') {
        deptMap[dpt].approved += 1;
        deptMap[dpt].total += (req.approvedAmount || 0);
      }
      if (req.status === 'ACTIVE') {
        deptMap[dpt].active += 1;
        // Get outstanding from schedule if exists
        const repayment = repaymentList.find(r => r.requestId === req.id || r.employeeId === req.employeeId);
        if (repayment && repayment.status === 'ACTIVE') {
          deptMap[dpt].outstanding += repayment.remainingAmount;
        }
      }
    });

    return Object.values(deptMap);
  }, [requestsList, repaymentList]);

  // --- Filter Logic ---

  // 1. Advance Requests Tab
  const filteredRequests = useMemo(() => {
    return requestsList.filter(req => {
      const statusMatch = req.status === 'PENDING_APPROVAL' ? 'Pending Approval'
        : req.status === 'ACTIVE' ? 'Active'
          : req.status === 'COMPLETED' ? 'Completed'
            : req.status === 'REJECTED' ? 'Rejected' : req.status;

      const matchesSearch =
        req.employeeName?.toLowerCase().includes(reqSearchTerm.toLowerCase()) ||
        req.employeeId?.toLowerCase().includes(reqSearchTerm.toLowerCase());
      const matchesStatus = reqStatusFilter === 'All Statuses' || statusMatch === reqStatusFilter;
      const matchesDept = reqDeptFilter === 'All Departments' || req.department === reqDeptFilter;

      return matchesSearch && matchesStatus && matchesDept;
    });
  }, [reqSearchTerm, reqStatusFilter, reqDeptFilter, requestsList]);

  // 2. Repayment Schedule Tab
  const filteredRepaymentData = useMemo(() => {
    let data = repaymentList.filter(item => {
      const statusMatch = item.status === 'ACTIVE' ? 'Active' : 'Completed'; // Simplified

      const matchesSearch =
        item.employeeName?.toLowerCase().includes(schedSearchTerm.toLowerCase()) ||
        item.employeeId?.toLowerCase().includes(schedSearchTerm.toLowerCase());
      const matchesStatus = schedStatusFilter === 'All Statuses' || statusMatch === schedStatusFilter;
      const matchesDept = schedDeptFilter === 'All Departments' || item.department === schedDeptFilter;

      return matchesSearch && matchesStatus && matchesDept;
    });

    // Apply Sorting
    if (schedSort === 'Sort By: Amount High') {
      data.sort((a, b) => b.totalAmount - a.totalAmount);
    } else if (schedSort === 'Sort By: Amount Low') {
      data.sort((a, b) => a.totalAmount - b.totalAmount);
    }
    return data;
  }, [schedSearchTerm, schedStatusFilter, schedDeptFilter, schedSort, repaymentList]);

  // Client-side pagination for the two tabs.
  const LIST_PAGE_SIZE = 30;
  const [reqListPage, setReqListPage] = useState(0);
  useEffect(() => { setReqListPage(0); }, [reqSearchTerm, reqStatusFilter, reqDeptFilter]);
  const pagedRequests = useMemo(
    () => filteredRequests.slice(reqListPage * LIST_PAGE_SIZE, (reqListPage + 1) * LIST_PAGE_SIZE),
    [filteredRequests, reqListPage]
  );
  const [schedListPage, setSchedListPage] = useState(0);
  useEffect(() => { setSchedListPage(0); }, [schedSearchTerm, schedStatusFilter, schedDeptFilter, schedSort]);
  const pagedRepayment = useMemo(
    () => filteredRepaymentData.slice(schedListPage * LIST_PAGE_SIZE, (schedListPage + 1) * LIST_PAGE_SIZE),
    [filteredRepaymentData, schedListPage]
  );

  // 3. Reports Tab Logic
  const sortedReportData = useMemo(() => {
    let sortableItems = [...dynamicReportDeptData];
    if (repSearchTerm) {
      sortableItems = sortableItems.filter(item =>
        item.dept.toLowerCase().includes(repSearchTerm.toLowerCase())
      );
    }
    if (repSortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        if (a[repSortConfig.key] < b[repSortConfig.key]) {
          return repSortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[repSortConfig.key] > b[repSortConfig.key]) {
          return repSortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [repSearchTerm, repSortConfig, dynamicReportDeptData]);

  const requestReportSort = (key) => {
    let direction = 'ascending';
    if (repSortConfig.key === key && repSortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setRepSortConfig({ key, direction });
  };

  return (
    <div className="flex min-h-screen bg-[#F7F7FA] font-sans relative w-full overflow-x-hidden">

      <main className="flex-1 flex flex-col w-full">
        <div className="p-4 md:p-6 space-y-6">

          {/* Header */}
          <div className="flex flex-row justify-between items-end mb-2">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-slate-500">Payroll & Finance &rarr; Salary Advances</div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Wallet className="text-[#F5C742]" size={28} /> Salary Advances</h1>
              <p className="text-sm text-slate-500">Manage employee salary advance requests and loan tracking</p>
            </div>

            <button
              onClick={() => setIsNewRequestModalOpen(true)}
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded-lg font-bold shadow-sm transition-colors text-sm"
            >
              <Plus className="w-4 h-4" /> New Advance Request
            </button>
            <button
              onClick={() => setIsNewRequestModalOpen(true)}
              className="sm:hidden flex items-center justify-center p-2.5 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {topStats.map((stat, idx) => (
              <StatCard key={idx} {...stat} />
            ))}
          </div>

          {/* Tabs */}
          <div className="bg-slate-100 p-1 rounded-xl flex flex-col sm:flex-row gap-1 max-w-4xl mx-auto lg:mx-0 lg:max-w-none">
            <TabButton
              active={activeTab === 'requests'}
              onClick={() => setActiveTab('requests')}
              icon={FileText}
              label="Advance Requests"
            />
            <TabButton
              active={activeTab === 'schedule'}
              onClick={() => setActiveTab('schedule')}
              icon={Calendar}
              label="Repayment Schedule"
            />
            <TabButton
              active={activeTab === 'reports'}
              onClick={() => setActiveTab('reports')}
              icon={TrendingUp}
              label="Reports"
            />
          </div>

          {/* --- TAB: ADVANCE REQUESTS --- */}
          {activeTab === 'requests' && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
                <div className="relative w-full lg:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by employee name or ID..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400"
                    value={reqSearchTerm}
                    onChange={(e) => setReqSearchTerm(e.target.value)}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                  <FilterDropdown
                    options={STATUSES}
                    value={reqStatusFilter}
                    onChange={setReqStatusFilter}
                    minWidth="min-w-full sm:min-w-[140px]"
                  />
                  <FilterDropdown
                    options={uniqueDepartments}
                    value={reqDeptFilter}
                    onChange={setReqDeptFilter}
                    minWidth="min-w-full sm:min-w-[160px]"
                  />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 md:p-6 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-800">Advance & Loan Requests</h2>
                  <p className="text-sm text-slate-500">View and manage all salary advance requests</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[#F7F7FA] text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Employee</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Type</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Requested</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Approved</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Date</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Status</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isLoading && <TableSkeleton cols={7} rows={8} />}
                      {filteredRequests.length > 0 ? (
                        pagedRequests.map((req) => (
                          <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-900">{req.employeeName}</div>
                              <div className="text-xs text-slate-500">{req.employeeId} • {req.department}</div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-2 py-1 rounded border border-slate-200 bg-white text-xs font-medium text-slate-600">
                                {/* ✅ Updated check for 'Salary Advance' */}
                                {req.type === 'Salary Advance' ? 'Salary Advance' : 'Loan'}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-900">{req.requestedAmount?.toLocaleString()}</td>
                            <td className="px-6 py-4 text-slate-600">{req.approvedAmount ? req.approvedAmount.toLocaleString() : '-'}</td>
                            <td className="px-6 py-4 text-slate-500">{req.requestDate}</td>
                            <td className="px-6 py-4"><StatusBadge status={req.status} /></td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {req.status === 'PENDING_APPROVAL' ? (
                                  <>
                                    <button
                                      onClick={() => handleApprove(req.id)}
                                      className="flex items-center gap-1 px-2 py-1 bg-white border border-[#10B981] text-[#10B981] rounded text-xs font-medium hover:bg-[#10B981]/5"
                                    >
                                      <Check className="w-3 h-3" /> Approve
                                    </button>
                                    <button
                                      onClick={() => handleDelete(req.id)}
                                      className="p-1.5 text-slate-400 hover:text-red-500 border border-slate-200 rounded hover:border-red-200"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handleView(req)}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 border border-slate-200 rounded"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan="7" className="px-6 py-12 text-center text-slate-400">No requests found.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <PaginationFooter
                    page={reqListPage}
                    size={LIST_PAGE_SIZE}
                    totalElements={filteredRequests.length}
                    totalPages={Math.ceil(filteredRequests.length / LIST_PAGE_SIZE)}
                    onPageChange={setReqListPage}
                  />
                </div>
              </div>
            </div>
          )}

          {/* --- TAB: REPAYMENT SCHEDULE --- */}
          {activeTab === 'schedule' && (
            <div className="animate-in fade-in duration-300 space-y-6">
              {/* Repayment Search & Filter Toolbar */}
              <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
                <div className="relative w-full lg:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by employee name or ID..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400"
                    value={schedSearchTerm}
                    onChange={(e) => setSchedSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                  <FilterDropdown options={SORT_OPTIONS} value={schedSort} onChange={setSchedSort} minWidth="min-w-full sm:min-w-[160px]" />
                  <FilterDropdown options={STATUSES} value={schedStatusFilter} onChange={setSchedStatusFilter} minWidth="min-w-full sm:min-w-[140px]" />
                  <FilterDropdown options={uniqueDepartments} value={schedDeptFilter} onChange={setSchedDeptFilter} minWidth="min-w-full sm:min-w-[160px]" />
                </div>
              </div>

              <div className="space-y-4">
                {filteredRepaymentData.length > 0 ? pagedRepayment.map((item) => (
                  <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                      <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          {item.employeeName} <span className="text-xs font-normal text-slate-400 border border-slate-200 px-2 py-0.5 rounded-full">{item.employeeId}</span>
                        </h3>
                        <div className="text-xs text-slate-500 mt-1">{item.department} • {item.type}</div>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mb-6">
                      <div className="flex justify-between text-xs mb-2 font-medium">
                        <span className="text-slate-700">Repayment Progress</span>
                        <span className="text-slate-900">
                          {item.totalAmount > 0 ? Math.round((item.paidAmount / item.totalAmount) * 100) : 0}%
                        </span>
                      </div>
                      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#F5C742] rounded-full transition-all duration-500" style={{ width: `${(item.paidAmount / item.totalAmount) * 100}%` }}></div>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500 mt-1.5">
                        <span><CurrencyAmount value={item.paidAmount || 0} /> paid</span>
                        <span className="text-red-500 font-medium"><CurrencyAmount value={item.remainingAmount || 0} /> remaining</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div><div className="text-[11px] uppercase text-slate-400 font-bold mb-1">Total Amount</div><CurrencyAmount value={item.totalAmount || 0} className="text-sm font-bold text-green-600" /></div>
                      <div><div className="text-[11px] uppercase text-slate-400 font-bold mb-1">Installment</div><CurrencyAmount value={item.installmentAmount || 0} className="text-sm font-bold text-slate-900" /></div>
                      <div><div className="text-[11px] uppercase text-slate-400 font-bold mb-1">Frequency</div><div className="text-sm font-medium text-slate-700 bg-slate-50 inline-block px-2 py-0.5 rounded border border-slate-100">Monthly</div></div>
                      <div><div className="text-[11px] uppercase text-slate-400 font-bold mb-1">Next Deduction</div><div className="flex items-center gap-1.5 text-sm font-medium text-slate-800"><Calendar className="w-3.5 h-3.5 text-[#F5C742]" /> {item.nextDeductionDate}</div></div>
                    </div>
                    <div className="flex justify-between items-center pt-6 mt-4 border-t border-slate-50">
                      <div className="text-[11px] text-slate-400">Approved by {item.approverName} on {item.approvalDate}</div>

                      <div className="flex items-center gap-2">
                        {/* ✅ Revoke Button: Visible only if Active and Paid > 0 */}
                        {item.status === 'ACTIVE' && item.paidAmount > 0 && (
                          <button
                            onClick={() => handleRevokeRepayment(item.id)}
                            className="flex items-center gap-2 px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-bold transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Revoke
                          </button>
                        )}

                        {/* ✅ Mark Installment Paid Button: Visible only if Active */}
                        {item.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleRepayment(item.id)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded-lg text-xs font-bold transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Mark Paid
                          </button>
                        )}

                        <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"><FileText className="w-3.5 h-3.5" /> View Details</button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-12 bg-white border border-slate-200 rounded-xl text-slate-400">No repayment schedules found matching filters.</div>
                )}
              </div>
              <PaginationFooter
                page={schedListPage}
                size={LIST_PAGE_SIZE}
                totalElements={filteredRepaymentData.length}
                totalPages={Math.ceil(filteredRepaymentData.length / LIST_PAGE_SIZE)}
                onPageChange={setSchedListPage}
              />
            </div>
          )}

          {/* --- TAB: REPORTS --- */}
          {activeTab === 'reports' && (
            <div className="animate-in fade-in duration-300 space-y-6">

              {/* Top Report Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SummaryReportCard
                  title="Advance Summary Report"
                  subtext="By employee, department, or period"
                  icon={Users}
                  iconColor="text-[#0F766E]"
                  metrics={[
                    { label: "Total Requests", val: reportMetrics.summary.totalRequests },
                    { label: "Approved", val: reportMetrics.summary.approved },
                    { label: "Total Amount Disbursed", val: <CurrencyAmount value={reportMetrics.summary.totalAmount} /> }
                  ]}
                />
                <SummaryReportCard
                  title="Deduction Audit Report"
                  subtext="Tracks payroll deduction history"
                  icon={Clock}
                  iconColor="text-[#0F766E]"
                  metrics={[
                    { label: "Active Deductions", val: reportMetrics.deduction.activeDeductions },
                    { label: "Total Deducted", val: <CurrencyAmount value={reportMetrics.deduction.totalDeducted} /> },
                    { label: "Completed", val: reportMetrics.deduction.completedLoans }
                  ]}
                />
                <SummaryReportCard
                  title="Outstanding Loan Report"
                  subtext="Lists all active or overdue advances"
                  icon={AlertCircle}
                  iconColor="text-red-500"
                  metrics={[
                    { label: "Active Loans", val: reportMetrics.outstanding.activeLoans },
                    { label: "Outstanding Balance", val: <CurrencyAmount value={reportMetrics.outstanding.outstandingBalance} />, color: "text-red-500" },
                    { label: "Avg. Deduction/Month", val: <CurrencyAmount value={1000} /> } // Mock average
                  ]}
                />
              </div>

              {/* Department Distribution Table */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                  <div>
                    <h2 className="font-semibold text-slate-800 text-lg">Department-wise Advance Distribution</h2>
                    <p className="text-sm text-slate-500 mt-1">Breakdown of advances by department</p>
                  </div>
                  {/* Search Bar for Reports Table */}
                  <div className="relative w-full md:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search department..."
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#F5C742] focus:ring-1 focus:ring-[#F5C742]"
                      value={repSearchTerm}
                      onChange={(e) => setRepSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F7F7FA] text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestReportSort('dept')}>
                          <div className="flex items-center gap-1">Department <ArrowUpDown className="w-3 h-3" /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestReportSort('requests')}>
                          <div className="flex items-center gap-1">Total Requests <ArrowUpDown className="w-3 h-3" /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestReportSort('approved')}>
                          <div className="flex items-center gap-1">Approved <ArrowUpDown className="w-3 h-3" /></div>
                        </th>
                        <th className="px-6 py-4 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestReportSort('active')}>
                          <div className="flex items-center justify-center gap-1">Active <ArrowUpDown className="w-3 h-3" /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestReportSort('total')}>
                          <div className="flex items-center gap-1">Total Amount <ArrowUpDown className="w-3 h-3" /></div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestReportSort('outstanding')}>
                          <div className="flex items-center gap-1 text-red-500">Outstanding <ArrowUpDown className="w-3 h-3" /></div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedReportData.length > 0 ? (
                        sortedReportData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-slate-900">{row.dept}</td>
                            <td className="px-6 py-4 text-slate-600">{row.requests}</td>
                            <td className="px-6 py-4 text-slate-600">{row.approved}</td>
                            <td className="px-6 py-4 text-center">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-slate-200 text-xs text-[#0F766E] font-bold bg-white">
                                {row.active}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-medium text-slate-900"><CurrencyAmount value={row.total} /></td>
                            <td className="px-6 py-4 font-medium text-red-500"><CurrencyAmount value={row.outstanding} /></td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                            No department data found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* New Request Modal */}
      {isNewRequestModalOpen && (
        <NewRequestModal
          isOpen={isNewRequestModalOpen}
          onClose={() => setIsNewRequestModalOpen(false)}
          onSave={handleSaveNewRequest}
          employeeList={employeeList} // ✅ Pass dynamic list
        />
      )}

      {/* View Details Modal */}
      {viewModalData && (
        <ViewRequestModal
          isOpen={!!viewModalData}
          onClose={() => setViewModalData(null)}
          request={viewModalData}
        />
      )}

    </div>
  );
};

export default SalaryAdvances;
