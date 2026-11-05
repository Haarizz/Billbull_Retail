// Data model, option lists and validation for the Add / Edit Employee wizard.
// Pure functions only, so the rules can be tested without rendering the modal.

import { validatePassword } from '../../../../utils/passwordValidation';

// ---------------------------------------------------------------------------
// Generic helpers (also used by the Employees list page)
// ---------------------------------------------------------------------------

export const normalizeOptionLabel = (value) => (typeof value === 'string' ? value.trim() : '');

export const buildUniqueOptions = (...collections) => {
  const seen = new Set();
  return collections.flat(Infinity).reduce((options, value) => {
    const normalized = normalizeOptionLabel(value);
    if (!normalized) return options;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return options;
    seen.add(key);
    options.push(normalized);
    return options;
  }, []);
};

export const findBranchByName = (branches, branchName) => {
  const wanted = normalizeOptionLabel(branchName).toLowerCase();
  if (!wanted) return null;
  return branches.find((branch) => normalizeOptionLabel(branch?.name).toLowerCase() === wanted) || null;
};

export const hasFilledValue = (value) => {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  return Boolean(value);
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Today as yyyy-mm-dd in local time (toISOString would give UTC). */
export const todayIso = (now = new Date()) => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseIsoDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
};

const toIso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Join date + probation months, clamped to the end of the month
 * (31 Jan + 1 month = 28/29 Feb). '' when either input is missing or invalid.
 */
export const computeConfirmationDate = (joinDate, probationMonths) => {
  const start = parseIsoDate(joinDate);
  if (!start || !hasFilledValue(probationMonths)) return '';
  const months = Number(probationMonths);
  if (!Number.isInteger(months) || months < 0) return '';
  const monthIndex = start.m - 1 + months;
  const y = start.y + Math.floor(monthIndex / 12);
  const m = (monthIndex % 12) + 1;
  const lastDay = new Date(y, m, 0).getDate();
  return toIso(y, m, Math.min(start.d, lastDay));
};

/** Whole days from `today` to `isoDate` (negative when in the past), or null. */
export const daysUntil = (isoDate, today = todayIso()) => {
  const target = parseIsoDate(isoDate);
  const base = parseIsoDate(today);
  if (!target || !base) return null;
  const ms = Date.UTC(target.y, target.m - 1, target.d) - Date.UTC(base.y, base.m - 1, base.d);
  return Math.round(ms / 86400000);
};

export const EXPIRY_WARNING_DAYS = 60;

/** 'expired' | 'soon' | 'valid' | null for a document expiry date. */
export const expiryState = (isoDate, today) => {
  const days = daysUntil(isoDate, today);
  if (days === null) return null;
  if (days < 0) return 'expired';
  if (days <= EXPIRY_WARNING_DAYS) return 'soon';
  return 'valid';
};

// Date of Birth is optional, but a supplied one has to be a plausible birth
// date. Bounds mirror EmployeeServiceImpl.MIN/MAX_EMPLOYEE_AGE.
export const MIN_EMPLOYEE_AGE = 18;
export const MAX_EMPLOYEE_AGE = 100;

const yearsAgo = (years) => {
  const now = new Date();
  now.setFullYear(now.getFullYear() - years);
  return todayIso(now);
};

export const dobMax = () => yearsAgo(MIN_EMPLOYEE_AGE);
export const dobMin = () => yearsAgo(MAX_EMPLOYEE_AGE);

export const validateDateOfBirth = (value) => {
  if (!hasFilledValue(value)) return '';
  const dob = String(value).trim();
  if (!parseIsoDate(dob)) return 'Not a valid date';
  if (dob > todayIso()) return 'Cannot be in the future';
  if (dob > dobMax()) return `Employee must be at least ${MIN_EMPLOYEE_AGE} years old`;
  if (dob < dobMin()) return `Cannot be more than ${MAX_EMPLOYEE_AGE} years ago`;
  return '';
};

// ---------------------------------------------------------------------------
// Option lists
// ---------------------------------------------------------------------------

export const GENDER_OPTIONS = ['Male', 'Female'];

export const NATIONALITY_OPTIONS = [
  'United Arab Emirates', 'India', 'Pakistan', 'Bangladesh', 'Philippines', 'Egypt',
  'Sri Lanka', 'Nepal', 'Jordan', 'Lebanon', 'Syria', 'Saudi Arabia', 'Oman',
  'United States', 'United Kingdom', 'Other',
];

export const DEFAULT_DEPARTMENTS = [
  'Store Team', 'Warehouse Team', 'Management', 'Back Office', 'Sales',
  'Finance & Accounts', 'HR', 'IT', 'Operations', 'Procurement',
];

