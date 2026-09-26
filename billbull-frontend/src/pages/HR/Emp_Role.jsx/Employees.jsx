import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  Upload,
  Plus,
  ChevronDown,
  Users,
  User,
  Activity,
  DollarSign,
  Target,
  Store,
  Warehouse,
  BarChart3,
  Clock,
  ShieldCheck,
  X,
  Camera,
  CheckCircle2,
  Briefcase,
  FileText,
  Box,
  ClipboardList,
  Eye,
  Trash2,
  AlertCircle,
  Save,
  Lock,
  Image as ImageIcon,
  File,
  XCircle,
  Check,
  Loader2,
  X as XIcon,
  Edit,
  UserX,
  UserCheck,
  LayoutList,
  LayoutGrid,
  Star,
  Building2,
  MoreVertical,
  ScanBarcode as BarcodeIcon,
  Info,
  Mail,
  Phone
} from 'lucide-react';
import CurrencyAmount from '../../../components/CurrencyAmount';
import EmployeeBarcodeCard from './EmployeeBarcodeCard';
import { isSalespersonRole } from '../../../utils/salespersonRoles';

// Import the API helpers
import { employeesApi } from '../../../api/employeesApi';
import PaginationFooter from '../../../components/common/PaginationFooter';
import { usersApi } from '../../../api/usersApi';
import { hasRole } from '../../../api/auth';
import { usePermissions } from '../../../context/PermissionContext';
import { useBranch } from '../../../context/BranchContext';
import PerformanceTargets from './PerformanceTargets';
import SetTargetsModal from './SetTargetsModal';
import useEmployeePerformance, { monthKey, monthLabel } from './useEmployeePerformance';

import { getImageUrl } from '../../../utils/urlUtils';
import { formatDisplayDate as formatDateForDisplay } from '../../../utils/dateUtils';
import TableSkeleton from '../../../components/common/TableSkeleton';
import { toast } from 'react-hot-toast';
import { getWarehouses } from '../../../api/warehouseApi';
import { validatePassword } from '../../../utils/passwordValidation';

// ==========================================
// 0. CONSTANTS & UTILS
// ==========================================

const STAT_COLORS = {
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
  primary: 'bg-[#F5C742]/20 text-yellow-700', // Adjusted to match theme
  purple: 'bg-purple-50 text-purple-600'
};

const EMPTY_DATA_LABEL = '--';

const normalizeOptionLabel = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const buildUniqueOptions = (...collections) => {
  const seen = new Set();

  return collections
    .flat(Infinity)
    .reduce((options, value) => {
      const normalized = normalizeOptionLabel(value);
      if (!normalized) {
        return options;
      }

      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return options;
      }

      seen.add(key);
      options.push(normalized);
      return options;
    }, []);
};

const findBranchByName = (branches, branchName) => {
  const normalizedBranchName = normalizeOptionLabel(branchName).toLowerCase();
  if (!normalizedBranchName) {
    return null;
  }

  return branches.find((branch) => (
    normalizeOptionLabel(branch?.name).toLowerCase() === normalizedBranchName
  )) || null;
};

const formatDisplayDate = (value) => {
  if (!value) {
    return EMPTY_DATA_LABEL;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return formatDateForDisplay(date);
};

const hasFilledValue = (value) => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (typeof value === 'number') {
    return !Number.isNaN(value);
  }

  return Boolean(value);
};

// Required fields per wizard section — this is the same set the form marks with
// a "*". The Review & Confirm tab derives section status from these, so a section
// is "Completed" only when its mandatory fields actually hold a value; clicking
// Next through a blank section no longer marks it done.
//
// Personal/Job cover the DB's NOT NULL columns (employee_code, first_name,
// last_name, phone, email) plus the job fields the business treats as mandatory.
// The remaining sections carry no mandatory fields and are always complete.
const SECTION_REQUIRED_FIELDS = {
  personal: [
    { name: 'employeeCode', label: 'Employee Code' },
    { name: 'firstName', label: 'First Name' },
    { name: 'lastName', label: 'Last Name' },
    { name: 'phone', label: 'Phone' },
    { name: 'email', label: 'Email' },
  ],
  job: [
    { name: 'role', label: 'Role / Designation' },
    { name: 'department', label: 'Department' },
    { name: 'branch', label: 'Branch (Default)' },
    { name: 'employmentType', label: 'Employment Type' },
    { name: 'joinDate', label: 'Join Date' },
    { name: 'status', label: 'Status' },
  ],
  access: [],      // conditional — validated by validateLoginAccess()
  payroll: [],
  attendance: [],
  docs: [],
  assets: [],
  notes: [],
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Date of Birth bounds. DOB is optional, but when supplied it has to be a real
// birth date: the browser's date input happily accepts 2050-03-24, and nothing
// downstream ever looked at it.
// The approval ladder. "Completed" is the terminal state, so there are
// WORKFLOW_STAGES.length - 1 approval clicks between submission and Active.
const WORKFLOW_STAGES = ["HR Review", "Manager Approval", "Accounts Approval", "Completed"];

/** "Approve (1 of 3)" so the button says how far along the ladder this click is. */
const approveButtonLabel = (stage) => {
  const index = WORKFLOW_STAGES.indexOf(stage);
  const total = WORKFLOW_STAGES.length - 1;
  return index >= 0 && index < total ? `Approve (${index + 1} of ${total})` : 'Approve';
};

const describeEmployee = (emp) =>
  `${emp?.firstName || ''} ${emp?.lastName || ''}`.trim() || 'Employee';

const MIN_EMPLOYEE_AGE = 18;
const MAX_EMPLOYEE_AGE = 100;

/** yyyy-mm-dd for `today` shifted back by `years`. */
const dateYearsAgo = (years) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().split('T')[0];
};

const DOB_MAX = () => dateYearsAgo(MIN_EMPLOYEE_AGE);
const DOB_MIN = () => dateYearsAgo(MAX_EMPLOYEE_AGE);

/** Returns an error message for an out-of-range Date of Birth, or '' when fine. */
const validateDateOfBirth = (value) => {
  if (!hasFilledValue(value)) return '';
  const dob = String(value).trim();
  if (Number.isNaN(new Date(dob).getTime())) {
    return 'Date of Birth is not a valid date';
  }
  const today = new Date().toISOString().split('T')[0];
  if (dob > today) {
    return 'Date of Birth cannot be in the future';
  }
  if (dob > DOB_MAX()) {
    return `Date of Birth must make the employee at least ${MIN_EMPLOYEE_AGE} years old`;
  }
  if (dob < DOB_MIN()) {
    return `Date of Birth cannot be more than ${MAX_EMPLOYEE_AGE} years ago`;
  }
  return '';
};

const buildInitialEmployeeForm = (defaultBranchName = '') => ({
  firstName: '',
  middleName: '',
  lastName: '',
  employeeCode: 'EMP' + Math.floor(Math.random() * 10000),
  gender: 'Male',
  dateOfBirth: '',
  phone: '',
  email: '',
  currentAddress: '',
  nationality: '',
  // Emergency contact
  emergencyContactName: '',
  emergencyContactRelation: '',
  emergencyContactPhone: '',
  // Job & org
  role: '',
  department: '',
  branch: defaultBranchName,
  reportingManager: '',
  workLocation: '',
  employmentType: 'Full Time',
  joinDate: new Date().toISOString().split('T')[0],
  probationPeriod: '3',
  confirmationDate: '',
  status: 'Active',
  // Access
  posAccess: true,
  posPin: '',
  permissionProfile: 'Role-based (Auto)',
  // Payroll
  salaryType: 'Monthly',
  basicSalary: '',
  // Attendance
  shiftType: '',
  workDays: 'Mon-Fri',
  weeklyOffDays: 2,
  leavePolicy: '',
  // Documents
  emiratesId: '',
  expiryDate: '',
  passportNumber: '',
  passportIssueDate: '',
  passportExpiryDate: '',
  visaType: '',
  visaNumber: '',
  visaExpiryDate: '',
  // Branch access (additional branches beyond default)
  additionalBranchIds: [],
  additionalWarehouseIds: [],
  // Notes & tags
  hrNotes: '',
  tags: '',
  // Login provisioning (UI-only, stripped before submit)
  createLoginAccess: false,
  loginUsername: '',
  temporaryPassword: '',
  systemRoleId: '',
});

