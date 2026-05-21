import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Wallet,
  Users,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  Send,
  Download,
  FileText,
  CreditCard,
  BarChart3,
  X as XIcon,
  Plus,
  Calendar,
  Layers,
  TrendingUp // Added for consistency with your snippet, though we might use specific icons
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

// Import APIs
import { employeesApi } from '../../../api/employeesApi';
import { salaryPaymentApi } from '../../../api/salaryPaymentApi';
import CurrencyAmount, { CurrencySymbol } from '../../../components/CurrencyAmount';
import { formatDisplayDate } from '../../../utils/dateUtils';

// --- Configuration ---

const COLORS = {
  primary: '#F5C742',
  bg: '#F3F4F6',
  bank: '#F5C742',
  cash: '#EF4444'
};

// Helper to parse currency string to number
const parseCurrency = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.replace(/[^0-9.-]+/g, ""));
};

const getTodayDate = () => {
  const d = new Date();
  return d.toISOString().split('T')[0];
};

// --- Sub-Components ---

// UPDATED STAT CARD TO MATCH YOUR SPECIFIC UI SNIPPET
const StatCard = ({
  label,
  value,
  subValue,
  trend,
  icon: Icon,
  color
}) => (
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
        <div
          className={`text-xs font-medium ${trend === 'up'
              ? 'text-emerald-600'
              : 'text-slate-500'
            }`}
        >
          {subValue}
        </div>
      )}
    </div>
  </div>
);

const StatusBadge = ({ status }) => {
  const styles = {
    Paid: 'bg-green-100 text-green-700 border-green-200',
    Pending: 'bg-amber-100 text-amber-700 border-amber-200',
    'On Hold': 'bg-red-100 text-red-700 border-red-200'
  };
  const Icon = {
    Paid: CheckCircle2,
    Pending: Clock,
    'On Hold': AlertCircle
  }[status] || Clock;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium border ${styles[status]}`}>
      <Icon className="w-3.5 h-3.5" />
      {status}
    </span>
  );
};

const TabButton = ({ active, onClick, icon: Icon, label }) => (
  <button
    onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-2 py-3 sm:py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${active
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
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full sm:w-auto" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full sm:w-auto flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap ${minWidth}`}
      >
        {value} <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 left-0 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto min-w-[160px]">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${option === value ? 'text-slate-900 font-bold bg-[#F5C742]/10' : 'text-slate-600'}`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Modals ---