export const EMPLOYMENT_TYPES = ['Full Time', 'Part Time'];
export const SALARY_TYPES = ['Monthly', 'Hourly'];
export const SHIFT_OPTIONS = ['Morning', 'Evening', 'Night', 'Flexible', 'Split'];

export const WORK_DAY_OPTIONS = [
  { value: 'Mon-Fri', label: 'Monday – Friday' },
  { value: 'Mon-Sat', label: 'Monday – Saturday' },
  { value: 'Sat-Thu', label: 'Saturday – Thursday' },
  { value: 'Sun-Thu', label: 'Sunday – Thursday' },
  { value: 'Mon-Sun', label: '7 days' },
];

export const LEAVE_POLICY_OPTIONS = [
  { value: 'Standard UAE', label: 'Standard UAE (30 days annual)' },
  { value: 'GCC Standard', label: 'GCC Standard' },
  { value: 'Probation', label: 'Probation (no leave)' },
  { value: 'Custom', label: 'Custom' },
];

export const VISA_TYPE_OPTIONS = [
  { value: 'Employment', label: 'Employment visa' },
  { value: 'Residency', label: 'Residency visa' },
  { value: 'Visit', label: 'Visit visa' },
  { value: 'Citizen', label: 'UAE citizen' },
];

export const PERMISSION_PROFILES = ['Role-based (Auto)', 'Custom'];

export const PRESET_TAGS = ['Keyholder', 'Night Shift', 'Cash Handling', 'Driver'];

// GET /api/roles is ADMIN-only, so a non-admin HR user falls back to this list.
// The salesperson designations are listed here as well as seeded in
// RBACInitializer, otherwise HR users could never pick them.
export const FALLBACK_ROLES = [
  'ADMIN', 'SALES', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'CASHIER',
  'DELIVERY_PERSON', 'SALESPERSON', 'CASHIER_SALESPERSON',
];

// Raw RBAC role name -> designation stored in employees.role. Kept in step with
// the backend's SalespersonEligibility, which accepts both forms.
const EMPLOYEE_ROLE_LABELS = {
  DELIVERY_PERSON: 'Delivery Person',
  SALESPERSON: 'Salesperson',
  CASHIER_SALESPERSON: 'Cashier + Salesperson',
};

export const designationForRole = (roleName = '') => EMPLOYEE_ROLE_LABELS[roleName] || roleName;

export const parseTags = (tags) => (tags ? String(tags).split(',').map((t) => t.trim()).filter(Boolean) : []);

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

export const DRAFT_KEY = 'employee_form_draft';