const AutocompleteField = ({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select or type',
  disabled = false,
  noOptionsMessage = 'No suggestions available',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const normalizedOptions = useMemo(() => buildUniqueOptions(options), [options]);
  const normalizedValue = normalizeOptionLabel(value);
  const searchTerm = normalizedValue.toLowerCase();

  const filteredOptions = useMemo(() => {
    if (!searchTerm) {
      return normalizedOptions;
    }

    return normalizedOptions.filter((option) => option.toLowerCase().includes(searchTerm));
  }, [normalizedOptions, searchTerm]);

  const hasExactMatch = normalizedOptions.some((option) => option.toLowerCase() === searchTerm);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (nextValue) => {
    onChange(nextValue);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleInputChange = (event) => {
    onChange(event.target.value);
    if (!isOpen) {
      setIsOpen(true);
    }
  };

  const handleToggle = () => {
    if (disabled) {
      return;
    }

    setIsOpen((prev) => !prev);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      return;
    }

    if (event.key === 'ArrowDown' && !isOpen) {
      event.preventDefault();
      setIsOpen(true);
      return;
    }

    if (event.key === 'Enter' && normalizedValue && !hasExactMatch) {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className={`relative rounded-md transition-all ${isOpen ? 'ring-1 ring-[#F5C742]' : ''}`}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-md border px-3 py-2 pr-10 text-sm transition-colors focus:outline-none ${
            disabled
              ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
              : isOpen
                ? 'border-[#F5C742] bg-white text-slate-700'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus:border-[#F5C742]'
          }`}
        />
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleToggle}
          disabled={disabled}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition-colors hover:text-slate-600 disabled:cursor-not-allowed disabled:text-slate-300"
        >
          <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && !disabled && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {normalizedValue && !hasExactMatch && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleSelect(normalizedValue)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-yellow-50"
            >
              <span className="truncate">Use "{normalizedValue}"</span>
              <span className="ml-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">Custom</span>
            </button>
          )}

          {filteredOptions.length > 0 ? (
            <div className="max-h-56 overflow-y-auto py-1">
              {filteredOptions.map((option) => {
                const isSelected = option.toLowerCase() === searchTerm;

                return (
                  <button
                    key={option}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(option)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-yellow-50 font-medium text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{option}</span>
                    {isSelected && <Check size={14} className="ml-3 shrink-0 text-yellow-700" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-3 text-xs text-slate-500">
              {normalizedValue
                ? `No matches found. Press Enter to keep "${normalizedValue}".`
                : noOptionsMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 1. ADD / EDIT EMPLOYEE MODAL COMPONENT
// ==========================================

const AddEmployeeModal = ({
  isOpen,
  onClose,
  onWorkflowStart,
  employeeToEdit,
  managerOptions,
  roleOptions,
  departmentOptions,
}) => {
  const { branches, defaultBranchName, formatBranchLabel } = useBranch();
  const [activeTab, setActiveTab] = useState('personal');
  const isAdmin = hasRole('ADMIN');
  const isCreateMode = !employeeToEdit;
  const canProvisionLoginAccess = isAdmin && isCreateMode;

  // --- Media & File Refs ---
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null); // The actual file/blob to send
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  // The live MediaStream must be held here, not only on the <video> element:
  // closing the modal or switching wizard sections unmounts that element, and a
  // stream reachable only through it can never be stopped — which is what kept
  // the webcam locked system-wide after discarding the form.
  const cameraStreamRef = useRef(null);
  // Bumped on every start/stop so a getUserMedia promise that resolves after the
  // user has already cancelled can tell it has been superseded and stop itself.
  const cameraRequestRef = useRef(0);
  const canvasRef = useRef(null);
  const docInputRef = useRef(null);

  // --- Document State ---
  const [emiratesIdFile, setEmiratesIdFile] = useState(null);
  const [systemRoles, setSystemRoles] = useState([]);
  const [systemRolesLoading, setSystemRolesLoading] = useState(false);
  const [systemRolesError, setSystemRolesError] = useState('');
  const [formError, setFormError] = useState('');

  // --- Designation Roles (for Role/Designation dropdown) ---
  // GET /api/roles is ADMIN-only, so a non-admin HR user never receives the live role list and
  // falls back to this one. The two salesperson designations are therefore listed here as well as
  // seeded in RBACInitializer — omitting them would make the new roles invisible to exactly the
  // users who maintain employee records.
  const FALLBACK_ROLES = [
    'ADMIN', 'SALES', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'CASHIER',
    'DELIVERY_PERSON', 'SALESPERSON', 'CASHIER_SALESPERSON',
  ];
  // Raw RBAC role name -> the human-readable designation stored in employees.role. Kept in step
  // with the backend's hr.employees.SalespersonEligibility, which accepts BOTH the designation
  // and the raw key so an employee saved by an older client still resolves.
  const EMPLOYEE_ROLE_LABELS = {
    DELIVERY_PERSON: 'Delivery Person',
    SALESPERSON: 'Salesperson',
    CASHIER_SALESPERSON: 'Cashier + Salesperson',
  };
  const employeeRoleOptionValue = (roleName = '') => EMPLOYEE_ROLE_LABELS[roleName] || roleName;
  const employeeRoleOptionLabel = (roleName = '') => EMPLOYEE_ROLE_LABELS[roleName] || roleName;
  const [designationRoles, setDesignationRoles] = useState([]);
  const [designationRolesLoading, setDesignationRolesLoading] = useState(false);


  // --- Form Data State (Captures all inputs) ---
  const [formData, setFormData] = useState(buildInitialEmployeeForm);
  const [warehousesList, setWarehousesList] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    getWarehouses().then(res => {
      if (!cancelled) {
        setWarehousesList(res.data || res.content || res || []);
      }
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [isOpen]);

  const branchOptions = useMemo(() => (
    buildUniqueOptions(
      branches.map((branch) => branch?.name),
      defaultBranchName,
      employeeToEdit?.branch,
      formData.branch,
    )
  ), [branches, defaultBranchName, employeeToEdit, formData.branch]);

  const resolvedRoleOptions = useMemo(() => (
    buildUniqueOptions(roleOptions, formData.role)
  ), [roleOptions, formData.role]);


  const currentEmployeeName = useMemo(() => (
    [employeeToEdit?.firstName, employeeToEdit?.lastName]
      .map(normalizeOptionLabel)
      .filter(Boolean)
      .join(' ')
  ), [employeeToEdit]);

  const resolvedManagerOptions = useMemo(() => (
    buildUniqueOptions(
      managerOptions.filter((name) => (
        normalizeOptionLabel(name).toLowerCase() !== currentEmployeeName.toLowerCase()
      )),
      formData.reportingManager,
    )
  ), [managerOptions, currentEmployeeName, formData.reportingManager]);

  const selectedBranch = useMemo(() => (
    findBranchByName(branches, formData.branch) || (formData.branch ? { name: formData.branch } : null)
  ), [branches, formData.branch]);

  const checklist = useMemo(() => {
    const personalInfoCompleted = [
      formData.firstName,
      formData.lastName,
      formData.phone,
      formData.email,
    ].every(hasFilledValue);

    const roleAssigned = [
      formData.role,
      formData.department,
      formData.branch,
      formData.employmentType,
      formData.joinDate,
    ].every(hasFilledValue);

    const permissionsSet = hasFilledValue(formData.permissionProfile) && (
      !formData.createLoginAccess || (
        hasFilledValue(formData.loginUsername) &&
        hasFilledValue(formData.temporaryPassword) &&
        validatePassword(formData.temporaryPassword).isValid &&
        hasFilledValue(formData.systemRoleId)
      )
    );

    const payrollDetailsAdded = hasFilledValue(formData.salaryType) && hasFilledValue(formData.basicSalary);

    const mandatoryDocsUploaded = (
      hasFilledValue(formData.emiratesId) &&
      hasFilledValue(formData.expiryDate)
    );

    return [
      { id: 1, label: 'Personal info completed', checked: personalInfoCompleted },
      { id: 2, label: 'Role assigned', checked: roleAssigned },
      { id: 3, label: 'Permissions set', checked: permissionsSet },
      { id: 4, label: 'Payroll details added', checked: payrollDetailsAdded },
      { id: 5, label: 'Mandatory docs uploaded', checked: mandatoryDocsUploaded },
    ];
  }, [emiratesIdFile, formData]);

  useEffect(() => {
    if (!isOpen) return;

    setActiveTab('personal');
    setAvatarFile(null);
    setIsCameraOpen(false);
    setCameraError('');
    setEmiratesIdFile(null);
    setFormError('');
    setSystemRolesError('');

    if (employeeToEdit) {
      setFormData({
        ...buildInitialEmployeeForm(defaultBranchName),
        firstName: employeeToEdit.firstName || "",
        middleName: employeeToEdit.middleName || "",
        lastName: employeeToEdit.lastName || "",
        employeeCode: employeeToEdit.employeeCode || "",
        gender: employeeToEdit.gender || "Male",
        dateOfBirth: employeeToEdit.dateOfBirth || "",
        phone: employeeToEdit.phone || "",
        email: employeeToEdit.email || "",
        currentAddress: employeeToEdit.currentAddress || "",
        nationality: employeeToEdit.nationality || "",
        emergencyContactName: employeeToEdit.emergencyContactName || "",
        emergencyContactRelation: employeeToEdit.emergencyContactRelation || "",
        emergencyContactPhone: employeeToEdit.emergencyContactPhone || "",
        role: employeeToEdit.role || "",
        department: employeeToEdit.department || "",
        branch: employeeToEdit.branch || "",
        reportingManager: employeeToEdit.reportingManager || "",
        workLocation: employeeToEdit.workLocation || "",
        employmentType: employeeToEdit.employmentType || "Full Time",
        joinDate: employeeToEdit.joinDate || "",
        probationPeriod: employeeToEdit.probationPeriod || "",
        confirmationDate: employeeToEdit.confirmationDate || "",
        salaryType: employeeToEdit.salaryType || "Monthly",
        basicSalary: employeeToEdit.basicSalary || "",
        posAccess: employeeToEdit.posAccess ?? true,
        posPin: employeeToEdit.posPin || "",
        permissionProfile: employeeToEdit.permissionProfile || "",
        shiftType: employeeToEdit.shiftType || "",
        workDays: employeeToEdit.workDays || "Mon-Fri",
        weeklyOffDays: employeeToEdit.weeklyOffDays ?? 2,
        leavePolicy: employeeToEdit.leavePolicy || "",
        emiratesId: employeeToEdit.emiratesId || "",
        expiryDate: employeeToEdit.emiratesIdExpiry || "",
        passportNumber: employeeToEdit.passportNumber || "",
        passportIssueDate: employeeToEdit.passportIssueDate || "",
        passportExpiryDate: employeeToEdit.passportExpiryDate || "",
        visaType: employeeToEdit.visaType || "",
        visaNumber: employeeToEdit.visaNumber || "",
        visaExpiryDate: employeeToEdit.visaExpiryDate || "",
        hrNotes: employeeToEdit.hrNotes || "",
        tags: employeeToEdit.tags || "",
        additionalBranchIds: employeeToEdit.additionalBranchIds
          ? (typeof employeeToEdit.additionalBranchIds === 'string'
              ? employeeToEdit.additionalBranchIds.split(',').map(Number).filter(Boolean)
              : employeeToEdit.additionalBranchIds)
          : [],
        additionalWarehouseIds: employeeToEdit.additionalWarehouseIds
          ? (typeof employeeToEdit.additionalWarehouseIds === 'string'
              ? employeeToEdit.additionalWarehouseIds.split(',').map(Number).filter(Boolean)
              : employeeToEdit.additionalWarehouseIds)
          : []
      });

      if (employeeToEdit.avatarUrl) {
        setAvatarPreview(getImageUrl(employeeToEdit.avatarUrl));
      } else {
        setAvatarPreview(null);
      }
      return;
    }

    // Restore draft for new employee creation
    const draft = (() => {
      try { return JSON.parse(localStorage.getItem('employee_form_draft')); } catch { return null; }
    })();
    if (draft) {
      const restore = window.confirm("A saved draft was found. Restore it?");
      if (restore) {
        setFormData({ ...buildInitialEmployeeForm(defaultBranchName), ...draft.formData });
        setActiveTab(draft.activeTab || 'personal');
        setAvatarPreview(null);
        localStorage.removeItem('employee_form_draft');
        return;
      }
      localStorage.removeItem('employee_form_draft');
    }
    setFormData(buildInitialEmployeeForm(defaultBranchName));
    setAvatarPreview(null);
  }, [isOpen, employeeToEdit]);

  useEffect(() => {
    if (!isOpen || employeeToEdit || formData.branch || !defaultBranchName) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      branch: defaultBranchName,
    }));
  }, [defaultBranchName, employeeToEdit, formData.branch, isOpen]);

  // Fetch designation roles from the /api/roles table whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setDesignationRolesLoading(true);

    usersApi.getAllRoles()
      .then((roles) => {
        if (!cancelled) {
          setDesignationRoles(roles || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDesignationRoles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setDesignationRolesLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen]);


  useEffect(() => {
    if (!isOpen || !canProvisionLoginAccess) {
      setSystemRoles([]);
      setSystemRolesLoading(false);
      setSystemRolesError('');
      return;
    }

    let cancelled = false;

    const loadSystemRoles = async () => {
      setSystemRolesLoading(true);
      setSystemRolesError('');

      try {
        const roles = await usersApi.getAllRoles();
        if (!cancelled) {
          setSystemRoles(roles);
        }
      } catch (e) {
        if (!cancelled) {
          setSystemRoles([]);
          setSystemRolesError(
            e.response?.data?.message || e.message || 'Failed to load system roles'
          );
        }
      } finally {
        if (!cancelled) {
          setSystemRolesLoading(false);
        }
      }
    };

    loadSystemRoles();

    return () => {
      cancelled = true;
    };
  }, [isOpen, canProvisionLoginAccess]);

  // --- Computed Values ---
  const completedChecklistCount = useMemo(() => (
    checklist.filter((item) => item.checked).length
  ), [checklist]);

  const checklistProgress = useMemo(() => {
    return checklist.length > 0 ? (completedChecklistCount / checklist.length) * 100 : 0;
  }, [checklist.length, completedChecklistCount]);

  // --- Navigation Data ---
  const navItems = [
    { id: 'personal', label: 'Personal Information', icon: User },
    { id: 'job', label: 'Job & Organization', icon: Briefcase },
    { id: 'access', label: 'Access & Permissions', icon: ShieldCheck },
    { id: 'payroll', label: 'Payroll & Benefits', icon: DollarSign },
    { id: 'attendance', label: 'Attendance & Leave', icon: Clock },
    { id: 'docs', label: 'Documents & Compliance', icon: FileText },
    { id: 'assets', label: 'Assets & Loans', icon: Box },
    { id: 'notes', label: 'Notes & History', icon: ClipboardList },
    { id: 'review', label: 'Review & Confirm', icon: Eye },
  ];

  const steps = [
    { id: 'draft', label: 'Draft', status: 'current' },
    { id: 'hr', label: 'HR Review', status: 'upcoming' },
    { id: 'manager', label: 'Manager Approval', status: 'upcoming' },
    { id: 'accounts', label: 'Accounts Approval', status: 'upcoming' },
    { id: 'active', label: 'Active', status: 'upcoming' },
  ];

  // --- Handlers ---

  const updateFormField = (name, value) => {
    setFormError('');
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: value
      };

      if (name === 'createLoginAccess' && !value) {
        next.loginUsername = '';
        next.temporaryPassword = '';
        next.systemRoleId = '';
      }

      return next;
    });
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    updateFormField(name, type === 'checkbox' ? checked : value);
  };

  const handleNext = () => {
    const currentIndex = navItems.findIndex(item => item.id === activeTab);
    if (currentIndex < navItems.length - 1) {
      setActiveTab(navItems[currentIndex + 1].id);
    }
  };

  const handleBack = () => {
    const currentIndex = navItems.findIndex(item => item.id === activeTab);
    if (currentIndex > 0) {
      setActiveTab(navItems[currentIndex - 1].id);
    } else {
      onClose();
    }
  };

  const DRAFT_KEY = 'employee_form_draft';

  const handleSaveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ formData, activeTab }));
      alert("Draft saved. Your progress will be restored when you reopen this form.");
    } catch {
      alert("Could not save draft to local storage.");
    }
    onClose();
  };

  const validateLoginAccess = () => {
    if (!canProvisionLoginAccess || !formData.createLoginAccess) {
      return '';
    }

    if (systemRolesLoading) {
      return 'System roles are still loading. Please wait a moment.';
    }
    if (systemRolesError) {
      return systemRolesError;
    }
    if (!formData.loginUsername.trim()) {
      return 'Login username or email is required to create system access.';
    }
    if (!formData.temporaryPassword) {
      return 'Temporary password is required to create system access.';
    }
    const pwdValidation = validatePassword(formData.temporaryPassword);
    if (!pwdValidation.isValid) {
      return pwdValidation.errors.join(' ');
    }
    if (!formData.systemRoleId) {
      return 'System role is required to create system access.';
    }

    return '';
  };

  const dateOfBirthError = validateDateOfBirth(formData.dateOfBirth);

  // Per-section list of what is still missing. Drives the sidebar ticks, the
  // Review & Confirm status cards and the submit guard, so all three agree.
  const sectionIssues = (() => {
    const issues = {};
    Object.entries(SECTION_REQUIRED_FIELDS).forEach(([sectionId, fields]) => {
      issues[sectionId] = fields
        .filter((field) => !hasFilledValue(formData[field.name]))
        .map((field) => field.label);
    });

    // A malformed email reaches the DB as a valid string, so catch it here where
    // we can still name the field.
    if (hasFilledValue(formData.email) && !EMAIL_PATTERN.test(String(formData.email).trim())) {
      issues.personal = [...issues.personal, 'Email (not a valid email address)'];
    }

    if (dateOfBirthError) {
      issues.personal = [...issues.personal, dateOfBirthError];
    }

    const accessError = validateLoginAccess();
    if (accessError) {
      issues.access = [...issues.access, accessError];
    }

    return issues;
  })();

  const isSectionComplete = (sectionId) => (sectionIssues[sectionId] || []).length === 0;

  const incompleteSections = navItems.slice(0, 8).filter((item) => !isSectionComplete(item.id));

  const handleFormSubmit = async () => {
    if (incompleteSections.length > 0) {
      const first = incompleteSections[0];
      setFormError(
        `Cannot submit yet — ${incompleteSections
          .map((section) => `${section.label}: ${sectionIssues[section.id].join(', ')}`)
          .join('; ')}.`
      );
      setActiveTab(first.id);
      return;
    }

    const accessError = validateLoginAccess();
    if (accessError) {
      setFormError(accessError);
      setActiveTab('access');
      return;
    }

    const {
      expiryDate,
      createLoginAccess,
      loginUsername,
      temporaryPassword,
      systemRoleId,
      additionalBranchIds,
      additionalWarehouseIds,
      ...employeeFields
    } = formData;

    const submissionData = {
      ...employeeFields,
      emiratesIdExpiry: expiryDate || null,
      tags: formData.tags || null,
      additionalBranchIds: additionalBranchIds.length > 0 ? additionalBranchIds.join(',') : null,
      additionalWarehouseIds: additionalWarehouseIds.length > 0 ? additionalWarehouseIds.join(',') : null,
    };

    if (employeeToEdit) {
      submissionData.id = employeeToEdit.id;
    }

    if (canProvisionLoginAccess && createLoginAccess) {
      submissionData.loginAccess = {
        createAccess: true,
        loginUsername: loginUsername.trim(),
        temporaryPassword,
        roleId: Number(systemRoleId),
      };
    }

    const result = await onWorkflowStart(submissionData, avatarFile, !!employeeToEdit);
    if (result?.ok) {
      localStorage.removeItem('employee_form_draft');
      onClose();
      return;
    }
    setFormError(result?.message || 'Error saving employee.');
  };

  // --- Avatar Logic ---
  const handleAvatarFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("File size must be under 2MB");
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/jpg', 'image/svg+xml'].includes(file.type)) {
      alert("Only PNG, JPG, and SVG files are allowed");
      return;
    }

    setAvatarFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  /**
   * Single point that hands the camera back to the OS. Safe to call repeatedly
   * and when no camera is running.
   */
  const stopCameraTracks = () => {
    cameraRequestRef.current += 1;
    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  /** Track release plus closing the preview — for user-initiated exits. */
  const releaseCamera = () => {
    stopCameraTracks();
    setIsCameraOpen(false);
  };

  const startCamera = async () => {
    releaseCamera();               // never leave a previous stream running
    const requestId = cameraRequestRef.current;
    setIsCameraOpen(true);
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Cancelled / closed / restarted while the permission prompt was open —
      // this stream is already orphaned, so stop it rather than leak it.
      if (cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera Error:", err);
      setCameraError("Could not access camera. Please ensure permissions are granted.");
      setIsCameraOpen(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);

      const dataUrl = canvasRef.current.toDataURL('image/jpeg');
      setAvatarPreview(dataUrl);

      canvasRef.current.toBlob((blob) => {
        setAvatarFile(blob);
      }, 'image/jpeg');

      releaseCamera();
    }
  };

  const stopCamera = releaseCamera;

  // Hand the camera back whenever the preview can no longer be on screen: the
  // modal was closed or discarded, the user moved to another wizard section, or
  // the component unmounted. Previously the Cancel button was the only release
  // path, so every other exit left the webcam held open. Stopping the tracks is
  // enough here — isCameraOpen is reset when the modal next opens.
  useEffect(() => {
    if (isOpen && activeTab === 'personal') return undefined;
    stopCameraTracks();
    return undefined;
  }, [isOpen, activeTab]);

  useEffect(() => () => stopCameraTracks(), []);

  // --- Document Logic ---
  const handleDocUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert("Only PDF files are allowed");
      return;
    }
    setEmiratesIdFile(file);
  };

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activeTab) {
      case 'personal':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Identity Section */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Identity</h3>
              <div className="flex flex-col md:flex-row gap-8">

                {/* Avatar Area */}
                <div className="flex flex-col items-center gap-3">
                  <div className="relative group">
                    {isCameraOpen ? (
                      <div className="w-32 h-32 rounded-full overflow-hidden bg-black relative border-2 border-[#F5C742]">
                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
                        <canvas ref={canvasRef} className="hidden"></canvas>
                      </div>
                    ) : (
                      <div
                        className="w-32 h-32 rounded-full bg-slate-50 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 overflow-hidden relative"
                        style={{ backgroundImage: avatarPreview ? `url(${avatarPreview})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}
                      >
                        {!avatarPreview && <Camera size={32} />}
                        {avatarPreview && (
                          <button
                            onClick={() => { setAvatarPreview(null); setAvatarFile(null); }}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                          >
                            <XCircle size={24} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Camera Controls */}
                  {isCameraOpen ? (
                    <div className="flex gap-2">
                      <button onClick={capturePhoto} className="px-3 py-1 bg-red-500 text-white text-xs rounded-full hover:bg-red-600">Capture</button>
                      <button onClick={stopCamera} className="px-3 py-1 bg-slate-200 text-slate-700 text-xs rounded-full hover:bg-slate-300">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 w-full">
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/png, image/jpeg, image/jpg, image/svg+xml"
                        onChange={handleAvatarFile}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-medium text-slate-600 border border-slate-200 px-3 py-1.5 rounded hover:bg-slate-50 flex items-center justify-center gap-1 w-32"
                      >
                        <Upload size={12} /> Upload Image
                      </button>
                      <button
                        onClick={startCamera}
                        className="text-xs font-medium text-slate-600 border border-slate-200 px-3 py-1.5 rounded hover:bg-slate-50 flex items-center justify-center gap-1 w-32"
                      >
                        <Camera size={12} /> Take Photo
                      </button>
                      <p className="text-[10px] text-slate-400 text-center">Max 2MB (PNG, JPG)</p>
                    </div>
                  )}
                  {cameraError && <p className="text-[10px] text-red-500 max-w-[150px] text-center">{cameraError}</p>}
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Employee Code *</label>
                    <div className="flex">
                      <input type="text" name="employeeCode" value={formData.employeeCode} className="flex-1 text-sm border border-slate-200 rounded-l-md px-3 py-2 bg-slate-50 text-slate-500" readOnly />
                      <button className="px-3 py-2 bg-slate-100 border border-l-0 border-slate-200 rounded-r-md text-xs font-medium text-slate-600 hover:bg-slate-200">Auto</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">First Name *</label>
                    <input name="firstName" value={formData.firstName} onChange={handleInputChange} type="text" placeholder="Enter first name" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Middle Name</label>
                    <input name="middleName" value={formData.middleName} onChange={handleInputChange} type="text" placeholder="Optional" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Last Name *</label>
                    <input name="lastName" value={formData.lastName} onChange={handleInputChange} type="text" placeholder="Enter last name" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Gender</label>
                    <div className="relative">
                      <select name="gender" value={formData.gender} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600">
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Date of Birth</label>
                    <input
                      name="dateOfBirth"
                      value={formData.dateOfBirth}
                      onChange={handleInputChange}
                      type="date"
                      min={DOB_MIN()}
                      max={DOB_MAX()}
                      className={`w-full text-sm border rounded-md px-3 py-2 text-slate-600 focus:outline-none ${
                        dateOfBirthError
                          ? 'border-red-300 focus:border-red-400'
                          : 'border-slate-200 focus:border-[#F5C742]'
                      }`}
                    />
                    {dateOfBirthError && (
                      <p className="mt-1 text-[11px] text-red-600">{dateOfBirthError}.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Details */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Contact Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Phone *</label>
                  <input name="phone" value={formData.phone} onChange={handleInputChange} type="text" placeholder="+971 50 123 4567" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Email *</label>
                  <input name="email" value={formData.email} onChange={handleInputChange} type="email" placeholder="employee@billbull.app" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Current Address</label>
                  <textarea name="currentAddress" value={formData.currentAddress} onChange={handleInputChange} placeholder="Enter current address" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742] h-20 resize-none"></textarea>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Nationality</label>
                  <select name="nationality" value={formData.nationality} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742] bg-white">
                    <option value="">Select nationality</option>
                    <option value="United Arab Emirates">United Arab Emirates</option>
                    <option value="India">India</option>
                    <option value="Pakistan">Pakistan</option>
                    <option value="Bangladesh">Bangladesh</option>
                    <option value="Philippines">Philippines</option>
                    <option value="Egypt">Egypt</option>
                    <option value="United States">United States</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Saudi Arabia">Saudi Arabia</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Emergency Contact</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Contact Name</label>
                  <input name="emergencyContactName" value={formData.emergencyContactName} onChange={handleInputChange} type="text" placeholder="Full name" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Relation</label>
                  <input name="emergencyContactRelation" value={formData.emergencyContactRelation} onChange={handleInputChange} type="text" placeholder="e.g., Spouse, Parent" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Phone</label>
                  <input name="emergencyContactPhone" value={formData.emergencyContactPhone} onChange={handleInputChange} type="text" placeholder="+971 50 XXX XXXX" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                </div>
              </div>
            </div>
          </div>
        );

      case 'job':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Role Assignment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Role / Designation *</label>
                  <div className="relative">
                    <select
                      name="role"
                      value={formData.role}
                      onChange={handleInputChange}
                      disabled={designationRolesLoading}
                      className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">
                        {designationRolesLoading ? 'Loading roles...' : 'Select a role'}
                      </option>
                      {(designationRoles.length > 0 ? designationRoles : FALLBACK_ROLES.map(r => ({ name: r }))).map((role) => (
                        <option key={role.id ?? role.name} value={employeeRoleOptionValue(role.name)}>
                          {employeeRoleOptionLabel(role.name)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Department *</label>
                  <div className="relative">
                    <select
                      name="department"
                      value={formData.department}
                      onChange={handleInputChange}
                      className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600"
                    >
                      <option value="">Select department</option>
                      <option value="Store Team">Store Team</option>
                      <option value="Warehouse Team">Warehouse Team</option>
                      <option value="Management">Management</option>
                      <option value="Back Office">Back Office</option>
                      <option value="Sales">Sales</option>
                      <option value="Finance & Accounts">Finance &amp; Accounts</option>
                      <option value="HR">HR</option>
                      <option value="IT">IT</option>
                      <option value="Operations">Operations</option>
                      <option value="Procurement">Procurement</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Organization Mapping</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Branch (Default) *</label>
                  <div className="relative">
                    <select name="branch" value={formData.branch} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600">
                      <option value="">{branchOptions.length > 0 ? 'Select branch' : 'No branches available'}</option>
                      {branchOptions.map((branchName) => {
                        const branch = findBranchByName(branches, branchName);
                        return (
                          <option key={branchName} value={branchName}>
                            {branch ? formatBranchLabel(branch) : branchName}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  {selectedBranch?.defaultWarehouseName && (
                    <p className="mt-1 text-[10px] text-slate-400">
                      Default warehouse: {selectedBranch.defaultWarehouseName}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Reporting Manager</label>
                  <AutocompleteField
                    options={resolvedManagerOptions}
                    value={formData.reportingManager}
                    onChange={(nextValue) => updateFormField('reportingManager', nextValue)}
                    placeholder={resolvedManagerOptions.length > 0 ? 'Select or type manager' : 'Enter manager name'}
                    noOptionsMessage="No managers available yet"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Work Location</label>
                  <input name="workLocation" value={formData.workLocation} onChange={handleInputChange} type="text" placeholder="Optional" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Employment Type *</label>
                  <div className="relative">
                    <select name="employmentType" value={formData.employmentType} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600">
                      <option value="Full Time">Full Time</option>
                      <option value="Part Time">Part Time</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Employment Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Join Date *</label>
                  <input name="joinDate" value={formData.joinDate} onChange={handleInputChange} type="date" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Probation Period (Months)</label>
                    <input name="probationPeriod" value={formData.probationPeriod} onChange={handleInputChange} type="number" placeholder="3" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Confirmation Date (Auto)</label>
                    <input type="text" placeholder="dd-mm-yyyy" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-slate-50" readOnly />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Status *</label>
                  <div className="relative">
                    <select name="status" value={formData.status} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600">
                      <option value="Draft">Draft</option>
                      <option value="Active">Active</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'access':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-700">POS Access</h3>
                  <Lock size={14} className="text-slate-400" />
                </div>
                <div className="flex items-center gap-2">
                  <input name="posAccess" checked={formData.posAccess} onChange={handleInputChange} type="checkbox" className="w-4 h-4 text-[#F5C742] rounded focus:ring-[#F5C742]" />
                  <label className="text-xs text-slate-600 font-medium">Enable POS Login</label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">POS PIN</label>
                  <div className="flex">
                    <input name="posPin" value={formData.posPin} onChange={handleInputChange} type="password" placeholder="Set 4-digit PIN" className="flex-1 text-sm border border-slate-200 rounded-l-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                    <button className="px-3 py-2 bg-slate-100 border border-l-0 border-slate-200 rounded-r-md text-xs font-medium text-slate-600 hover:bg-slate-200">Auto</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Permission Profile</label>
                  <div className="relative">
                    <select name="permissionProfile" value={formData.permissionProfile} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600">
                      <option>Role-based (Auto)</option>
                      <option>Custom</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Permissions Checkboxes */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-md border border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-600">Discount Allowed</label>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="w-4 h-4 text-[#F5C742] rounded focus:ring-[#F5C742]" />
                    <input type="text" placeholder="Max %" className="w-16 text-xs border border-slate-200 rounded px-2 py-1" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-600">Void Bills</label>
                  <input type="checkbox" className="w-4 h-4 text-[#F5C742] rounded focus:ring-[#F5C742]" />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-600">Edit Price</label>
                  <input type="checkbox" className="w-4 h-4 text-[#F5C742] rounded focus:ring-[#F5C742]" />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-600">Manager Override Required</label>
                  <input type="checkbox" className="w-4 h-4 text-[#F5C742] rounded focus:ring-[#F5C742]" defaultChecked />
                </div>
              </div>
            </div>

            {canProvisionLoginAccess && (
              <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-700">System Login Access</h3>
                      <ShieldCheck size={14} className="text-slate-400" />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Provision employee login now. The account stays inactive until this employee becomes Active.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    <input
                      name="createLoginAccess"
                      checked={formData.createLoginAccess}
                      onChange={handleInputChange}
                      type="checkbox"
                      className="w-4 h-4 text-[#F5C742] rounded focus:ring-[#F5C742]"
                    />
                    Create login access
                  </label>
                </div>

                {formData.createLoginAccess && (
                  <div className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Login Username or Email *</label>
                        <input
                          name="loginUsername"
                          value={formData.loginUsername}
                          onChange={handleInputChange}
                          type="text"
                          placeholder="employee.login"
                          className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Temporary Password *</label>
                        <input
                          name="temporaryPassword"
                          value={formData.temporaryPassword}
                          onChange={handleInputChange}
                          type="password"
                          placeholder="Set temporary password"
                          className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]"
                        />
                        {formData.temporaryPassword && (
                          <div className="mt-2 text-xs space-y-1">
                            {(() => {
                              const v = validatePassword(formData.temporaryPassword).rules;
                              return (
                                <>
                                  <div className={`flex items-center gap-1 ${v.length ? 'text-emerald-600' : 'text-slate-500'}`}>
                                    {v.length ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} Min 8 characters
                                  </div>
                                  <div className={`flex items-center gap-1 ${v.uppercase ? 'text-emerald-600' : 'text-slate-500'}`}>
                                    {v.uppercase ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} One uppercase letter
                                  </div>
                                  <div className={`flex items-center gap-1 ${v.digit ? 'text-emerald-600' : 'text-slate-500'}`}>
                                    {v.digit ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} One number
                                  </div>
                                  <div className={`flex items-center gap-1 ${v.specialChar ? 'text-emerald-600' : 'text-slate-500'}`}>
                                    {v.specialChar ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} One special character
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">System Role *</label>
                        <div className="relative">
                          <select
                            name="systemRoleId"
                            value={formData.systemRoleId}
                            onChange={handleInputChange}
                            disabled={systemRolesLoading || systemRoles.length === 0}
                            className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <option value="">
                              {systemRolesLoading ? 'Loading system roles...' : 'Select a system role'}
                            </option>
                            {systemRoles.map(role => (
                              <option key={role.id} value={role.id}>
                                {role.name.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    {systemRolesError && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                        {systemRolesError}
                      </div>
                    )}

                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      This user account will activate automatically when the employee becomes Active.
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Branch & Warehouse Access</h3>
              <p className="text-xs text-slate-400 mb-5">Select branches this employee can access. The default branch is set in Job &amp; Organization.</p>

              {/* Default branch — read from Job & Org selection */}
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Default Branch</div>
                {selectedBranch ? (
                  <div className="flex items-center justify-between rounded-md border border-[#F5C742] bg-yellow-50 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{formatBranchLabel(selectedBranch) || selectedBranch.name}</div>
                      {selectedBranch.defaultWarehouseName && (
                        <div className="text-[11px] text-slate-500 mt-0.5">Warehouse: {selectedBranch.defaultWarehouseName}</div>
                      )}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-yellow-700 bg-yellow-100 border border-yellow-300 px-2 py-0.5 rounded-full">Default</span>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-400">
                    No default branch — select one in Job &amp; Organization tab
                  </div>
                )}
              </div>

              {/* Additional branches multi-select */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Additional Branch Access</div>
                <div className="space-y-2">
                  {branches.filter(b => !selectedBranch || b.id !== selectedBranch.id).map(b => {
                    const isChecked = formData.additionalBranchIds.includes(b.id);
                    return (
                      <label
                        key={b.id}
                        className={`flex items-center justify-between rounded-md border px-4 py-3 cursor-pointer transition-colors ${isChecked ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const next = isChecked
                                ? formData.additionalBranchIds.filter(id => id !== b.id)
                                : [...formData.additionalBranchIds, b.id];
                              updateFormField('additionalBranchIds', next);
                            }}
                            className="w-4 h-4 text-[#F5C742] rounded border-slate-300 focus:ring-[#F5C742]"
                          />
                          <div>
                            <div className="text-sm font-medium text-slate-700">{formatBranchLabel(b) || b.name}</div>
                            {b.defaultWarehouseName && (
                              <div className="text-[11px] text-slate-400">Warehouse: {b.defaultWarehouseName}</div>
                            )}
                          </div>
                        </div>
                        {b.isDefault && (
                          <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">System Default</span>
                        )}
                      </label>
                    );
                  })}
                  {branches.length === 0 && (
                    <div className="text-xs text-slate-400 py-2">No other branches configured</div>
                  )}
                  {branches.length > 0 && branches.filter(b => !selectedBranch || b.id !== selectedBranch.id).length === 0 && (
                    <div className="text-xs text-slate-400 py-2">No additional branches available</div>
                  )}
                </div>
              </div>

              {/* Additional warehouses multi-select */}
              <div className="mt-6">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Additional Warehouse Access</div>
                <div className="space-y-2">
                  {warehousesList.map(w => {
                    const isChecked = formData.additionalWarehouseIds.includes(w.id);
                    return (
                      <label
                        key={w.id}
                        className={`flex items-center justify-between rounded-md border px-4 py-3 cursor-pointer transition-colors ${isChecked ? 'border-slate-400 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const next = isChecked
                                ? formData.additionalWarehouseIds.filter(id => id !== w.id)
                                : [...formData.additionalWarehouseIds, w.id];
                              updateFormField('additionalWarehouseIds', next);
                            }}
                            className="w-4 h-4 text-[#F5C742] rounded border-slate-300 focus:ring-[#F5C742]"
                          />
                          <div>
                            <div className="text-sm font-medium text-slate-700">{w.name}</div>
                            {w.code && (
                              <div className="text-[11px] text-slate-400">Code: {w.code}</div>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                  {warehousesList.length === 0 && (
                    <div className="text-xs text-slate-400 py-2">No warehouses available</div>
                  )}
                </div>
              </div>
            </div>

          </div>
        );

      case 'payroll':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-yellow-600 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-yellow-800">Optional: Payroll & Benefits</h4>
                <p className="text-xs text-yellow-700">This section can be completed later if payroll module is not enabled yet.</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Salary Structure</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Salary Type</label>
                  <div className="relative">
                    <select name="salaryType" value={formData.salaryType} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600">
                      <option value="Monthly">Monthly</option>
                      <option value="Hourly">Hourly</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Basic Salary</label>
                  <input name="basicSalary" value={formData.basicSalary} onChange={handleInputChange} type="number" placeholder="0.00" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]" />
                </div>
              </div>
            </div>
          </div>
        );

      case 'attendance':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Shift & Schedule</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Shift Type</label>
                  <div className="relative">
                    <select name="shiftType" value={formData.shiftType} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600">
                      <option value="">Select shift</option>
                      <option value="Morning">Morning</option>
                      <option value="Evening">Evening</option>
                      <option value="Night">Night</option>
                      <option value="Flexible">Flexible</option>
                      <option value="Split">Split</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Work Days</label>
                  <div className="relative">
                    <select name="workDays" value={formData.workDays} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600">
                      <option value="Mon-Fri">Monday – Friday</option>
                      <option value="Mon-Sat">Monday – Saturday</option>
                      <option value="Mon-Sun">7 Days</option>
                      <option value="Sat-Thu">Saturday – Thursday</option>
                      <option value="Sun-Thu">Sunday – Thursday</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Weekly Off Days</label>
                  <input
                    name="weeklyOffDays"
                    value={formData.weeklyOffDays}
                    onChange={handleInputChange}
                    type="number"
                    min="0"
                    max="7"
                    placeholder="2"
                    className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Leave Policy</label>
                  <div className="relative">
                    <select name="leavePolicy" value={formData.leavePolicy} onChange={handleInputChange} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600">
                      <option value="">Select policy</option>
                      <option value="Standard UAE">Standard UAE (30 days annual)</option>
                      <option value="GCC Standard">GCC Standard</option>
                      <option value="Probation">Probation (no leave)</option>
                      <option value="Custom">Custom</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'docs':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Identity Documents</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Emirates ID Number</label>
                  <input
                    name="emiratesId"
                    value={formData.emiratesId}
                    onChange={handleInputChange}
                    type="text"
                    placeholder="784-XXXX-XXXXXXX-X"
                    className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Expiry Date</label>
                  <input
                    name="expiryDate"
                    value={formData.expiryDate}
                    onChange={handleInputChange}
                    type="date"
                    className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 text-slate-600 focus:outline-none focus:border-[#F5C742]"
                  />
                </div>
              </div>

              {/* Emirates ID PDF Upload (optional) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-500">Emirates ID Copy <span className="text-slate-400">(PDF — optional)</span></label>
                  {emiratesIdFile && (
                    <button
                      type="button"
                      onClick={() => setEmiratesIdFile(null)}
                      className="text-[10px] text-red-500 hover:text-red-600 flex items-center gap-1"
                    >
                      <XCircle size={12} /> Remove
                    </button>
                  )}
                </div>
                <input
                  type="file"
                  ref={docInputRef}
                  className="hidden"
                  accept="application/pdf"
                  onChange={handleDocUpload}
                />
                <div
                  onClick={() => docInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors cursor-pointer ${emiratesIdFile ? 'border-green-300 bg-green-50' : 'border-slate-200 hover:border-[#F5C742] hover:bg-yellow-50/10'}`}
                >
                  {emiratesIdFile ? (
                    <div className="flex flex-col items-center text-green-700">
                      <FileText size={24} className="mb-2" />
                      <span className="text-xs font-bold">{emiratesIdFile.name}</span>
                      <span className="text-[10px] opacity-70">{(emiratesIdFile.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ) : (
                    <>
                      <Upload size={20} className="mb-2 text-slate-400" />
                      <span className="text-xs font-medium text-slate-500">Click to upload Emirates ID Copy</span>
                      <span className="text-[10px] text-slate-400 mt-1">PDF only · Max 2MB</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Passport section */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Passport Details <span className="text-xs font-normal text-slate-400">(optional)</span></h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Passport Number</label>
                  <input
                    name="passportNumber"
                    value={formData.passportNumber || ''}
                    onChange={handleInputChange}
                    type="text"
                    placeholder="Enter passport number"
                    className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Issue Date</label>
                  <input
                    name="passportIssueDate"
                    value={formData.passportIssueDate || ''}
                    onChange={handleInputChange}
                    type="date"
                    className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 text-slate-600 focus:outline-none focus:border-[#F5C742]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Expiry Date</label>
                  <input
                    name="passportExpiryDate"
                    value={formData.passportExpiryDate || ''}
                    onChange={handleInputChange}
                    type="date"
                    className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 text-slate-600 focus:outline-none focus:border-[#F5C742]"
                  />
                </div>
              </div>
            </div>

            {/* Visa section */}
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Visa / Residency <span className="text-xs font-normal text-slate-400">(optional)</span></h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Visa Type</label>
                  <div className="relative">
                    <select
                      name="visaType"
                      value={formData.visaType || ''}
                      onChange={handleInputChange}
                      className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 appearance-none bg-white focus:outline-none focus:border-[#F5C742] text-slate-600"
                    >
                      <option value="">Select type</option>
                      <option value="Employment">Employment Visa</option>
                      <option value="Residency">Residency Visa</option>
                      <option value="Visit">Visit Visa</option>
                      <option value="Citizen">UAE Citizen</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Visa Number</label>
                  <input
                    name="visaNumber"
                    value={formData.visaNumber || ''}
                    onChange={handleInputChange}
                    type="text"
                    placeholder="Enter visa number"
                    className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-[#F5C742]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Visa Expiry Date</label>
                  <input
                    name="visaExpiryDate"
                    value={formData.visaExpiryDate || ''}
                    onChange={handleInputChange}
                    type="date"
                    className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 text-slate-600 focus:outline-none focus:border-[#F5C742]"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 'assets':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2">
              <Box size={16} className="text-blue-600 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-blue-700">Auto-rule enabled</h4>
                <p className="text-[10px] text-blue-600">On Exit → Auto-unassign assets + Block POS access</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm min-h-[200px]">
              <h3 className="text-sm font-semibold text-slate-700 mb-6">Assigned Assets</h3>
              <div className="flex items-center justify-center h-32 text-slate-400 text-xs">
                No assets assigned yet. Assets can be assigned after employee creation.
              </div>
            </div>
          </div>
        );

      case 'notes': {
        const activeTags = formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const toggleTag = (tag) => {
          const next = activeTags.includes(tag)
            ? activeTags.filter(t => t !== tag)
            : [...activeTags, tag];
          updateFormField('tags', next.join(','));
        };
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">HR Notes (Private)</h3>
              <textarea
                name="hrNotes"
                value={formData.hrNotes}
                onChange={handleInputChange}
                placeholder="Internal notes visible only to HR"
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 h-32 resize-none focus:outline-none focus:border-[#F5C742]"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {['Keyholder', 'Night Shift', 'Cash Handling', 'Driver'].map(tag => (
                  <label key={tag} className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-xs cursor-pointer transition-colors ${activeTags.includes(tag) ? 'border-[#F5C742] bg-yellow-50 text-yellow-800 font-medium' : 'border-slate-200 hover:bg-slate-50 text-slate-600'}`}>
                    <input
                      type="checkbox"
                      checked={activeTags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                      className="w-3 h-3 text-[#F5C742] rounded focus:ring-[#F5C742]"
                    />
                    <span>{tag}</span>
                  </label>
                ))}
              </div>
              {activeTags.length > 0 && (
                <p className="mt-3 text-[10px] text-slate-400">Selected: {activeTags.join(', ')}</p>
              )}
            </div>
          </div>
        );
      }

      case 'review':
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4 flex items-start gap-3">
              <Eye size={18} className="text-yellow-600 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-yellow-800">Review all information before submission</h4>
                <p className="text-xs text-yellow-700">Ensure all mandatory fields are completed and verified</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {navItems.slice(0, 8).map((step) => {
                const missing = sectionIssues[step.id] || [];
                return (
                  <div key={step.id} className="bg-white border border-slate-200 rounded-lg p-4 min-h-24 flex flex-col justify-center">
                    <div className="text-xs text-slate-500 mb-1">{step.label}</div>
                    <div className={`text-sm font-medium ${missing.length === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {missing.length === 0 ? 'Completed' : 'Incomplete'}
                    </div>
                    {missing.length > 0 && (
                      <div className="mt-1 text-[11px] text-slate-500">Missing: {missing.join(', ')}</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Validation Status</h3>
              <div className="space-y-2">
                {incompleteSections.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 text-red-500 text-xs">
                      <AlertCircle size={14} />
                      <span>
                        {incompleteSections.length} section{incompleteSections.length > 1 ? 's' : ''} still
                        {' '}need{incompleteSections.length > 1 ? '' : 's'} attention before this employee can be created.
                      </span>
                    </div>
                    <ul className="ml-6 list-disc space-y-1 text-xs text-slate-600">
                      {incompleteSections.map((section) => (
                        <li key={section.id}>
                          <button
                            type="button"
                            onClick={() => setActiveTab(section.id)}
                            className="font-medium text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900"
                          >
                            {section.label}
                          </button>
                          {' — '}{sectionIssues[section.id].join(', ')}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-green-600 text-xs">
                    <CheckCircle2 size={14} />
                    <span>All sections completed. Ready to submit for approval.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#F7F7FA] w-full h-full md:w-[98%] md:h-[98%] md:rounded-lg shadow-2xl flex flex-col overflow-hidden">

        {/* --- Header --- */}
        <div className="bg-white px-6 py-4 border-b border-slate-200 flex flex-col gap-4 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-slate-500 mb-1">HR & Workforce / Employees & Roles / {employeeToEdit ? 'Edit Employee' : 'Add New Employee'}</div>
              <h2 className="text-xl font-bold text-slate-800">{employeeToEdit ? 'Edit Employee' : 'Add New Employee'}</h2>
              <p className="text-xs text-slate-500">Create and onboard employees with approvals, compliance, and access control</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:flex px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-xs font-bold text-yellow-700 items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-yellow-500"></div> Draft
              </span>
              <div className="hidden sm:block h-4 w-px bg-slate-300 mx-1"></div>

              {/* Responsive Action Buttons */}
              <div className="flex items-center gap-2">
                <button onClick={handleSaveDraft} className="hidden sm:block px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-xs font-medium hover:bg-slate-50">Save Draft</button>
                <button onClick={onClose} className="px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded text-xs font-medium hover:bg-red-50">Discard</button>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 ml-2">
                  <X size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Workflow Stepper - Scrollable on mobile */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center flex-shrink-0">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap ${step.status === 'current'
                    ? 'bg-yellow-50 border-[#F5C742] text-yellow-700'
                    : 'bg-white border-slate-200 text-slate-400'
                  }`}>
                  <div className={`w-2 h-2 rounded-full ${step.status === 'current' ? 'bg-[#F5C742]' : 'bg-slate-300'}`}></div>
                  {step.label}
                </div>
                {idx < steps.length - 1 && <div className="w-4 h-[1px] bg-slate-200 mx-1"></div>}
              </div>
            ))}
          </div>
        </div>

        {/* --- Main Content Body (Responsive Layout) --- */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

          {/* Left Sidebar Navigation - Scrollable Top Bar on Mobile */}
          <div className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex-shrink-0 overflow-x-auto lg:overflow-y-auto lg:py-4 no-scrollbar">
            <div className="flex lg:flex-col px-4 lg:space-y-1 py-2 lg:py-0 gap-2 lg:gap-0">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex-shrink-0 w-auto lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2 lg:py-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === item.id
                      ? 'bg-[#F5C742] text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                >
                  <item.icon size={14} className={activeTab === item.id ? 'text-slate-900' : 'text-slate-400'} />
                  {item.label}
                  {item.id !== activeTab && item.id !== 'review' && (
                    isSectionComplete(item.id)
                      ? <span className="hidden lg:block ml-auto text-green-500"><CheckCircle2 size={12} /></span>
                      : <span className="hidden lg:block ml-auto text-red-500"><AlertCircle size={12} /></span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Center Form Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#F7F7FA]">
            <div className="max-w-4xl mx-auto">
              {renderContent()}
            </div>
          </div>

          {/* Right Sidebar Info - Hidden on very small screens, displayed below on medium, sidebar on large */}
          <div className="hidden xl:block w-72 bg-white border-l border-slate-200 flex-shrink-0 overflow-y-auto p-4 space-y-6">

            {/* Employee Snapshot */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="text-xs font-semibold text-slate-500 mb-2">Employee Snapshot</div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-slate-800">
                  {formData.firstName || 'New'} {formData.lastName || 'Employee'}
                </span>
                <div className="w-2 h-2 rounded-full bg-slate-400"></div>
              </div>
              <div className="text-xs text-slate-500">{employeeToEdit ? 'Editing' : 'Draft'}</div>
            </div>

            {/* Onboarding Checklist (Functional) */}
            <div>
              <div className="mb-3">
                <h4 className="text-xs font-semibold text-slate-700">Onboarding Checklist</h4>
                <p className="mt-1 text-[10px] text-slate-400">Updates automatically as you complete each section.</p>
              </div>
              <div className="space-y-2">
                {checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 select-none">
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${item.checked ? 'bg-slate-800 border-slate-800' : 'border-slate-300 bg-white'}`}
                    >
                      {item.checked && <CheckCircle2 size={10} className="text-white" />}
                    </div>
                    <span
                      className={`text-xs ${item.checked ? 'text-slate-800 font-medium' : 'text-slate-500'}`}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Progress Bar (Dynamic) */}
              <div className="mt-4">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                  <span>Progress</span>
                  <span>{completedChecklistCount} / {checklist.length}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div
                    className="bg-slate-800 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${checklistProgress}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Approval Status */}
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-3">Approval Status</h4>
              <div className="space-y-2">
                {['HR Review', 'Manager Approval', 'Accounts Approval'].map((label, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border border-slate-300 bg-white"></div>
                    <span className="text-xs text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* --- Footer --- */}
        <div className="bg-white border-t border-slate-200 flex-shrink-0">
          {/* Submit errors surface here so they stay visible after the guard jumps
              the user to the offending section. */}
          {formError && (
            <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">
              {formError}
            </div>
          )}
          <div className="px-6 py-4 flex justify-between items-center">
          <button className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50" onClick={handleBack}>Back</button>
          <div className="flex gap-3">
            <button onClick={handleSaveDraft} className="hidden sm:block px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm">Save Draft</button>

            {activeTab === 'review' ? (
              <button
                onClick={handleFormSubmit}
                className="px-6 py-2 bg-[#F5C742] rounded-md text-sm font-bold text-slate-900 hover:bg-yellow-400 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={incompleteSections.length > 0}
              >
                {employeeToEdit ? 'Update Employee' : 'Create Employee'}
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-[#F5C742] rounded-md text-sm font-bold text-slate-900 hover:bg-yellow-400 shadow-sm"
              >
                Next
              </button>
            )}
          </div>
          </div>
        </div>

      </div>
    </div>
  );
};


// ==========================================
// 2. SUB-COMPONENTS
// ==========================================

const StatCard = ({
  label,
  value,
  subValue,
  trend,
  icon: Icon,
  color
}) => (
  <div className="bg-white px-3.5 py-2.5 rounded-lg border border-slate-200 shadow-sm flex items-center gap-3 min-w-0">
    <div className={`p-2 rounded-full shrink-0 ${color}`}>
      <Icon className="h-4 w-4" />
    </div>
    <div className="min-w-0">
      <div className="text-xs text-slate-500 font-medium leading-4 truncate">{label}</div>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <div className="text-xl font-bold text-slate-900 leading-7 whitespace-nowrap">{value}</div>
        {subValue && (
          <div
            title={typeof subValue === 'string' ? subValue : undefined}
            className={`text-[11px] font-medium truncate ${trend === 'up'
                ? 'text-emerald-600'
                : trend === 'down'
                  ? 'text-red-600'
                  : trend === 'warning'
                    ? 'text-amber-600'
                    : 'text-slate-400'
              }`}
          >
            {subValue}
          </div>
        )}
      </div>
    </div>
  </div>
);

// ==========================================
// 3. ACTION MODAL COMPONENT (New)
// ==========================================

const ActionModal = ({ employee, onClose, onDeactivate, onActivate, onEdit, onSetTarget, onManageAccess, onPrintBarcode }) => {
  const { canEdit } = usePermissions();
  if (!employee) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-80 overflow-hidden animate-in zoom-in-95 duration-200 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">Actions</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XIcon size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden ${employee.color}`}>
              {employee.avatar ? <img src={employee.avatar} alt="Avatar" className="w-full h-full object-cover" /> : employee.initials}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-800">{employee.name}</div>
              <div className="text-xs text-slate-500">{employee.role}</div>
            </div>
          </div>

          <div className="space-y-2">
            {/* ── VERTICAL: canEdit('hr') ── */}
            {canEdit('hr') ? (
              <button
                onClick={() => onEdit(employee)}
                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded flex items-center gap-2 transition-colors"
              >
                <Edit size={14} className="text-slate-400" /> Edit Profile
              </button>
            ) : (
              <div className="px-3 py-2 text-xs text-slate-400 flex items-center gap-2 cursor-not-allowed select-none">
                <Edit size={14} className="text-slate-300" /> Edit Profile
                <span className="ml-auto text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">No permission</span>
              </div>
            )}

            <button
              onClick={() => { onSetTarget?.(employee.id); onClose(); }}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded flex items-center gap-2 transition-colors"
            >
              <Target size={14} className="text-slate-400" /> Set Target
            </button>

            {/* Employee ID barcode. Read-only — it prints what is already on the employee record,
                so it needs no edit permission, only the hr.employee view this screen already gates.
                Offered ONLY for the two salesperson-eligible designations: the barcode exists so a
                sale can be attributed at the till, and a badge for a storekeeper would be scanned
                once, rejected by the server, and leave the cashier wondering which one to use. */}
            {isSalespersonRole(employee.rawRole || employee.role) && (
              <button
                onClick={() => { onPrintBarcode?.(employee); onClose(); }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded flex items-center gap-2 transition-colors"
              >
                <BarcodeIcon size={14} className="text-slate-400" /> Print Employee Barcode
              </button>
            )}

            {hasRole('ADMIN') && onManageAccess && (
              <button
                onClick={() => { onManageAccess(employee); onClose(); }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded flex items-center gap-2 transition-colors"
              >
                <Lock size={14} className="text-slate-400" /> Manage System Access
              </button>
            )}

            <div className="h-px bg-slate-100 my-1"></div>

            {/* ── VERTICAL: canEdit('hr') for activate/deactivate ── */}
            {canEdit('hr') ? (
              employee.status === 'Active' ? (
                <button
                  onClick={() => onDeactivate(employee.id)}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded flex items-center gap-2 transition-colors"
                >
                  <UserX size={14} className="text-red-500" /> Deactivate
                </button>
              ) : (
                <button
                  onClick={() => onActivate(employee.id)}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-green-600 hover:bg-green-50 rounded flex items-center gap-2 transition-colors"
                >
                  <UserCheck size={14} className="text-green-500" /> Activate
                </button>
              )
            ) : (
              <div className="px-3 py-2 text-xs text-slate-400 flex items-center gap-2 cursor-not-allowed select-none">
                <UserX size={14} className="text-slate-300" />
                {employee.status === 'Active' ? 'Deactivate' : 'Activate'}
                <span className="ml-auto text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">No permission</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3b. SHARED ROW PRIMITIVES + DETAILS DRAWER
// ==========================================

const STATUS_BADGE = {
  Active: 'bg-green-100 text-green-700 border-green-200',
  Pending: 'bg-amber-100 text-amber-700 border-amber-200',
};

const StatusBadge = ({ status }) => (
  <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${STATUS_BADGE[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
    {status || EMPTY_DATA_LABEL}
  </span>
);

const EmployeeAvatar = ({ employee, size = 'w-9 h-9', onClick }) => (
  <button
    type="button"
    className={`${size} shrink-0 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden ${employee.color} ${employee.avatar ? 'cursor-pointer ring-2 ring-transparent hover:ring-offset-1 hover:ring-slate-300' : 'cursor-default'}`}
    onClick={(e) => {
      e.stopPropagation();
      if (employee.avatar) onClick?.(employee.avatar);
    }}
  >
    {employee.avatar ? <img src={employee.avatar} alt="Avatar" className="w-full h-full object-cover" /> : employee.initials}
  </button>
);

// /api/employees/active returns Active and Inactive records, so these are the only statuses the list holds.
const STATUS_FILTER_OPTIONS = ['All Statuses', 'Active', 'Inactive'];

// `no-scrollbar` is referenced across the app but never defined, so horizontal strips here
// hide their scrollbar with arbitrary utilities instead (Firefox + WebKit/Blink).
const HIDE_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** Native <select> under a styled label — the same pattern the page's filters already used. */
const FilterSelect = ({ label, value, options, onChange }) => (
  <div className="relative flex-1 sm:flex-none min-w-[8rem]">
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 whitespace-nowrap transition-colors cursor-pointer">
      <span className="truncate max-w-[10rem]">{value}</span>
      <ChevronDown size={14} className="shrink-0 text-slate-400" />
    </div>
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
    >
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  </div>
);

const achievementText = (value) => (value == null ? EMPTY_DATA_LABEL : `${Number(value).toFixed(0)}%`);

const DetailRow = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-b-0">
    <dt className="text-xs text-slate-500 shrink-0">{label}</dt>
    <dd className="text-xs font-medium text-slate-800 text-right min-w-0 break-words">{children || EMPTY_DATA_LABEL}</dd>
  </div>
);

/**
 * Read-only summary of one employee. The list row only carries the handful of fields the
 * table needs, so the full record is fetched through the same GET /api/employees/{id} the
 * Edit flow already uses. Performance figures are the server-computed row passed in — the
 * drawer never derives a business number.
 */
const EmployeeDetailsDrawer = ({
  employee,
  performanceRow,
  performancePeriodLabel,
  performanceNotice,
  onClose,
  onEdit,
  onSetTarget,
  onManageAccess,
  onViewPhoto,
}) => {
  const { canEdit } = usePermissions();
  // The parent keys this drawer by employee id, so state starts fresh for every employee.
  const [detailsState, setDetailsState] = useState({ data: null, loading: Boolean(employee), error: '' });
  const { data: details, loading: detailsLoading, error: detailsError } = detailsState;

  useEffect(() => {
    if (!employee) return undefined;
    let cancelled = false;
    employeesApi.getEmployeeById(employee.id)
      .then((data) => { if (!cancelled) setDetailsState({ data, loading: false, error: '' }); })
      .catch(() => {
        if (!cancelled) setDetailsState({ data: null, loading: false, error: 'Could not load full employee details.' });
      });
    return () => { cancelled = true; };
  }, [employee]);

  useEffect(() => {
    if (!employee) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [employee, onClose]);

  if (!employee) return null;

  const branchLabel = employee.branch || 'Unassigned';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 animate-in fade-in duration-200" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={`${employee.name} details`}
        className="h-full w-full sm:max-w-md bg-white shadow-xl flex flex-col animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Profile header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
          <EmployeeAvatar employee={employee} size="w-12 h-12" onClick={onViewPhoto} />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-800 truncate">{employee.name}</h2>
            <div className="text-xs text-slate-400 font-mono">{employee.code}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-600 font-medium">{employee.role}</span>
              <StatusBadge status={employee.status} />
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100" aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Employment */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Employment</h3>
            <dl>
              <DetailRow label="Branch">{branchLabel}</DetailRow>
              <DetailRow label="Department">{employee.dept}</DetailRow>
              {detailsLoading && (
                <div className="py-3 text-xs text-slate-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Loading details…
                </div>
              )}
              {details && (
                <>
                  <DetailRow label="Employment Type">{details.employmentType}</DetailRow>
                  <DetailRow label="Join Date">{details.joinDate ? formatDisplayDate(details.joinDate) : null}</DetailRow>
                  <DetailRow label="Confirmation Date">{details.confirmationDate ? formatDisplayDate(details.confirmationDate) : null}</DetailRow>
                  <DetailRow label="Reporting Manager">{details.reportingManager}</DetailRow>
                  <DetailRow label="Work Location">{details.workLocation}</DetailRow>
                  <DetailRow label="Shift">{[details.shiftType, details.workDays].filter(Boolean).join(' · ')}</DetailRow>
                </>
              )}
            </dl>
            {detailsError && (
              <p className="mt-2 text-xs text-rose-600">{detailsError}</p>
            )}
          </section>

          {/* Contact */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Contact</h3>
            <dl>
              <DetailRow label={<span className="inline-flex items-center gap-1.5"><Mail size={12} /> Email</span>}>{employee.rawEmail}</DetailRow>
              <DetailRow label={<span className="inline-flex items-center gap-1.5"><Phone size={12} /> Phone</span>}>{employee.rawPhone}</DetailRow>
            </dl>
          </section>

          {/* Performance */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Performance</h3>
              <span className="text-[11px] text-slate-400">{performancePeriodLabel}</span>
            </div>
            {performanceRow ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">Sales</div>
                  <div className="text-sm font-bold text-slate-800"><CurrencyAmount value={performanceRow.sales} decimals={0} /></div>
                  <div className="text-[10px] text-slate-400">{performanceRow.bills} bill(s)</div>
                </div>
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">Target</div>
                  <div className="text-sm font-bold text-slate-800">
                    {performanceRow.targetAmount != null ? <CurrencyAmount value={performanceRow.targetAmount} decimals={0} /> : EMPTY_DATA_LABEL}
                  </div>
                  {performanceRow.targetStatus && <div className="text-[10px] text-slate-400 truncate">{performanceRow.targetStatus}</div>}
                </div>
                <div className="rounded-md border border-slate-200 px-3 py-2">
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">Achievement</div>
                  <div className="text-sm font-bold text-slate-800">{achievementText(performanceRow.achievementPercent)}</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    Comm. <CurrencyAmount value={performanceRow.commission} decimals={0} />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                {performanceNotice || 'No performance record for this period.'}
              </p>
            )}
          </section>
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-slate-200 flex flex-wrap gap-2 justify-end bg-slate-50">
          {hasRole('ADMIN') && (
            <button
              onClick={() => onManageAccess(employee)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Lock size={14} /> Access
            </button>
          )}
          {canEdit('hr') && (
            <button
              onClick={() => onSetTarget(employee.id)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Target size={14} /> Set Target
            </button>
          )}
          {canEdit('hr') && (
            <button
              onClick={() => onEdit(employee)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#F5C742] rounded-md text-xs font-semibold text-slate-900 hover:bg-yellow-400 shadow-sm"
            >
              <Edit size={14} /> Edit Employee
            </button>
          )}
        </div>
      </aside>
    </div>
  );
};

// ==========================================
// 4. EMPLOYEE ACCESS PANEL (ADMIN ONLY)
// ==========================================

const ACCESS_STATUS = {
  noAccess: { label: 'No Access', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  provisioned: { label: 'Provisioned', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  active:   { label: 'Active',    cls: 'bg-green-100 text-green-700 border-green-200' },
  frozen:   { label: 'Frozen',    cls: 'bg-red-100 text-red-600 border-red-200' },
};

const EmployeeAccessPanel = ({ employee, onClose }) => {
  const { branches, formatBranchLabel } = useBranch();
  const [accessData, setAccessData]     = useState(null);
  const [loading, setLoading]           = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]               = useState(null);
  const [inlineError, setInlineError]   = useState(null);

  // Assign-roles sub-view state
  const [showRoles, setShowRoles]       = useState(false);
  const [allRoles, setAllRoles]         = useState([]);       // [{ id, name }]
  const [selectedIds, setSelectedIds]   = useState(new Set()); // role ids currently checked
  const [primaryRoleId, setPrimaryRoleId] = useState(null);   // starred primary role id
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesSaving, setRolesSaving]   = useState(false);
  const [rolesLayout, setRolesLayout]   = useState('vertical'); // 'vertical' | 'horizontal'

  // Assign-branches sub-view state (PDF §2.3 multi-branch user)
  const [showBranches, setShowBranches] = useState(false);
  const [selectedBranchIds, setSelectedBranchIds] = useState(new Set());
  const [branchesSaving, setBranchesSaving] = useState(false);

  const resolvedEmployeeBranch = useMemo(() => {
    const branchLabel = normalizeOptionLabel(employee?.branch);
    if (!branchLabel) {
      return null;
    }

    const normalizedLabel = branchLabel.toLowerCase();

    return branches.find((branch) => {
      const branchName = normalizeOptionLabel(branch?.name)?.toLowerCase();
      const branchCode = normalizeOptionLabel(branch?.code)?.toLowerCase();
      const formattedLabel = normalizeOptionLabel(formatBranchLabel(branch))?.toLowerCase();

      return (
        normalizedLabel === branchName ||
        normalizedLabel === branchCode ||
        normalizedLabel === formattedLabel
      );
    }) || null;
  }, [branches, employee?.branch, formatBranchLabel]);

  // ── data loading ──────────────────────────────────────────
  const loadAccess = async () => {
    setLoading(true);
    setInlineError(null);
    try {
      const data = await usersApi.getEmployeeAccess(employee.id);
      setAccessData(data);
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to load access data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAccess(); }, [employee.id]);

  // ── generic action wrapper ────────────────────────────────
  const withAction = async (fn) => {
    setActionLoading(true);
    setInlineError(null);
    try {
      await fn();
      await loadAccess();
    } catch (e) {
      setInlineError(e.response?.data?.message || e.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ── main actions ──────────────────────────────────────────
  const handleCreateAccess = () => withAction(async () => {
    if (employee.status !== 'Active') {
      throw new Error('Cannot create access for an inactive employee. Activate the employee first.');
    }
    const password = window.prompt('Enter a temporary password for this account:');
    if (!password) throw new Error('Password is required');
    await usersApi.create({
      username: employee.rawEmail || employee.email,
      email:    employee.rawEmail || employee.email,
      password,
      fullName: employee.name,
      phone:    employee.rawPhone || '',
      linkedEmployeeId: employee.id,
      branchId: accessData?.branchId || resolvedEmployeeBranch?.id || null,
      roleIds: [],
    });
  });

  const handleFreeze         = () => withAction(() => usersApi.freeze(accessData.linkedUserId));
  const handleUnfreeze       = () => withAction(() => usersApi.unfreeze(accessData.linkedUserId));

  const handleResetPassword  = () => withAction(async () => {
    const newPw = window.prompt('Enter the new temporary password:');
    if (!newPw) throw new Error('Password is required');
    await usersApi.resetPassword(accessData.linkedUserId, newPw);
  });

  const handleDeleteAccess   = () => withAction(async () => {
    if (!window.confirm('Delete this user account? The employee record will NOT be affected.')) return;
    await usersApi.deleteUser(accessData.linkedUserId);
  });

  // ── assign-roles flow ─────────────────────────────────────
  const openRoles = async () => {
    setShowRoles(true);
    setRolesLoading(true);
    setInlineError(null);
    try {
      const roles = await usersApi.getAllRoles();
      setAllRoles(roles);
      // Pre-select roles already assigned to this user
      const currentNames = new Set(accessData?.assignedRoles || []);
      const preSelected  = new Set(roles.filter(r => currentNames.has(r.name)).map(r => r.id));
      setSelectedIds(preSelected);
      // Pre-populate primary role
      const currentPrimary = accessData?.primaryRoleName
        ? roles.find(r => r.name === accessData.primaryRoleName)?.id ?? null
        : null;
      setPrimaryRoleId(currentPrimary);
    } catch (e) {
      setInlineError(e.response?.data?.message || e.message || 'Failed to load roles');
      setShowRoles(false);
    } finally {
      setRolesLoading(false);
    }
  };

  const toggleRole = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Clear primary if deselecting it
        if (primaryRoleId === id) setPrimaryRoleId(null);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSaveRoles = async () => {
    setRolesSaving(true);
    setInlineError(null);
    try {
      await usersApi.assignRoles(accessData.linkedUserId, [...selectedIds], primaryRoleId);
      await loadAccess();
      setShowRoles(false);
    } catch (e) {
      setInlineError(e.response?.data?.message || e.message || 'Failed to save roles');
    } finally {
      setRolesSaving(false);
    }
  };

  // ── assign-branches flow (PDF §2.3 multi-branch user) ────────
  const openBranches = () => {
    setInlineError(null);
    const current = new Set(
      (accessData?.additionalBranchIds || [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id))
    );
    setSelectedBranchIds(current);
    setShowBranches(true);
  };

  const toggleBranch = (id) => {
    setSelectedBranchIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSaveBranches = async () => {
    setBranchesSaving(true);
    setInlineError(null);
    try {
      await usersApi.assignBranches(accessData.linkedUserId, [...selectedBranchIds]);
      await loadAccess();
      setShowBranches(false);
    } catch (e) {
      setInlineError(e.response?.data?.message || e.message || 'Failed to save branches');
    } finally {
      setBranchesSaving(false);
    }
  };

  // ── derived display ───────────────────────────────────────
  const statusInfo = !accessData?.hasLinkedUser
    ? ACCESS_STATUS.noAccess
    : accessData.pendingEmployeeActivation
      ? ACCESS_STATUS.provisioned
      : accessData.userActive
        ? ACCESS_STATUS.active
        : ACCESS_STATUS.frozen;

  const hasUser = accessData?.hasLinkedUser;

  // Role badge colours
  const roleBadge = {
    ADMIN:             'bg-purple-100 text-purple-700',
    BRANCH_ADMIN:      'bg-indigo-100 text-indigo-700',
    HR:                'bg-blue-100 text-blue-700',
    ACCOUNTANT:        'bg-green-100 text-green-700',
    SALES:             'bg-yellow-100 text-yellow-700',
    INVENTORY_MANAGER: 'bg-orange-100 text-orange-700',
    DELIVERY_PERSON:   'bg-cyan-100 text-cyan-700',
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
         onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative overflow-hidden"
           onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {(showRoles || showBranches) && (
              <button onClick={() => { setShowRoles(false); setShowBranches(false); }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors mr-1">
                <ChevronDown size={16} className="rotate-90" />
              </button>
            )}
            <div>
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <Lock size={14} className="text-slate-400" />
                {showBranches ? 'Assign Branches' : showRoles ? 'Assign Roles' : 'System Access'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{employee.name} · {employee.code}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
          ) : error ? (
            <div className="py-10 text-center text-sm text-red-500">{error}</div>

          ) : showRoles ? (
            /* ────────── ASSIGN ROLES SUB-VIEW ────────── */
            <div className="space-y-4">

              {/* Sub-view toolbar: description + layout toggle */}
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Select roles for{' '}
                  <span className="font-semibold text-slate-700">{accessData?.linkedUsername}</span>.
                  Changes take effect on next login.
                </p>
                {/* Layout toggle */}
                <div className="flex items-center gap-0.5 border border-slate-200 rounded-md p-0.5 shrink-0">
                  <button
                    onClick={() => setRolesLayout('vertical')}
                    title="List view"
                    className={`p-1 rounded transition-colors ${
                      rolesLayout === 'vertical'
                        ? 'bg-[#F5C742] text-slate-900'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}>
                    <LayoutList size={13} />
                  </button>
                  <button
                    onClick={() => setRolesLayout('horizontal')}
                    title="Grid view"
                    className={`p-1 rounded transition-colors ${
                      rolesLayout === 'horizontal'
                        ? 'bg-[#F5C742] text-slate-900'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}>
                    <LayoutGrid size={13} />
                  </button>
                </div>
              </div>

              {rolesLoading ? (
                <div className="py-6 text-center text-sm text-slate-400">Loading roles…</div>
              ) : rolesLayout === 'vertical' ? (
                /* ── Vertical list ── */
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {allRoles.map(role => {
                    const checked = selectedIds.has(role.id);
                    const isPrimary = primaryRoleId === role.id;
                    return (
                      <label key={role.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none
                          ${checked
                            ? 'border-[#F5C742] bg-yellow-50'
                            : 'border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white'}`}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-[#F5C742] cursor-pointer shrink-0"
                          checked={checked}
                          onChange={() => toggleRole(role.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleBadge[role.name] || 'bg-slate-100 text-slate-600'}`}>
                            {role.name}
                          </span>
                        </div>
                        {checked && (
                          <button
                            type="button"
                            onClick={e => { e.preventDefault(); setPrimaryRoleId(isPrimary ? null : role.id); }}
                            title={isPrimary ? 'Remove as primary role' : 'Set as primary role'}
                            className="shrink-0 p-0.5 rounded transition-colors">
                            <Star size={14} className={isPrimary ? 'fill-yellow-500 text-yellow-500' : 'text-slate-300 hover:text-yellow-400'} />
                          </button>
                        )}
                      </label>
                    );
                  })}
                </div>
              ) : (
                /* ── Horizontal grid (2 columns) ── */
                <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {allRoles.map(role => {
                    const checked = selectedIds.has(role.id);
                    const isPrimary = primaryRoleId === role.id;
                    return (
                      <label key={role.id}
                        className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all select-none text-center
                          ${checked
                            ? 'border-[#F5C742] bg-yellow-50'
                            : 'border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white'}`}>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleRole(role.id)}
                        />
                        {/* Check tick in top-right corner */}
                        {checked && (
                          <span className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-[#F5C742]">
                            <Check size={10} className="text-slate-900" />
                          </span>
                        )}
                        {/* Star for primary role in bottom-left */}
                        {checked && (
                          <button
                            type="button"
                            onClick={e => { e.preventDefault(); setPrimaryRoleId(isPrimary ? null : role.id); }}
                            title={isPrimary ? 'Remove as primary role' : 'Set as primary role'}
                            className="absolute bottom-1.5 left-1.5 p-0.5 rounded transition-colors">
                            <Star size={12} className={isPrimary ? 'fill-yellow-500 text-yellow-500' : 'text-slate-300 hover:text-yellow-400'} />
                          </button>
                        )}
                        {/* Role initial avatar */}
                        <span className={`w-9 h-9 flex items-center justify-center rounded-full text-sm font-bold ${roleBadge[role.name] || 'bg-slate-100 text-slate-600'}`}>
                          {role.name.charAt(0)}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-700 leading-tight break-words w-full">
                          {role.name.replace(/_/g, ' ')}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {inlineError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md p-2">
                  {inlineError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={handleSaveRoles} disabled={rolesSaving}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-[#F5C742] text-slate-900 hover:bg-yellow-400 disabled:opacity-50 transition-colors">
                  <Save size={13} />
                  {rolesSaving ? 'Saving…' : 'Save Roles'}
                </button>
                <button onClick={() => setShowRoles(false)} disabled={rolesSaving}
                  className="px-4 py-2 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>

          ) : showBranches ? (
            /* ────────── ASSIGN BRANCHES SUB-VIEW (PDF §2.3) ────────── */
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Select extra branches this user may switch into. The user's primary
                branch is always available and doesn't need to be checked here.
              </p>

              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {(branches || []).length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-slate-400">
                    No branches configured.
                  </div>
                ) : (
                  branches.map((b) => {
                    const isPrimary = accessData?.primaryBranchId === b.id
                      || (accessData?.primaryBranchName && b.name && accessData.primaryBranchName === b.name);
                    const checked = selectedBranchIds.has(b.id);
                    return (
                      <label
                        key={b.id}
                        className={`flex items-center gap-3 px-3 py-2 text-xs ${isPrimary ? 'bg-yellow-50' : 'hover:bg-slate-50'} cursor-pointer`}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-yellow-500"
                          checked={checked || isPrimary}
                          disabled={isPrimary}
                          onChange={() => toggleBranch(b.id)}
                        />
                        <div className="flex-1">
                          <div className="font-medium text-slate-700">{b.name}</div>
                          {b.code && <div className="text-[10px] text-slate-400">{b.code}</div>}
                        </div>
                        {isPrimary && (
                          <span className="text-[10px] font-semibold text-yellow-700 px-2 py-0.5 bg-yellow-100 rounded">Primary</span>
                        )}
                        {b.isHeadquarters && (
                          <span className="text-[10px] font-semibold text-indigo-700 px-2 py-0.5 bg-indigo-50 rounded">HQ</span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>

              {inlineError && (
                <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded px-3 py-2">
                  {inlineError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowBranches(false)} disabled={branchesSaving}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSaveBranches} disabled={branchesSaving}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[#F5C742] text-slate-900 hover:bg-yellow-400 disabled:opacity-50 transition-colors">
                  {branchesSaving ? 'Saving…' : 'Save Branches'}
                </button>
              </div>
            </div>

          ) : (
            /* ────────── MAIN ACCESS VIEW ────────── */
            <div className="space-y-4">

              {/* Status */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-xs text-slate-500 font-medium">Account Status</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${statusInfo.cls}`}>
                  {statusInfo.label}
                </span>
              </div>

              {hasUser && accessData.pendingEmployeeActivation && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Login access has been provisioned and will activate automatically when this employee becomes Active.
                </div>
              )}

              {/* User details */}
              {hasUser && (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-400">Email</span>
                    <span className="text-slate-700 font-medium truncate max-w-[200px]">
                      {accessData.linkedEmail || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-50">
                    <span className="text-slate-400">Username</span>
                    <span className="text-slate-600 font-mono">{accessData.linkedUsername}</span>
                  </div>
                  <div className="flex justify-between items-start py-1">
                    <span className="text-slate-400 pt-0.5">Roles</span>
                    <div className="flex flex-wrap gap-1 justify-end max-w-[220px]">
                      {accessData.assignedRoles?.length > 0
                        ? accessData.assignedRoles.map(r => (
                            <span key={r}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${roleBadge[r] || 'bg-slate-100 text-slate-600'}`}>
                              {r}
                            </span>
                          ))
                        : <span className="text-slate-400 italic">None assigned</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Inline error */}
              {inlineError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                  {inlineError}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1">

                {/* No access yet */}
                {!hasUser && (
                  <button onClick={handleCreateAccess} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[#F5C742] text-slate-900 hover:bg-yellow-400 disabled:opacity-50 transition-colors">
                    <UserCheck size={13} /> Create Access
                  </button>
                )}

                {/* Has user — Assign Roles (available whether active or frozen) */}
                {hasUser && (
                  <button onClick={openRoles} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[#F5C742] text-slate-900 hover:bg-yellow-400 disabled:opacity-50 transition-colors">
                    <ShieldCheck size={13} /> Assign Roles
                  </button>
                )}

                {/* Has user — Assign Branches (PDF §2.3 multi-branch) */}
                {hasUser && (
                  <button onClick={openBranches} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                    <Building2 size={13} /> Assign Branches
                  </button>
                )}

                {/* Active-only actions */}
                {hasUser && accessData.userActive && (
                  <button onClick={handleFreeze} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-orange-200 text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition-colors">
                    <Lock size={13} /> Freeze
                  </button>
                )}

                {/* Frozen-only actions */}
                {hasUser && !accessData.userActive && !accessData.pendingEmployeeActivation && (
                  <button onClick={handleUnfreeze} disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-green-200 text-green-600 hover:bg-green-50 disabled:opacity-50 transition-colors">
                    <UserCheck size={13} /> Unfreeze
                  </button>
                )}

                {/* Always available when user exists */}
                {hasUser && (
                  <>
                    <button onClick={handleResetPassword} disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                      <ShieldCheck size={13} /> Reset Password
                    </button>
                    <button onClick={handleDeleteAccess} disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors">
                      <UserX size={13} /> Delete Access
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 5. MAIN COMPONENT (API INTEGRATED)
// ==========================================

const Employees = () => {
  const { canCreate, canEdit, canApprove } = usePermissions();
  const { branches: allBranches } = useBranch();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // Functional area of the page ('employees' | 'approvals' | 'performance') is kept separate
  // from the employee-group filter so workflow views never read as department categories.
  const [activeView, setActiveView] = useState('employees');
  const [activeGroup, setActiveGroup] = useState("All Employees");

  // ── Performance & Targets ────────────────────────────────────────────────
  // All figures come from the server (see useEmployeePerformance / PerformanceTargets);
  // nothing below derives sales, achievement or commission on the client.
  const [performanceMonth, setPerformanceMonth] = useState(() => monthKey());
  const [performanceBranchId, setPerformanceBranchId] = useState(null);
  const [showSetTargets, setShowSetTargets] = useState(false);
  const [setTargetsFocusEmployeeId, setSetTargetsFocusEmployeeId] = useState(null);
  const { performance, performanceLoading, performanceError, reloadPerformance } =
    useEmployeePerformance({ month: performanceMonth, branchId: performanceBranchId });

  const openSetTargets = (employeeId = null) => {
    setSetTargetsFocusEmployeeId(employeeId);
    setShowSetTargets(true);
  };

  // --- REAL STATES ---
  const [employeeData, setEmployeeData] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);

  // Image Viewer State
  const [viewingPhoto, setViewingPhoto] = useState(null);

  // Action Modal State
  const [selectedEmployeeForAction, setSelectedEmployeeForAction] = useState(null);
  const [barcodeEmployee, setBarcodeEmployee] = useState(null);

  // Edit State
  const [employeeToEdit, setEmployeeToEdit] = useState(null);

  // Access Panel State (ADMIN only)
  const [accessPanelEmployee, setAccessPanelEmployee] = useState(null);

  // Details drawer (row click)
  const [detailsEmployee, setDetailsEmployee] = useState(null);

  // --- FILTER & SORT STATE ---
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("All Roles");
  const [filterBranch, setFilterBranch] = useState("All Branches");
  const [filterStatus, setFilterStatus] = useState("All Statuses");
  const [isLoading, setIsLoading] = useState(false);

  // --- 1. Fetch Data on Mount ---
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Parallel Fetch
      const [active, pending] = await Promise.all([
        employeesApi.getActiveEmployees(),
        employeesApi.getPendingApprovals()
      ]);

      setEmployeeData(active.map(mapBackendToFrontend));
      setPendingRequests(pending.map(mapBackendToFrontend));
    } catch (err) {
      console.error("Failed to load employees", err);
    } finally {
      setIsLoading(false);
    }
  };

  // --- 2. Workflow Logic ---

  const handleWorkflowStart = async (formData, avatarFile, isEditMode) => {
    // API call expects a specific structure + file
    const backendPayload = isEditMode
      ? { ...formData }
      : {
          ...formData,
          status: 'Pending',
          workflowStage: 'HR Review'
        };

    try {
      if (isEditMode) {
        // UPDATE LOGIC
        await employeesApi.updateEmployee(formData.id, backendPayload, avatarFile);
        toast.success("Employee updated successfully.");
      } else {
        // CREATE LOGIC
        await employeesApi.createEmployee(backendPayload, avatarFile);
        toast.success("Employee creation initiated. Approval workflow started.");
        setActiveView('approvals'); // Auto-switch to view request
      }

        // Refresh UI
        await fetchData();
        return { ok: true };
      } catch (e) {
        console.error(e);
        // Hand the server's message back to the modal as well as toasting it —
        // the toast disappears, and the user needs to see which field the
        // backend rejected while they fix it.
        const message = e.response?.data?.message || "Error saving employee. Check console.";
        toast.error(message);
        return { ok: false, message };
      }
    };

  // Approval advances ONE stage per call (HR Review → Manager Approval →
  // Accounts Approval → Active), so a request legitimately needs three
  // approvals. Without a pending state and a confirmation the button looked
  // dead, and rapid repeat clicks fired concurrent requests that skipped
  // stages — hence the per-row lock plus the toast naming the new stage.
  const [decidingId, setDecidingId] = useState(null);

  const handleApproveStep = async (id) => {
    if (decidingId) return;
    setDecidingId(id);
    try {
      const updated = await employeesApi.approveEmployee(id);
      await fetchData();

      const stageIndex = WORKFLOW_STAGES.indexOf(updated?.workflowStage);
      if (updated?.status === 'Active') {
        toast.success(`${describeEmployee(updated)} approved and activated.`);
      } else if (stageIndex > 0) {
        toast.success(
          `Approved — now at ${updated.workflowStage} `
          + `(step ${stageIndex + 1} of ${WORKFLOW_STAGES.length - 1}).`
        );
      } else {
        toast.success('Approval recorded.');
      }
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.message || 'Error approving request.');
    } finally {
      setDecidingId(null);
    }
  };

  const handleReject = async (id) => {
    if (decidingId) return;
    if (window.confirm("Are you sure you want to reject this request?")) {
      setDecidingId(id);
      try {
        await employeesApi.rejectEmployee(id);
        await fetchData();
        toast.success('Request rejected.');
      } catch (e) {
        console.error(e);
        toast.error(e.response?.data?.message || 'Error rejecting request.');
      } finally {
        setDecidingId(null);
      }
    }
  };

  const handleDeactivateEmployee = async (id) => {
    if (window.confirm("Are you sure you want to deactivate this employee?")) {
      try {
        // Call API to deactivate
        await employeesApi.deactivateEmployee(id);
        setSelectedEmployeeForAction(null); // Close modal
        fetchData(); // Refresh list
      } catch (e) {
        console.error("Deactivation failed", e);
        alert("Failed to deactivate employee");
      }
    }
  };

  const handleActivateEmployee = async (id) => {
    if (window.confirm("Are you sure you want to re-activate this employee?")) {
      try {
        // Call API to activate
        await employeesApi.activateEmployee(id);
        setSelectedEmployeeForAction(null); // Close modal
        fetchData(); // Refresh list
      } catch (e) {
        console.error("Activation failed", e);
        alert("Failed to activate employee");
      }
    }
  };

  const handleEditProfile = async (employee) => {
    try {
      const fullEmployee = await employeesApi.getEmployeeById(employee.id);
      setEmployeeToEdit(fullEmployee); // backend object ✅
      setDetailsEmployee(null);
      setIsAddModalOpen(true);
    } catch (e) {
      alert("Failed to load employee details");
    }
  };

  const openAddModal = () => {
    setEmployeeToEdit(null); // Ensure clean state for adding
    setIsAddModalOpen(true);
  };

  // --- 3. Mapper Helper ---
  const mapBackendToFrontend = (emp) => ({
    id: emp.id,
    name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Unnamed Employee',
    code: emp.employeeCode || EMPTY_DATA_LABEL,
    // Raw, un-placeholdered copies. `code`/`role` above are display values that fall back to
    // '--', which must never be encoded into a barcode or printed on an ID card.
    employeeCode: emp.employeeCode || '',
    rawRole: emp.role || '',
    role: emp.role || EMPTY_DATA_LABEL,
    dept: emp.department || EMPTY_DATA_LABEL,
    branch: emp.branch || '',
    sales: null,
    avg: null,
    bills: null,
    disc: null,
    ret: null,
    target: null,
    status: emp.status,
    stage: emp.workflowStage,
    submittedAt: formatDisplayDate(emp.submittedAt),
    initials: (emp.firstName?.[0] || "") + (emp.lastName?.[0] || ""),
    color: emp.status === 'Active' ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-600",
    // Construct Full Image URL
    avatar: emp.avatarUrl ? getImageUrl(emp.avatarUrl) : null,
    // Raw fields needed by EmployeeAccessPanel for user creation
    email: emp.email,
    rawEmail: emp.email,
    rawPhone: emp.phone,
  });

  // --- 4. Filtering Logic (New) ---

  // Extract unique roles/branches for dropdowns from active employees
  const availableRoles = useMemo(() => ["All Roles", ...buildUniqueOptions(employeeData.map((employee) => employee.role))], [employeeData]);
  const availableBranches = useMemo(() => ["All Branches", ...buildUniqueOptions(employeeData.map((employee) => employee.branch))], [employeeData]);

  const employeeSuggestions = useMemo(() => (
    [...employeeData, ...pendingRequests]
  ), [employeeData, pendingRequests]);

  const modalRoleOptions = useMemo(() => (
    buildUniqueOptions(employeeSuggestions.map((employee) => employee.role))
  ), [employeeSuggestions]);

  const modalDepartmentOptions = useMemo(() => (
    buildUniqueOptions(employeeSuggestions.map((employee) => employee.dept))
  ), [employeeSuggestions]);

  const managerOptions = useMemo(() => (
    buildUniqueOptions(
      employeeData
        .filter((employee) => employee.status === 'Active')
        .map((employee) => employee.name)
    )
  ), [employeeData]);

  const isApprovalsView = activeView === 'approvals';

  const filteredEmployees = useMemo(() => {
    // Determine source data
    let data = isApprovalsView ? pendingRequests : employeeData;

    // 1. Employee group (department) filter — employee list only
    if (!isApprovalsView && activeGroup !== "All Employees") {
      data = data.filter(e => e.dept === activeGroup);
    }

    // 2. Search Filter (Search by Name, Code, or Role)
    if (searchTerm.trim() !== "") {
      const lowerSearch = searchTerm.toLowerCase();
      data = data.filter(e =>
        e.name.toLowerCase().includes(lowerSearch) ||
        e.code.toLowerCase().includes(lowerSearch) ||
        e.role.toLowerCase().includes(lowerSearch)
      );
    }

    // 3. Role Filter
    if (filterRole !== "All Roles") {
      data = data.filter(e => e.role === filterRole);
    }

    // 4. Branch Filter
    if (filterBranch !== "All Branches") {
      data = data.filter(e => e.branch === filterBranch);
    }

    // 5. Status Filter — employee list only (every approval request is Pending)
    if (!isApprovalsView && filterStatus !== "All Statuses") {
      data = data.filter(e => e.status === filterStatus);
    }

    return data;
  }, [employeeData, pendingRequests, isApprovalsView, activeGroup, searchTerm, filterRole, filterBranch, filterStatus]);

  // Client-side pagination for both the employees and access-requests tabs.
  const LIST_PAGE_SIZE = 30;
  const [listPage, setListPage] = useState(0);
  useEffect(() => { setListPage(0); }, [activeView, activeGroup, searchTerm, filterRole, filterBranch, filterStatus]);
  const pagedEmployees = useMemo(
    () => filteredEmployees.slice(listPage * LIST_PAGE_SIZE, (listPage + 1) * LIST_PAGE_SIZE),
    [filteredEmployees, listPage]
  );


  // --- 5. Dynamic Stats & Groups ---
  // Employee groups are department filters only. Workflow areas (approvals, performance) are
  // separate views selected from the tab strip, never mixed into this list.
  const employeeGroups = [
    { name: "All Employees", count: employeeData.length },
    { name: "Store Team", count: employeeData.filter(e => e.dept === 'Store Team').length },
    { name: "Warehouse Team", count: employeeData.filter(e => e.dept === 'Warehouse Team').length },
    { name: "Management", count: employeeData.filter(e => e.dept === 'Management').length },
    { name: "Back Office", count: employeeData.filter(e => e.dept === 'Back Office').length },
  ];

  const totalEmployees = employeeData.length;
  const activeEmployees = employeeData.filter((employee) => employee.status === "Active").length;
  const inactiveEmployees = employeeData.filter((employee) => employee.status === "Inactive").length;
  const pendingApprovalCount = pendingRequests.length;
  const activePercent = totalEmployees > 0 ? Math.round((activeEmployees / totalEmployees) * 100) : null;

  // The performance month is selectable (Performance & Targets view), so only call it MTD when
  // it really is the current month.
  const isCurrentPerformanceMonth = performanceMonth === monthKey();
  const performancePeriodLabel = isCurrentPerformanceMonth ? 'MTD' : monthLabel(performanceMonth);

  // Server-computed per-employee rows, keyed for the employee table and drawer. Nothing is
  // derived here — the table only looks up the row the server already sent.
  const performanceByEmployeeId = useMemo(() => {
    const map = new Map();
    (performance?.rows || []).forEach((row) => map.set(row.employeeId, row));
    return map;
  }, [performance]);

  // One page-level explanation instead of repeating "not connected" on every row.
  const performanceNotice = performanceLoading
    ? null
    : performanceError
      ? `${performanceError} Sales and target columns show “${EMPTY_DATA_LABEL}”.`
      : !performance
        ? `Sales data is unavailable. Sales and target columns show “${EMPTY_DATA_LABEL}”.`
        : null;

  const statsData = [
    {
      label: "Total Employees",
      value: totalEmployees.toString(),
      subValue: pendingApprovalCount > 0 ? `${pendingApprovalCount} pending approval${pendingApprovalCount === 1 ? '' : 's'}` : `${totalEmployees} on roster`,
      trend: pendingApprovalCount > 0 ? 'warning' : 'neutral',
      icon: Users,
      color: STAT_COLORS.primary
    },
    {
      label: "Active Employees",
      value: activeEmployees.toString(),
      subValue: activePercent == null
        ? null
        : `${activePercent}% active${inactiveEmployees > 0 ? ` · ${inactiveEmployees} inactive` : ''}`,
      trend: 'neutral',
      icon: Activity,
      color: STAT_COLORS.success
    },
    {
      // Server-computed SUM(invoiceTotal) of invoices WITH a salesperson, for the SELECTED month.
      // Invoices with no salesperson (back-office and historical ones included) are not in this figure.
      label: "Attributed Sales",
      value: performance ? <CurrencyAmount value={performance.totalSales} decimals={0} /> : EMPTY_DATA_LABEL,
      subValue: performance
        ? `${performancePeriodLabel} · ${performance.totalBills} bill(s)`
        : (performanceLoading ? 'Loading…' : 'Unavailable'),
      trend: 'neutral',
      icon: DollarSign,
      color: STAT_COLORS.purple
    },
    {
      // SUM(sales) / SUM(target) from the server — deliberately not the mean of the
      // per-employee percentages, and suppressed entirely under a single-branch filter
      // because a branch's sales are not comparable to a global target.
      label: "Overall Achievement",
      value: performance?.overallAchievementPercent != null
        ? `${Number(performance.overallAchievementPercent).toFixed(0)}%`
        : EMPTY_DATA_LABEL,
      subValue: performance
        ? (performance.branchFiltered
            ? 'Not shown for a single branch'
            : <>Target: <CurrencyAmount value={performance.totalTarget} decimals={0} /></>)
        : (performanceLoading ? 'Loading…' : 'No targets set'),
      trend: 'neutral',
      icon: Target,
      color: STAT_COLORS.warning
    },
  ];

  const detailsPerformanceRow = detailsEmployee ? performanceByEmployeeId.get(detailsEmployee.id) : null;

  const renderStageBadge = (stage) => {
    const stageLabel = stage || EMPTY_DATA_LABEL;
    const stages = WORKFLOW_STAGES;
    const index = stages.indexOf(stageLabel);

    if (index === -1) {
      return (
        <span className="text-xs font-semibold text-slate-700">{stageLabel}</span>
      );
    }

    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-700">{stageLabel}</span>
        <div className="flex gap-1">
          {stages.map((s, i) => (
            <div key={s} className={`h-1.5 w-6 rounded-full ${i <= index ? 'bg-green-500' : 'bg-slate-200'}`}></div>
          ))}
        </div>
        {/* Spell out that approval is a multi-step ladder, so a single click
            moving the badge one notch does not read as a failed action. */}
        <span className="text-[10px] text-slate-400">
          {index < stages.length - 1
            ? `${stages.length - 1 - index} approval${stages.length - 2 - index ? 's' : ''} remaining`
            : 'Fully approved'}
        </span>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#F7F7FA] font-sans relative">

      {/* ACTION MODAL */}
      <ActionModal
        employee={selectedEmployeeForAction}
        onClose={() => setSelectedEmployeeForAction(null)}
        onDeactivate={handleDeactivateEmployee}
        onActivate={handleActivateEmployee}
        onEdit={handleEditProfile}
        onSetTarget={openSetTargets}
        onManageAccess={setAccessPanelEmployee}
        onPrintBarcode={(emp) => setBarcodeEmployee({
          name: emp.name,
          employeeCode: emp.employeeCode || '',
          role: emp.rawRole || '',
        })}
      />

      {/* EMPLOYEE ID CARD (barcode preview + print) */}
      <EmployeeBarcodeCard
        open={!!barcodeEmployee}
        employee={barcodeEmployee}
        onClose={() => setBarcodeEmployee(null)}
      />

      {/* EMPLOYEE DETAILS DRAWER (row click) */}
      <EmployeeDetailsDrawer
        key={detailsEmployee?.id ?? 'none'}
        employee={detailsEmployee}
        performanceRow={detailsPerformanceRow}
        performancePeriodLabel={performancePeriodLabel}
        performanceNotice={performanceNotice}
        onClose={() => setDetailsEmployee(null)}
        onEdit={handleEditProfile}
        onSetTarget={(id) => { setDetailsEmployee(null); openSetTargets(id); }}
        onManageAccess={(emp) => { setDetailsEmployee(null); setAccessPanelEmployee(emp); }}
        onViewPhoto={setViewingPhoto}
      />

      {/* Set Targets grid — the employee roster comes from the same server payload the
          Performance & Targets view renders, so the two can never disagree. */}
      <SetTargetsModal
        open={showSetTargets}
        onClose={() => { setShowSetTargets(false); setSetTargetsFocusEmployeeId(null); }}
        month={performanceMonth}
        onMonthChange={setPerformanceMonth}
        rows={performance?.rows || []}
        loading={performanceLoading}
        focusEmployeeId={setTargetsFocusEmployeeId}
        onSaved={reloadPerformance}
      />

      {/* IMAGE VIEWER MODAL OVERLAY */}
      {viewingPhoto && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setViewingPhoto(null)}
        >
          <div className="relative max-w-full max-h-full">
            <img
              src={viewingPhoto}
              alt="Employee Full View"
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors"
              onClick={() => setViewingPhoto(null)}
            >
              <X size={32} />
            </button>
          </div>
        </div>
      )}

      {/* ADD / EDIT EMPLOYEE MODAL */}
      <AddEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onWorkflowStart={handleWorkflowStart}
        employeeToEdit={employeeToEdit}
        managerOptions={managerOptions}
        roleOptions={modalRoleOptions}
        departmentOptions={modalDepartmentOptions}
      />

      {/* EMPLOYEE ACCESS PANEL (ADMIN only) */}
      {accessPanelEmployee && (
        <EmployeeAccessPanel
          employee={accessPanelEmployee}
          onClose={() => setAccessPanelEmployee(null)}
        />
      )}

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col w-full min-w-0">
        <div className="p-4 md:p-6 space-y-4">

          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Users className="text-[#F5C742]" size={22} /> Employees & Roles
              </h1>
              <p className="text-sm text-slate-500">Manage employees, roles, branch access and workforce information</p>
            </div>

            <div className="flex flex-wrap gap-2 w-full lg:w-auto">
              {/* Import / Export are intentionally not rendered until they have real handlers. */}
              {/* ── VERTICAL: canEdit('hr') for Set Targets ── */}
              {canEdit('hr') && (
                <button
                  onClick={() => openSetTargets(null)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm text-slate-600 hover:bg-slate-50 whitespace-nowrap transition-colors">
                  <Target size={16} /> Set Targets
                </button>
              )}
              {/* ── VERTICAL: canCreate('hr') for Add Employee ── */}
              {canCreate('hr') && (
                <button
                  onClick={openAddModal}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#F5C742] rounded-md text-sm font-semibold text-slate-900 hover:bg-yellow-400 whitespace-nowrap shadow-sm transition-colors"
                >
                  <Plus size={16} /> Add Employee
                </button>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {statsData.map((stat) => (
              <StatCard
                key={stat.label}
                label={stat.label}
                value={stat.value}
                subValue={stat.subValue}
                trend={stat.trend}
                icon={stat.icon}
                color={stat.color}
              />
            ))}
          </div>

          {/* Workspace views — functional areas, deliberately separate from the employee groups */}
          {/* The bottom rule is an inset shadow rather than a border so the tabs need no -mb-px
              overlap; with overflow-y hidden that overlap would otherwise be clipped, and
              without it the 1px spill made the browser draw a vertical scrollbar. */}
          <div className={`flex items-center gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-slate-200)] ${HIDE_SCROLLBAR}`} role="tablist">
            {[
              { id: 'employees', label: 'Employees', count: totalEmployees, icon: Users },
              { id: 'approvals', label: 'Pending Approvals', count: pendingApprovalCount > 0 ? pendingApprovalCount : null, icon: ShieldCheck, highlight: pendingApprovalCount > 0 },
              { id: 'performance', label: 'Performance & Targets', count: null, icon: BarChart3 },
            ].map((view) => {
              const isActive = activeView === view.id;
              return (
                <button
                  key={view.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveView(view.id)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${isActive
                    ? 'border-[#F5C742] text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  <view.icon size={15} className={isActive ? 'text-slate-700' : 'text-slate-400'} />
                  {view.label}
                  {view.count != null && (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${view.highlight ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      {view.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Performance & Targets — its own view, not a variant of the employee table:
              every column is a server-computed figure for a month/branch rather than a
              property of the employee record. */}
          {activeView === 'performance' ? (
            <PerformanceTargets
              month={performanceMonth}
              onMonthChange={setPerformanceMonth}
              branches={allBranches || []}
              branchId={performanceBranchId}
              onBranchChange={setPerformanceBranchId}
              performance={performance}
              loading={performanceLoading}
              error={performanceError}
              canEditTargets={canEdit('hr')}
              onOpenSetTargets={() => openSetTargets(null)}
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden min-w-0">

              {/* Employee groups (department filter) */}
              {!isApprovalsView && (
                <div className={`px-3 pt-3 overflow-x-auto overflow-y-hidden ${HIDE_SCROLLBAR}`}>
                  <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
                    {employeeGroups.map((group) => {
                      const isActive = activeGroup === group.name;
                      return (
                        <button
                          key={group.name}
                          onClick={() => setActiveGroup(group.name)}
                          aria-pressed={isActive}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${isActive
                            ? 'bg-white text-slate-900 font-semibold shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          {group.name}
                          <span className={`text-[10px] px-1.5 rounded-full ${isActive ? 'bg-[#F5C742]/30 text-slate-800' : 'bg-slate-200 text-slate-500'}`}>
                            {group.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Search & filters */}
              <div className="p-3 flex flex-col md:flex-row gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search by name, code or role..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 placeholder:text-slate-400"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <FilterSelect label="Filter by role" value={filterRole} options={availableRoles} onChange={setFilterRole} />
                  <FilterSelect label="Filter by branch" value={filterBranch} options={availableBranches} onChange={setFilterBranch} />
                  {!isApprovalsView && (
                    <FilterSelect label="Filter by status" value={filterStatus} options={STATUS_FILTER_OPTIONS} onChange={setFilterStatus} />
                  )}
                </div>
              </div>

              {/* Single sales-data notice instead of a repeated per-row message */}
              {!isApprovalsView && performanceNotice && (
                <div className="mx-3 mb-3 flex items-start gap-2 px-3 py-2 rounded-md bg-[#FFF8E7] border border-[#FDE6A9] text-xs text-slate-600">
                  <Info size={14} className="mt-0.5 shrink-0 text-[#F5C742]" />
                  <span>{performanceNotice}</span>
                </div>
              )}

              <div className="overflow-x-auto border-t border-slate-200">

                {isApprovalsView ? (
                  /* ==================================== */
                  /* APPROVAL WORKFLOW TABLE VIEW         */
                  /* ==================================== */
                  <table className="bb-nowrap-table w-full text-sm text-left">
                    <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold text-xs uppercase whitespace-nowrap">Pending Employee</th>
                        <th className="px-4 py-3 font-semibold text-xs uppercase whitespace-nowrap">Role / Dept</th>
                        <th className="px-4 py-3 font-semibold text-xs uppercase whitespace-nowrap">Workflow Stage</th>
                        <th className="px-4 py-3 font-semibold text-xs uppercase whitespace-nowrap">Submission Date</th>
                        <th className="px-4 py-3 font-semibold text-xs uppercase text-right whitespace-nowrap">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isLoading && <TableSkeleton cols={5} rows={8} />}
                      {!isLoading && filteredEmployees.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-12 text-center text-slate-400">
                            <div className="flex flex-col items-center gap-2">
                              <CheckCircle2 size={32} className="text-slate-200" />
                              <p>No pending approvals found matching filters.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        pagedEmployees.map((req) => (
                          <tr key={req.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <EmployeeAvatar employee={req} onClick={setViewingPhoto} />
                                <div>
                                  <div className="font-medium text-slate-800">{req.name}</div>
                                  <div className="text-xs text-slate-400 font-mono">{req.code}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-slate-800">{req.role}</div>
                              <div className="text-xs text-slate-500">{req.dept}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {renderStageBadge(req.stage)}
                            </td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                              {req.submittedAt}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {/* ── VERTICAL: canApprove('hr') ── */}
                              {canApprove('hr') ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleReject(req.id)}
                                    disabled={Boolean(decidingId)}
                                    className="p-1.5 rounded-full text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="Reject"
                                  >
                                    <XIcon size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleApproveStep(req.id)}
                                    disabled={Boolean(decidingId)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                  >
                                    {decidingId === req.id
                                      ? <><Loader2 size={14} className="animate-spin" /> Working…</>
                                      : <><Check size={14} /> {approveButtonLabel(req.stage)}</>}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded">No approve permission</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                ) : (
                  /* ==================================== */
                  /* STANDARD EMPLOYEE TABLE VIEW         */
                  /* ==================================== */
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[#F7F7FA] text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold text-xs uppercase whitespace-nowrap">Employee</th>
                        <th className="hidden md:table-cell px-4 py-2.5 font-semibold text-xs uppercase whitespace-nowrap">Role / Department</th>
                        <th className="hidden lg:table-cell px-4 py-2.5 font-semibold text-xs uppercase whitespace-nowrap">Branch</th>
                        <th className="hidden md:table-cell px-4 py-2.5 font-semibold text-xs uppercase text-right whitespace-nowrap">Sales ({performancePeriodLabel})</th>
                        <th className="hidden md:table-cell px-4 py-2.5 font-semibold text-xs uppercase whitespace-nowrap">Target / Achievement</th>
                        <th className="px-4 py-2.5 font-semibold text-xs uppercase whitespace-nowrap">Status</th>
                        <th className="px-4 py-2.5 font-semibold text-xs uppercase text-right whitespace-nowrap w-12"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isLoading && <TableSkeleton cols={7} rows={8} />}
                      {!isLoading && filteredEmployees.length === 0 ? (
                        <tr><td colSpan="7" className="px-6 py-12 text-center text-slate-400">No employees found matching filters.</td></tr>
                      ) : (
                        pagedEmployees.map((emp) => {
                          const perf = performanceByEmployeeId.get(emp.id);
                          const missingPerfReason = performanceNotice
                            ? 'Sales data unavailable'
                            : performanceLoading
                              ? 'Loading…'
                              : 'No sales/target record for this employee in this period';
                          return (
                            <tr
                              key={emp.id}
                              tabIndex={0}
                              onClick={() => setDetailsEmployee(emp)}
                              onKeyDown={(e) => { if (e.key === 'Enter') setDetailsEmployee(emp); }}
                              className="hover:bg-slate-50 transition-colors cursor-pointer focus:outline-none focus-visible:bg-yellow-50"
                            >
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-3 min-w-0">
                                  <EmployeeAvatar employee={emp} onClick={setViewingPhoto} />
                                  <div className="min-w-0">
                                    <div className="font-medium text-slate-800 truncate">{emp.name}</div>
                                    <div className="text-xs text-slate-400 font-mono">{emp.code}</div>
                                    <div className="md:hidden text-xs text-slate-500 truncate">{emp.role}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="hidden md:table-cell px-4 py-2.5">
                                <div className="text-slate-800 text-xs font-medium truncate max-w-[12rem]" title={emp.role}>{emp.role}</div>
                                <div className="text-xs text-slate-500 truncate max-w-[12rem]" title={emp.dept}>{emp.dept}</div>
                              </td>
                              <td className="hidden lg:table-cell px-4 py-2.5 text-slate-600">
                                <div className="flex items-center gap-1 text-xs max-w-[14rem]" title={emp.branch || 'Unassigned'}>
                                  <Store size={12} className="text-slate-400 shrink-0" />
                                  <span className="truncate">{emp.branch || 'Unassigned'}</span>
                                </div>
                              </td>
                              <td className="hidden md:table-cell px-4 py-2.5 text-right whitespace-nowrap">
                                {perf ? (
                                  <span className="font-medium text-slate-800"><CurrencyAmount value={perf.sales} decimals={0} /></span>
                                ) : (
                                  <span className="text-slate-400" title={missingPerfReason}>{EMPTY_DATA_LABEL}</span>
                                )}
                              </td>
                              <td className="hidden md:table-cell px-4 py-2.5 whitespace-nowrap">
                                {perf?.achievementPercent != null ? (
                                  <div className="w-28">
                                    <div className="flex items-baseline justify-between gap-2">
                                      <span className="text-xs font-semibold text-slate-800">{achievementText(perf.achievementPercent)}</span>
                                      {perf.targetAmount != null && (
                                        <span className="text-[10px] text-slate-400 truncate">
                                          of <CurrencyAmount value={perf.targetAmount} decimals={0} />
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-1 w-full bg-slate-100 rounded-full h-1.5">
                                      <div
                                        className="bg-[#F5C742] h-1.5 rounded-full"
                                        style={{ width: `${Math.min(100, Math.max(0, Number(perf.achievementPercent)))}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span
                                    className="text-xs text-slate-400"
                                    title={!perf
                                      ? missingPerfReason
                                      : performance?.branchFiltered
                                        ? 'Achievement is not shown for a single-branch view'
                                        : 'No target set'}
                                  >
                                    {perf && perf.targetAmount == null ? 'No target' : EMPTY_DATA_LABEL}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <StatusBadge status={emp.status} />
                              </td>
                              <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEmployeeForAction(emp);
                                  }}
                                  aria-label={`Actions for ${emp.name}`}
                                  className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors"
                                >
                                  <MoreVertical size={18} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </div>
              <PaginationFooter
                page={listPage}
                size={LIST_PAGE_SIZE}
                totalElements={filteredEmployees.length}
                totalPages={Math.ceil(filteredEmployees.length / LIST_PAGE_SIZE)}
                onPageChange={setListPage}
              />
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

export default Employees;