const AddPaymentModal = ({ isOpen, onClose, onAdd, staffList }) => {
  const [formData, setFormData] = useState({
    empCode: '',
    name: '',
    dept: '',
    role: '',
    base: 0,
    allow: 0,
    deduct: 0,
    net: 0
  });

  useEffect(() => {
    const net = Number(formData.base) + Number(formData.allow) - Number(formData.deduct);
    setFormData(prev => ({ ...prev, net }));
  }, [formData.base, formData.allow, formData.deduct]);

  const handleEmployeeSelect = (e) => {
    const selectedCode = e.target.value;
    const staff = staffList.find(s => s.employeeCode === selectedCode);

    if (staff) {
      setFormData(prev => ({
        ...prev,
        empCode: staff.employeeCode,
        name: `${staff.firstName} ${staff.lastName}`,
        dept: staff.department || '',
        role: staff.role || '',
        base: staff.basicSalary || 0
      }));
    }
  };

  const handleSubmit = () => {
    onAdd({
      employeeId: formData.empCode,
      name: formData.name,
      dept: formData.dept,
      role: formData.role,
      base: formData.base,
      allow: formData.allow,
      deduct: formData.deduct,
      net: formData.net,
      status: 'Pending'
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Add New Payment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Select Employee</label>
            <select
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 text-slate-700"
              onChange={handleEmployeeSelect}
              value={formData.empCode}
            >
              <option value="">-- Select Employee --</option>
              {staffList.map(staff => (
                <option key={staff.id} value={staff.employeeCode}>
                  {staff.firstName} {staff.lastName} ({staff.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Department</label>
              <input
                type="text"
                readOnly
                value={formData.dept}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Designation</label>
              <input
                type="text"
                readOnly
                value={formData.role}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Base Salary (<CurrencySymbol />)</label>
            <input
              type="number"
              readOnly
              value={formData.base}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-green-600 mb-1 uppercase">Allowances</label>
              <input
                type="number"
                placeholder="0"
                value={formData.allow}
                onChange={(e) => setFormData({ ...formData, allow: Number(e.target.value) })}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-red-500 mb-1 uppercase">Deductions</label>
              <input
                type="number"
                placeholder="0"
                value={formData.deduct}
                onChange={(e) => setFormData({ ...formData, deduct: Number(e.target.value) })}
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 text-slate-900"
              />
            </div>
          </div>

          <div className="p-4 bg-[#F5C742]/10 rounded-lg border border-[#F5C742]/20 flex justify-between items-center">
            <span className="font-semibold text-slate-700">Net Payable</span>
            <CurrencyAmount value={formData.net} className="font-bold text-xl text-slate-900" />
          </div>

        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSubmit} className="flex-1 px-4 py-2.5 bg-[#F5C742] text-slate-900 rounded-lg font-bold hover:bg-[#E5B732] shadow-sm transition-colors">Add to List</button>
        </div>
      </div>
    </div>
  );
};

const ProcessPaymentModal = ({ isOpen, onClose, employee, onConfirm }) => {
  const [method, setMethod] = useState('Bank Transfer');
  const [date, setDate] = useState(getTodayDate());

  if (!isOpen || !employee) return null;

  const netAmount = parseCurrency(employee.netPayable || employee.net);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Process Payment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <DollarSign className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-xl text-slate-900">
              <CurrencyAmount value={netAmount} />
            </h3>
            <p className="text-sm text-slate-500">Net Salary Payable to <span className="font-semibold text-slate-800">{employee.employeeName || employee.name}</span></p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">Payment Method</label>
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer ${method === 'Bank Transfer' ? 'border-[#F5C742] bg-[#F5C742]/10' : 'border-slate-200'}`}>
                <input
                  type="radio"
                  name="payMode"
                  checked={method === 'Bank Transfer'}
                  onChange={() => setMethod('Bank Transfer')}
                  className="text-[#F5C742] focus:ring-[#F5C742]"
                />
                <span className="text-sm font-medium text-slate-900">Bank Transfer</span>
              </label>
              <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer ${method === 'Cash' ? 'border-[#F5C742] bg-[#F5C742]/10' : 'border-slate-200'}`}>
                <input
                  type="radio"
                  name="payMode"
                  checked={method === 'Cash'}
                  onChange={() => setMethod('Cash')}
                  className="text-[#F5C742] focus:ring-[#F5C742]"
                />
                <span className="text-sm font-medium text-slate-900">Cash</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Transaction Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-10 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none text-slate-700"
              />
            </div>
          </div>

        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={() => { onConfirm(employee, method, date); onClose(); }} className="flex-1 px-4 py-2.5 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 shadow-sm transition-colors flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
};

const BulkPaymentModal = ({ isOpen, onClose, count, totalAmount, onConfirm }) => {
  const [method, setMethod] = useState('Bank Transfer');
  const [date, setDate] = useState(getTodayDate());

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Process Bulk Payment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><XIcon className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-[#F5C742]/20 text-[#F5C742] rounded-full flex items-center justify-center mx-auto mb-3">
              <Layers className="w-8 h-8" />
            </div>
            <CurrencyAmount value={totalAmount} className="font-bold text-xl text-slate-900" />
            <p className="text-sm text-slate-500">Total Payable to <span className="font-bold text-slate-800">{count} Employees</span></p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">Payment Method</label>
            <div className="grid grid-cols-2 gap-3">
              <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer ${method === 'Bank Transfer' ? 'border-[#F5C742] bg-[#F5C742]/10' : 'border-slate-200'}`}>
                <input
                  type="radio"
                  name="payModeBulk"
                  checked={method === 'Bank Transfer'}
                  onChange={() => setMethod('Bank Transfer')}
                  className="text-[#F5C742] focus:ring-[#F5C742]"
                />
                <span className="text-sm font-medium text-slate-900">Bank Transfer</span>
              </label>
              <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer ${method === 'Cash' ? 'border-[#F5C742] bg-[#F5C742]/10' : 'border-slate-200'}`}>
                <input
                  type="radio"
                  name="payModeBulk"
                  checked={method === 'Cash'}
                  onChange={() => setMethod('Cash')}
                  className="text-[#F5C742] focus:ring-[#F5C742]"
                />
                <span className="text-sm font-medium text-slate-900">Cash</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Transaction Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-10 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none text-slate-700"
              />
            </div>
          </div>

        </div>
        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={() => onConfirm(method, date)} className="flex-1 px-4 py-2.5 bg-[#F5C742] text-slate-900 rounded-lg font-bold hover:bg-[#E5B732] shadow-sm transition-colors flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Confirm All
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---

const SalaryPayments = () => {
  const [employees, setEmployees] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('individual');
  const [selectedEmployees, setSelectedEmployees] = useState([]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isBulkPayModalOpen, setIsBulkPayModalOpen] = useState(false);
  const [selectedPaymentEmployee, setSelectedPaymentEmployee] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All Departments');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [bulkSearchTerm, setBulkSearchTerm] = useState('');

  // --- Dynamic Stats Calculation ---
  const paymentStats = useMemo(() => {
    const bankTotal = transactions
      .filter(t => t.modes && t.modes.some(m => m.type === 'Bank Transfer'))
      .reduce((acc, curr) => {
        const mode = curr.modes.find(m => m.type === 'Bank Transfer');
        return acc + (mode ? parseCurrency(mode.val) : 0);
      }, 0);

    const cashTotal = transactions
      .filter(t => t.modes && t.modes.some(m => m.type === 'Cash'))
      .reduce((acc, curr) => {
        const mode = curr.modes.find(m => m.type === 'Cash');
        return acc + (mode ? parseCurrency(mode.val) : 0);
      }, 0);

    const chartData = [
      { name: 'Bank Transfer', value: bankTotal, color: COLORS.bank },
      { name: 'Cash', value: cashTotal, color: COLORS.cash }
    ].filter(d => d.value > 0);

    const totalCount = transactions.length;
    const totalAmount = transactions.reduce((acc, curr) => acc + parseCurrency(curr.net), 0);

    return { bankTotal, cashTotal, chartData, totalCount, totalAmount };
  }, [transactions]);


  // --- Initial Data Fetch & Normalize ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const activeStaff = await employeesApi.getActiveEmployees();
        setStaffList(activeStaff);

        const payrollData = await salaryPaymentApi.getPayrollList(new Date().getMonth() + 1, new Date().getFullYear());
        setEmployees(payrollData);

        const txHistory = await salaryPaymentApi.getTransactionHistory();

        const normalizedHistory = txHistory.map(tx => ({
          name: tx.employeeName,
          month: 'October 2025',
          net: tx.netPayable,
          modes: [{ type: tx.paymentMethod, val: tx.netPayable }],
          date: formatDisplayDate(tx.paymentDate),
          status: tx.status
        }));
        setTransactions(normalizedHistory);

      } catch (error) {
        console.error("Failed to fetch salary data", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const DEPARTMENTS = ['All Departments', ...new Set(employees.map(e => e.department || e.dept))];
  const STATUSES = ['All Status', ...new Set(employees.map(e => e.status))];

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const empName = emp.employeeName || emp.name || '';
      const empCode = emp.employeeId || emp.id || '';

      const matchesSearch =
        empName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        empCode.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesDept = departmentFilter === 'All Departments' || (emp.department || emp.dept) === departmentFilter;
      const matchesStatus = statusFilter === 'All Status' || emp.status === statusFilter;

      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [searchTerm, departmentFilter, statusFilter, employees]);

  const filteredBulkEmployees = useMemo(() => {
    return employees.filter(emp => {
      const empName = emp.employeeName || emp.name || '';
      const empCode = emp.employeeId || emp.id || '';

      const matchesSearch =
        empName.toLowerCase().includes(bulkSearchTerm.toLowerCase()) ||
        empCode.toLowerCase().includes(bulkSearchTerm.toLowerCase());
      return matchesSearch && emp.status !== 'Paid';
    });
  }, [bulkSearchTerm, employees]);

  const toggleSelect = (id) => {
    if (selectedEmployees.includes(id)) {
      setSelectedEmployees(selectedEmployees.filter(e => e !== id));
    } else {
      setSelectedEmployees([...selectedEmployees, id]);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = filteredBulkEmployees.map(emp => emp.id);
      setSelectedEmployees(allIds);
    } else {
      setSelectedEmployees([]);
    }
  };

  const handleAddPaymentRecord = async (newRecord) => {
    try {
      const savedRecord = await salaryPaymentApi.createPaymentRecord(newRecord);
      setEmployees([savedRecord, ...employees]);
    } catch (error) {
      console.error("Error creating record", error);
    }
  };

  const handleOpenPayModal = (employee) => {
    setSelectedPaymentEmployee(employee);
    setIsPayModalOpen(true);
  };

  const handleConfirmPayment = async (employee, method, date) => {
    try {
      await salaryPaymentApi.processPayment({
        recordId: employee.id,
        employeeId: employee.employeeId,
        amount: parseCurrency(employee.netPayable || employee.net),
        paymentMethod: method,
        date: date
      });

      setEmployees(employees.map(emp =>
        emp.id === employee.id ? { ...emp, status: 'Paid' } : emp
      ));

      const newTx = {
        name: employee.employeeName || employee.name,
        month: 'October 2025',
        net: employee.netPayable || employee.net,
        modes: [{ type: method, val: parseCurrency(employee.netPayable || employee.net) }],
        date: formatDisplayDate(date),
        status: 'Paid'
      };
      setTransactions([newTx, ...transactions]);

    } catch (error) {
      console.error("Payment failed", error);
    }
  };

  const handleConfirmBulkPayment = async (method, date) => {
    try {
      const selectedRecordIds = selectedEmployees.map(String);
      const recordsToPay = employees.filter(e => selectedRecordIds.includes(String(e.id)));
      const employeeIdsToPay = recordsToPay.map(e => e.employeeId);

      await salaryPaymentApi.processBulkPayment({
        employeeIds: employeeIdsToPay,
        paymentMethod: method,
        date: date
      });

      setEmployees(employees.map(emp =>
        selectedRecordIds.includes(String(emp.id)) ? { ...emp, status: 'Paid' } : emp
      ));

      const newTxs = recordsToPay.map(emp => ({
        name: emp.employeeName || emp.name,
        month: 'October 2025',
        net: emp.netPayable || emp.net,
        modes: [{ type: method, val: parseCurrency(emp.netPayable || emp.net) }],
        date: formatDisplayDate(date),
        status: 'Paid'
      }));

      setTransactions([...newTxs, ...transactions]);
      setSelectedEmployees([]);
      setIsBulkPayModalOpen(false);

    } catch (error) {
      console.error("Bulk payment failed", error);
    }
  };

  const getBulkTotalAmount = () => {
    return selectedEmployees.reduce((sum, id) => {
      const emp = employees.find(e => e.id === id);
      return sum + (emp ? parseCurrency(emp.netPayable || emp.net) : 0);
    }, 0);
  };

  return (
    <div className="flex min-h-screen bg-[#F7F7FA] font-sans relative w-full overflow-x-hidden">

      <main className="flex-1 flex flex-col w-full">
        <div className="p-4 md:p-6 space-y-6">

          {/* Header */}
          <div className="flex flex-row justify-between items-end mb-2">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-slate-500">Payroll & Finance &rarr; Salary Payments</div>
              <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><DollarSign className="text-[#F5C742]" size={28} /> Salary Payments</h1>
              <p className="text-sm text-slate-500">October 2025 - Process individual and bulk salary payments</p>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded-lg font-bold shadow-sm transition-colors text-sm"
            >
              <Plus className="w-4 h-4" /> New Payment
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="sm:hidden flex items-center justify-center p-2.5 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Stats Cards - UPDATED HERE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <StatCard
              label="Total Employees"
              value={staffList.length}
              subValue="Active staff members"
              icon={Users}
              color="bg-slate-100 text-slate-600"
            />
            <StatCard
              label="Total Payable"
              value={<CurrencyAmount value={employees.reduce((acc, curr) => acc + parseCurrency(curr.net || curr.netPayable), 0)} />}
              subValue="This month"
              icon={DollarSign}
              color="bg-emerald-50 text-emerald-600"
            />
            <StatCard
              label="Pending Payments"
              value={employees.filter(e => e.status !== 'Paid').length}
              subValue="To process"
              icon={Clock}
              color="bg-red-50 text-red-600"
            />
            <StatCard
              label="Paid This Month"
              value={employees.filter(e => e.status === 'Paid').length}
              subValue="Successfully processed"
              icon={CheckCircle2}
              color="bg-emerald-50 text-emerald-600"
            />
          </div>

          {/* ... Rest of the components (Tabs, Content) remain the same ... */}
          <div className="bg-slate-100 p-1 rounded-xl flex flex-col sm:flex-row gap-1 max-w-4xl mx-auto lg:mx-0 lg:max-w-none">
            <TabButton
              active={activeTab === 'individual'}
              onClick={() => setActiveTab('individual')}
              icon={CreditCard}
              label="Individual Payment"
            />
            <TabButton
              active={activeTab === 'bulk'}
              onClick={() => setActiveTab('bulk')}
              icon={Users}
              label="Bulk Payment"
            />
            <TabButton
              active={activeTab === 'summary'}
              onClick={() => setActiveTab('summary')}
              icon={BarChart3}
              label="Payment Summary"
            />
          </div>

          {/* --- TAB CONTENT: INDIVIDUAL PAYMENT --- */}
          {activeTab === 'individual' && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
                <div className="relative w-full lg:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name or employee ID..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                  <FilterDropdown
                    options={DEPARTMENTS}
                    value={departmentFilter}
                    onChange={setDepartmentFilter}
                    minWidth="min-w-full sm:min-w-[160px]"
                  />
                  <FilterDropdown
                    options={STATUSES}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    minWidth="min-w-full sm:min-w-[140px]"
                  />
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 md:p-6 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-800">Select Employee for Payment</h2>
                  <p className="text-sm text-slate-500">Click "Pay" to process individual salary payment</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[#F7F7FA] text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Employee</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Department / Designation</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Base Salary</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Allowances</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Deductions</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Net Payable</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Status</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEmployees.length > 0 ? (
                        filteredEmployees.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-900">{emp.employeeName || emp.name}</div>
                              <div className="text-xs text-slate-500">{emp.employeeId || emp.id}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-slate-900">{emp.department || emp.dept}</div>
                              <div className="text-xs text-slate-500">{emp.designation || emp.role}</div>
                            </td>
                            <td className="px-6 py-4 text-slate-900"><CurrencyAmount value={parseCurrency(emp.baseSalary || emp.base)} /></td>
                            <td className="px-6 py-4 text-green-600"><CurrencyAmount value={parseCurrency(emp.allowances || emp.allow)} /></td>
                            <td className="px-6 py-4 text-red-600"><CurrencyAmount value={parseCurrency(emp.deductions || emp.deduct)} /></td>
                            <td className="px-6 py-4 font-bold text-slate-900">
                              <CurrencyAmount value={parseCurrency(emp.netPayable || emp.net)} />
                            </td>
                            <td className="px-6 py-4"><StatusBadge status={emp.status} /></td>
                            <td className="px-6 py-4 text-right">
                              {emp.status !== 'Paid' ? (
                                <button
                                  onClick={() => handleOpenPayModal(emp)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F5C742] hover:bg-[#E5B732] text-slate-900 text-xs font-bold rounded-md transition-colors shadow-sm"
                                >
                                  <Send className="w-3.5 h-3.5" /> Pay
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Paid</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="8" className="px-6 py-12 text-center text-slate-400">
                            {isLoading ? "Loading..." : "No employees found matching your filters."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- TAB CONTENT: BULK PAYMENT --- */}
          {activeTab === 'bulk' && (
            <div className="animate-in fade-in duration-300 space-y-6">
              <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
                <div className="relative w-full lg:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search employees..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C742]/50 placeholder:text-slate-400"
                    value={bulkSearchTerm}
                    onChange={(e) => setBulkSearchTerm(e.target.value)}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-sm text-slate-500 pointer-events-none hidden sm:flex">
                    <span>All Departments</span>
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                  <button
                    onClick={() => {
                      if (selectedEmployees.length > 0) {
                        setIsBulkPayModalOpen(true);
                      }
                    }}
                    disabled={selectedEmployees.length === 0}
                    className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold shadow-sm transition-all ${selectedEmployees.length > 0
                        ? 'bg-[#F5C742] text-slate-900 hover:bg-[#E5B732]'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                  >
                    <Send className="w-4 h-4" /> Process Payment ({selectedEmployees.length})
                  </button>
                  <button className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
                    <Download className="w-4 h-4" /> Export
                  </button>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 md:p-6 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-800">Select Employees for Bulk Payment</h2>
                  <p className="text-sm text-slate-500">Select multiple employees to process payments in batch</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[#F7F7FA] text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 w-12 font-semibold text-xs uppercase">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-[#F5C742] focus:ring-[#F5C742]"
                            checked={filteredBulkEmployees.length > 0 && selectedEmployees.length === filteredBulkEmployees.length}
                            onChange={handleSelectAll}
                          />
                        </th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Employee</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Department</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase text-right">Net Payable</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredBulkEmployees.length > 0 ? (
                        filteredBulkEmployees.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <input
                                type="checkbox"
                                checked={selectedEmployees.includes(emp.id)}
                                onChange={() => toggleSelect(emp.id)}
                                className="rounded border-slate-300 text-[#F5C742] focus:ring-[#F5C742]"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-900">{emp.employeeName || emp.name}</div>
                              <div className="text-xs text-slate-500">{emp.employeeId || emp.id}</div>
                            </td>
                            <td className="px-6 py-4 text-slate-600">{emp.department || emp.dept}</td>
                            <td className="px-6 py-4 text-right font-bold text-slate-900">
                              <CurrencyAmount value={parseCurrency(emp.netPayable || emp.net)} />
                            </td>
                            <td className="px-6 py-4 flex justify-end"><StatusBadge status={emp.status} /></td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                            {isLoading ? "Loading..." : "No pending payments found matching your search."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- TAB CONTENT: PAYMENT SUMMARY --- */}
          {activeTab === 'summary' && (
            <div className="animate-in fade-in duration-300 space-y-6">
              {/* ... (Summary Tab content remains same as before) ... */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col h-full">
                  <h3 className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
                    <PieChartIcon className="w-5 h-5 text-[#F5C742]" />
                    Payment Mode Distribution
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">Breakdown by payment method</p>

                  <div className="h-[250px] relative flex-1 w-full">
                    {paymentStats.chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={paymentStats.chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                          >
                            {paymentStats.chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400 text-sm">
                        No payment data available
                      </div>
                    )}
                    <div className="hidden sm:block absolute top-1/2 left-[5%] xl:left-[15%] -translate-y-1/2 text-xs md:text-sm text-[#F5C742] font-medium pointer-events-none">
                      Bank Transfer: <CurrencyAmount value={paymentStats.bankTotal} />
                    </div>
                    <div className="hidden sm:block absolute top-1/2 right-[5%] xl:right-[15%] -translate-y-1/2 text-xs md:text-sm text-red-500 font-medium pointer-events-none">
                      Cash: <CurrencyAmount value={paymentStats.cashTotal} />
                    </div>
                  </div>
                </div>

                {/* Statistics */}
                <div className="flex flex-col gap-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex-1 flex flex-col">
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
                      <BarChart3 className="w-5 h-5 text-[#F5C742]" />
                      Payment Statistics
                    </h3>
                    <p className="text-xs text-slate-500 mb-6">Current month overview</p>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-slate-50 rounded-lg p-4 md:p-6 border border-slate-100 text-center">
                        <div className="text-2xl md:text-3xl font-bold text-slate-800 mb-1">{paymentStats.totalCount}</div>
                        <div className="text-xs text-slate-500">Total Payments</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4 md:p-6 border border-slate-100 text-center">
                        <div className="text-2xl md:text-3xl font-bold text-slate-800 mb-1">
                          <CurrencyAmount value={paymentStats.totalAmount} />
                        </div>
                        <div className="text-xs text-slate-500">Amount Paid</div>
                      </div>
                    </div>

                    <h4 className="text-sm font-semibold text-slate-800 mb-3">Payment Mode Breakdown</h4>
                    <div className="space-y-3 flex-1">
                      <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <CreditCard className="w-4 h-4 text-slate-500" /> Bank Transfer
                        </div>
                        <CurrencyAmount value={paymentStats.bankTotal} className="font-bold text-slate-900 text-sm" />
                      </div>
                      <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <Wallet className="w-4 h-4 text-slate-500" /> Cash
                        </div>
                        <CurrencyAmount value={paymentStats.cashTotal} className="font-bold text-slate-900 text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="font-semibold text-slate-900">Recent Payment Transactions</h2>
                    <p className="text-sm text-slate-500">Latest salary payments processed</p>
                  </div>
                  <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    <Download className="w-3.5 h-3.5" /> Export Report
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[#F7F7FA] text-slate-500 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Employee</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Month</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Net Salary</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Payment Mode(s)</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Date</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase">Status</th>
                        <th className="px-6 py-4 font-semibold text-xs uppercase text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions.map((tx, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-900">{tx.name}</td>
                          <td className="px-6 py-4 text-slate-500">{tx.month}</td>
                          <td className="px-6 py-4 font-bold text-slate-900">
                            <CurrencyAmount value={parseCurrency(tx.net || tx.netPayable)} />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              {tx.modes && tx.modes.length > 0 && tx.modes.map((m, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white text-[11px] text-slate-600">
                                  {m.type === 'Bank Transfer' ? <CreditCard className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
                                  {m.type}: {typeof m.val === 'number' ? m.val.toLocaleString() : m.val}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-500">{tx.date}</td>
                          <td className="px-6 py-4"><StatusBadge status={tx.status} /></td>
                          <td className="px-6 py-4 text-center">
                            <button className="p-1.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-500 transition-colors">
                              <FileText className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>
      </main>

      {/* --- RENDER MODALS --- */}
      <AddPaymentModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddPaymentRecord}
        staffList={staffList}
      />
      <ProcessPaymentModal
        isOpen={isPayModalOpen}
        onClose={() => setIsPayModalOpen(false)}
        employee={selectedPaymentEmployee}
        onConfirm={handleConfirmPayment}
      />
      <BulkPaymentModal
        isOpen={isBulkPayModalOpen}
        onClose={() => setIsBulkPayModalOpen(false)}
        count={selectedEmployees.length}
        totalAmount={getBulkTotalAmount()}
        onConfirm={handleConfirmBulkPayment}
      />

    </div>
  );
};

// Helper Icon for Pie Chart Title
const PieChartIcon = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);

export default SalaryPayments;