export const generateEmployeeCode = () => `EMP${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

/** Repeated digits or a run up/down the keypad (wrapping 9-0). Mirrors PosPinPolicy.isTrivial. */
export const isTrivialPin = (pin) => {
  const digits = String(pin || '').split('').map(Number);
  if (digits.length < 2) return false;
  const steps = digits.slice(1).map((d, i) => (((d - digits[i]) % 10) + 10) % 10);
  return steps.every((x) => x === 0) || steps.every((x) => x === 1) || steps.every((x) => x === 9);
};

export const generatePosPin = () => {
  let pin;
  do { pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); } while (isTrivialPin(pin));
  return pin;
};

export const buildInitialEmployeeForm = (defaultBranchName = '') => ({
  // Personal
  firstName: '',
  middleName: '',
  lastName: '',
  employeeCode: generateEmployeeCode(),
  gender: 'Male',
  dateOfBirth: '',
  nationality: '',
  phone: '',
  email: '',
  currentAddress: '',
  emergencyContactName: '',
  emergencyContactRelation: '',
  emergencyContactPhone: '',
  // Employment
  role: '',
  department: '',
  branch: defaultBranchName,
  reportingManager: '',
  workLocation: '',
  employmentType: 'Full Time',
  joinDate: todayIso(),
  probationPeriod: '3',
  // Access
  posAccess: true,
  posPin: '',
  hasExistingPin: false, // UI-only: the employee already has a PIN on file
  permissionProfile: 'Role-based (Auto)',
  additionalBranchIds: [],
  additionalWarehouseIds: [],
  // Pay & schedule
  salaryType: 'Monthly',
  basicSalary: '',
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
  // Notes
  hrNotes: '',
  tags: '',
  // Login provisioning (UI-only, sent as `loginAccess`)
  createLoginAccess: false,
  loginUsername: '',
  temporaryPassword: '',
  systemRoleId: '',
});

const parseIdList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(Number).filter(Boolean);
  return String(value).split(',').map(Number).filter(Boolean);
};

const str = (value) => (value === null || value === undefined ? '' : String(value));

/** Form state for an existing employee record. Every persisted field must be
 *  mapped: the update endpoint copies all of them, so a missing one is wiped. */
export const buildFormFromEmployee = (emp, defaultBranchName = '') => ({
  ...buildInitialEmployeeForm(defaultBranchName),
  firstName: str(emp.firstName),
  middleName: str(emp.middleName),
  lastName: str(emp.lastName),
  employeeCode: str(emp.employeeCode),
  gender: emp.gender || 'Male',
  dateOfBirth: str(emp.dateOfBirth),
  nationality: str(emp.nationality),
  phone: str(emp.phone),
  email: str(emp.email),
  currentAddress: str(emp.currentAddress),
  emergencyContactName: str(emp.emergencyContactName),
  emergencyContactRelation: str(emp.emergencyContactRelation),
  emergencyContactPhone: str(emp.emergencyContactPhone),
  role: str(emp.role),
  department: str(emp.department),
  branch: str(emp.branch),
  reportingManager: str(emp.reportingManager),
  workLocation: str(emp.workLocation),
  employmentType: emp.employmentType || 'Full Time',
  joinDate: str(emp.joinDate),
  probationPeriod: str(emp.probationPeriod),
  posAccess: emp.posAccess ?? true,
  posPin: '', // never sent by the server; typing one replaces the stored PIN
  hasExistingPin: Boolean(emp.hasPosPin),
  permissionProfile: str(emp.permissionProfile),
  additionalBranchIds: parseIdList(emp.additionalBranchIds),
  additionalWarehouseIds: parseIdList(emp.additionalWarehouseIds),
  salaryType: emp.salaryType || 'Monthly',
  basicSalary: str(emp.basicSalary),
  shiftType: str(emp.shiftType),
  workDays: emp.workDays || 'Mon-Fri',
  weeklyOffDays: emp.weeklyOffDays ?? 2,
  leavePolicy: str(emp.leavePolicy),
  emiratesId: str(emp.emiratesId),
  expiryDate: str(emp.emiratesIdExpiry),
  passportNumber: str(emp.passportNumber),
  passportIssueDate: str(emp.passportIssueDate),
  passportExpiryDate: str(emp.passportExpiryDate),
  visaType: str(emp.visaType),
  visaNumber: str(emp.visaNumber),
  visaExpiryDate: str(emp.visaExpiryDate),
  hrNotes: str(emp.hrNotes),
  tags: str(emp.tags),
});

// ---------------------------------------------------------------------------
// Sections & validation
// ---------------------------------------------------------------------------

export const SECTIONS = [
  { id: 'personal', label: 'Personal', description: 'Name, contact, emergency contact' },
  { id: 'employment', label: 'Employment', description: 'Role, branch, probation' },
  { id: 'access', label: 'Access', description: 'POS, login, branch access' },
  { id: 'pay', label: 'Pay & schedule', description: 'Salary, shift, leave' },
  { id: 'documents', label: 'Documents', description: 'Emirates ID, passport, visa' },
  { id: 'notes', label: 'Notes & tags', description: 'HR notes and tags' },
  { id: 'review', label: 'Review', description: 'Check and submit' },
];

// Old drafts were saved with the previous 9-step section ids.
const LEGACY_SECTION_IDS = {
  job: 'employment', payroll: 'pay', attendance: 'pay', docs: 'documents', assets: 'notes',
};

export const resolveSectionId = (id) => {
  const mapped = LEGACY_SECTION_IDS[id] || id;
  return SECTIONS.some((s) => s.id === mapped) ? mapped : 'personal';
};

export const REQUIRED_FIELDS = {
  personal: [
    { name: 'employeeCode', label: 'Employee code' },
    { name: 'firstName', label: 'First name' },
    { name: 'lastName', label: 'Last name' },
    { name: 'phone', label: 'Phone' },
    { name: 'email', label: 'Email' },
  ],
  employment: [
    { name: 'role', label: 'Role / designation' },
    { name: 'department', label: 'Department' },
    { name: 'branch', label: 'Default branch' },
    { name: 'employmentType', label: 'Employment type' },
    { name: 'joinDate', label: 'Join date' },
  ],
};

export const REQUIRED_FIELD_COUNT = Object.values(REQUIRED_FIELDS).flat().length;

export const countFilledRequired = (form) =>
  Object.values(REQUIRED_FIELDS).flat().filter((f) => hasFilledValue(form[f.name])).length;

const isWholeNumberInRange = (value, min, max) => {
  if (!hasFilledValue(value)) return true;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
};

/**
 * Problems per section as { [sectionId]: { [field]: message } }.
 * `loginAccess` describes the system-role list the access section depends on.
 */
export const getSectionIssues = (form, { canProvisionLoginAccess = false, systemRolesLoading = false, systemRolesError = '' } = {}) => {
  const issues = Object.fromEntries(SECTIONS.map((s) => [s.id, {}]));

  Object.entries(REQUIRED_FIELDS).forEach(([sectionId, fields]) => {
    fields.forEach((field) => {
      if (!hasFilledValue(form[field.name])) issues[sectionId][field.name] = `${field.label} is required`;
    });
  });

  if (hasFilledValue(form.email) && !EMAIL_PATTERN.test(String(form.email).trim())) {
    issues.personal.email = 'Enter a valid email address';
  }
  const dobError = validateDateOfBirth(form.dateOfBirth);
  if (dobError) issues.personal.dateOfBirth = dobError;

  if (!isWholeNumberInRange(form.probationPeriod, 0, 24)) {
    issues.employment.probationPeriod = 'Enter whole months between 0 and 24';
  }

  if (form.posAccess && hasFilledValue(form.posPin) && !/^\d{4,6}$/.test(String(form.posPin))) {
    issues.access.posPin = 'PIN must be 4–6 digits';
  } else if (form.posAccess && hasFilledValue(form.posPin) && isTrivialPin(form.posPin)) {
    issues.access.posPin = 'Too easy to guess — avoid 1111, 1234 or 4321';
  }

  if (canProvisionLoginAccess && form.createLoginAccess) {
    if (systemRolesLoading) issues.access.systemRoleId = 'System roles are still loading';
    else if (systemRolesError) issues.access.systemRoleId = systemRolesError;
    else if (!hasFilledValue(form.systemRoleId)) issues.access.systemRoleId = 'System role is required';
    if (!hasFilledValue(form.loginUsername)) issues.access.loginUsername = 'Login username is required';
    if (!form.temporaryPassword) {
      issues.access.temporaryPassword = 'Temporary password is required';
    } else {
      const pwd = validatePassword(form.temporaryPassword);
      if (!pwd.isValid) issues.access.temporaryPassword = 'Password does not meet the rules below';
    }
  }

  if (hasFilledValue(form.basicSalary) && !(Number(form.basicSalary) >= 0)) {
    issues.pay.basicSalary = 'Salary cannot be negative';
  }
  if (!isWholeNumberInRange(form.weeklyOffDays, 0, 7)) {
    issues.pay.weeklyOffDays = 'Enter a number from 0 to 7';
  }

  if (hasFilledValue(form.passportIssueDate) && hasFilledValue(form.passportExpiryDate)
      && form.passportExpiryDate <= form.passportIssueDate) {
    issues.documents.passportExpiryDate = 'Expiry must be after the issue date';
  }

  return issues;
};

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const numberOrNull = (value) => (hasFilledValue(value) ? Number(value) : null);

/** The JSON body for POST/PUT /api/employees. */
export const buildSubmission = (form, { employeeId = null, canProvisionLoginAccess = false } = {}) => {
  const {
    expiryDate,
    createLoginAccess,
    loginUsername,
    temporaryPassword,
    systemRoleId,
    additionalBranchIds,
    additionalWarehouseIds,
    status: _ignoredStatus, // only present in drafts saved by the old form; the server owns status
    hasExistingPin: _hasExistingPin,
    ...fields
  } = form;

  const payload = {
    ...fields,
    probationPeriod: numberOrNull(form.probationPeriod),
    weeklyOffDays: numberOrNull(form.weeklyOffDays),
    basicSalary: numberOrNull(form.basicSalary),
    // Blank = keep the stored PIN; the server drops it when POS access is off.
    posPin: form.posAccess && hasFilledValue(form.posPin) ? form.posPin : null,
    confirmationDate: computeConfirmationDate(form.joinDate, form.probationPeriod) || null,
    emiratesIdExpiry: expiryDate || null,
    tags: form.tags || null,
    additionalBranchIds: additionalBranchIds.length > 0 ? additionalBranchIds.join(',') : null,
    additionalWarehouseIds: additionalWarehouseIds.length > 0 ? additionalWarehouseIds.join(',') : null,
  };

  if (employeeId) payload.id = employeeId;

  if (canProvisionLoginAccess && createLoginAccess) {
    payload.loginAccess = {
      createAccess: true,
      loginUsername: loginUsername.trim(),
      temporaryPassword,
      roleId: Number(systemRoleId),
    };
  }

  return payload;
};
