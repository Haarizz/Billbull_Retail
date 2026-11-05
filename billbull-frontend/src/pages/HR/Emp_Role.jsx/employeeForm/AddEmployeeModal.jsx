import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileText,
  Loader2,
  ShieldCheck,
  StickyNote,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useBranch } from '@billbull/shared/context/BranchContext';
import { hasRole } from '@billbull/shared/api/auth';
import { getImageUrl } from '@billbull/shared/utils/urlUtils';
import { usersApi } from '../../../../api/usersApi';
import { getWarehouses } from '../../../../api/warehouseApi';
import {
  AccessSection,
  DocumentsSection,
  EmploymentSection,
  ExpiryBadge,
  NotesSection,
  PaySection,
  PersonalSection,
  ReviewSection,
} from './EmployeeFormSections';
import {
  buildFormFromEmployee,
  buildInitialEmployeeForm,
  buildSubmission,
  buildUniqueOptions,
  countFilledRequired,
  DEFAULT_DEPARTMENTS,
  designationForRole,
  DRAFT_KEY,
  expiryState,
  FALLBACK_ROLES,
  findBranchByName,
  generateEmployeeCode,
  getSectionIssues,
  normalizeOptionLabel,
  REQUIRED_FIELD_COUNT,
  resolveSectionId,
  SECTIONS,
} from './employeeFormModel';

const SECTION_ICONS = {
  personal: User,
  employment: Briefcase,
  access: ShieldCheck,
  pay: Wallet,
  documents: FileText,
  notes: StickyNote,
  review: ClipboardCheck,
};

const APPROVAL_PATH = ['HR Review', 'Manager Approval', 'Accounts Approval', 'Active'];

const readDraft = () => {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return draft?.formData ? draft : null;
  } catch {
    return null;
  }
};

const clearDraft = () => {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
};

// ---------------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------------

const ProfilePreview = ({ form, avatar, roleLabel, branchLabel }) => {
  const name = [form.firstName, form.lastName].filter(Boolean).join(' ');
  const initials = `${form.firstName?.[0] || ''}${form.lastName?.[0] || ''}`.toUpperCase();
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="h-12 bg-linear-to-r from-[#F5C742] to-[#FDE6A9]" />
      <div className="-mt-7 px-4 pb-4">
        {avatar ? (
          <img src={avatar} alt="" className="h-14 w-14 rounded-full object-cover ring-4 ring-white" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-lg font-semibold text-[#F5C742] ring-4 ring-white">
            {initials || <User size={22} />}
          </div>
        )}
        <div className="mt-2 truncate text-base font-semibold text-slate-900">{name || 'New employee'}</div>
        <div className="truncate text-xs text-slate-500">
          {[roleLabel, form.department].filter(Boolean).join(' · ') || 'Role not set'}
        </div>
        <dl className="mt-3 space-y-1.5 text-xs">
          {[
            ['Code', form.employeeCode],
            ['Branch', branchLabel],
            ['Type', form.employmentType],
            ['Phone', form.phone],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-slate-400">{label}</dt>
              <dd className="truncate font-medium text-slate-700">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
};

const SidePanel = ({ form, avatar, roleLabel, branchLabel, employeeToEdit }) => {
  const filled = countFilledRequired(form);
  const docs = [
    ['Emirates ID', form.expiryDate],
    ['Passport', form.passportExpiryDate],
    ['Visa', form.visaExpiryDate],
  ].filter(([, date]) => ['expired', 'soon'].includes(expiryState(date)));
  const stageIndex = employeeToEdit
    ? (employeeToEdit.status === 'Active' ? 3 : APPROVAL_PATH.indexOf(employeeToEdit.workflowStage))
    : -1;

  return (
    <div className="space-y-4">
      <ProfilePreview form={form} avatar={avatar} roleLabel={roleLabel} branchLabel={branchLabel} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-700">Required fields</span>
          <span className="text-xs tabular-nums text-slate-500">{filled} / {REQUIRED_FIELD_COUNT}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ${filled === REQUIRED_FIELD_COUNT ? 'bg-emerald-500' : 'bg-[#F5C742]'}`}
            style={{ width: `${(filled / REQUIRED_FIELD_COUNT) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Everything else can be added later.</p>
      </div>

      {docs.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <CalendarClock size={14} /> Document alerts
          </div>
          <ul className="mt-2 space-y-1.5">
            {docs.map(([label, date]) => (
              <li key={label} className="flex items-center justify-between gap-2 text-xs text-amber-900">
                {label} <ExpiryBadge date={date} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold text-slate-700">
          {employeeToEdit ? 'Approval status' : 'After you submit'}
        </div>
        {employeeToEdit && ['Inactive', 'Rejected'].includes(employeeToEdit.status) ? (
          <p className="mt-2 text-xs text-slate-500">This employee is <span className="font-semibold">{employeeToEdit.status}</span>.</p>
        ) : (
          <ol className="mt-3 space-y-0">
            {APPROVAL_PATH.map((stage, idx) => {
              const done = idx < stageIndex || (stageIndex === 3 && idx === 3);
              const current = idx === stageIndex && stageIndex !== 3;
              return (
                <li key={stage} className="relative flex gap-3 pb-3 last:pb-0">
                  {idx < APPROVAL_PATH.length - 1 && <span className="absolute left-1.75 top-4 h-full w-px bg-slate-200" />}
                  <span
                    className={`relative mt-0.5 flex h-3.75 w-3.75 shrink-0 items-center justify-center rounded-full border ${
                      done ? 'border-emerald-500 bg-emerald-500 text-white'
                        : current ? 'border-[#F5C742] bg-[#FFF8E7]'
                          : 'border-slate-300 bg-white'
                    }`}
                  >
                    {done && <Check size={9} strokeWidth={3} />}
                    {current && <span className="h-1.5 w-1.5 rounded-full bg-[#F5C742]" />}
                  </span>
                  <span className={`text-xs ${current ? 'font-semibold text-slate-900' : done ? 'text-slate-700' : 'text-slate-500'}`}>
                    {stage}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {!employeeToEdit && (
          <p className="mt-3 text-[11px] text-slate-400">The employee and any login stay inactive until all three approvals are done.</p>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

const AddEmployeeModal = ({
  isOpen,
  onClose,
  onWorkflowStart,
  employeeToEdit,
  managerOptions = [],
  departmentOptions = [],
}) => {
  const { branches = [], defaultBranchName = '', formatBranchLabel: branchLabelFn } = useBranch();
  const formatBranchLabel = useCallback((branch) => (branchLabelFn ? branchLabelFn(branch) : '') || branch?.name || '', [branchLabelFn]);
  const isEdit = Boolean(employeeToEdit);
  const canProvisionLoginAccess = hasRole('ADMIN') && !isEdit;

  const [activeSection, setActiveSection] = useState('personal');
  const [visited, setVisited] = useState(() => new Set(['personal']));
  const [revealed, setRevealed] = useState(() => new Set());
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState(() => buildInitialEmployeeForm());
  const [touched, setTouched] = useState(false);
  const [pendingDraft, setPendingDraft] = useState(null);

  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState('');
  const [warehouses, setWarehouses] = useState([]);

  // Photo
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  // The live MediaStream is held here, not only on the <video> element: leaving
  // the step or closing the modal unmounts the element, and a stream reachable
  // only through it could never be stopped (the webcam stayed locked).
  const cameraStreamRef = useRef(null);
  // Bumped on every start/stop so a getUserMedia promise that resolves after the
  // user cancelled knows it was superseded and stops itself.
  const cameraRequestRef = useRef(0);
  const contentRef = useRef(null);

  // --- Open / reset -------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    setActiveSection('personal');
    setRevealed(new Set());
    setSubmitAttempted(false);
    setSubmitting(false);
    setFormError('');
    setTouched(false);
    setAvatarFile(null);
    setIsCameraOpen(false);
    setCameraError('');

    if (employeeToEdit) {
      setFormData(buildFormFromEmployee(employeeToEdit, defaultBranchName));
      setAvatarPreview(employeeToEdit.avatarUrl ? getImageUrl(employeeToEdit.avatarUrl) : null);
      setVisited(new Set(SECTIONS.map((s) => s.id)));
      setPendingDraft(null);
      return;
    }
    setFormData(buildInitialEmployeeForm(defaultBranchName));
    setAvatarPreview(null);
    setVisited(new Set(['personal']));
    setPendingDraft(readDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, employeeToEdit]);

  // Branch context can load after the modal opens.
  useEffect(() => {
    if (!isOpen || isEdit || formData.branch || !defaultBranchName) return;
    setFormData((prev) => ({ ...prev, branch: defaultBranchName }));
  }, [defaultBranchName, isEdit, formData.branch, isOpen]);

  // One /api/roles call feeds both the designation list and the login role list.
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setRolesLoading(true);
    setRolesError('');
    usersApi.getAllRoles()
      .then((list) => { if (!cancelled) setRoles(list || []); })
      .catch((e) => {
        if (cancelled) return;
        setRoles([]);
        setRolesError(e.response?.data?.message || e.message || 'Could not load roles');
      })
      .finally(() => { if (!cancelled) setRolesLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    getWarehouses()
      .then((res) => { if (!cancelled) setWarehouses(res?.data || res?.content || res || []); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [isOpen]);

  // --- Camera ---------------------------------------------------------------
  const stopCameraTracks = () => {
    cameraRequestRef.current += 1;
    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const releaseCamera = () => {
    stopCameraTracks();
    setIsCameraOpen(false);
  };

  const startCamera = async () => {
    releaseCamera();
    const requestId = cameraRequestRef.current;
    setIsCameraOpen(true);
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (cameraRequestRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      cameraStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('Could not open the camera. Check the browser permission.');
      setIsCameraOpen(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    setAvatarPreview(canvas.toDataURL('image/jpeg'));
    canvas.toBlob((blob) => setAvatarFile(blob), 'image/jpeg');
    setTouched(true);
    releaseCamera();
  };

  const handleAvatarFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setCameraError('Photo must be under 2 MB.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/jpg', 'image/svg+xml'].includes(file.type)) {
      setCameraError('Use a PNG, JPG or SVG image.');
      return;
    }
    setCameraError('');
    setAvatarFile(file);
    setTouched(true);
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result);
    reader.readAsDataURL(file);
  };

  // Hand the camera back whenever the preview can no longer be on screen.
  useEffect(() => {
    if (isOpen && activeSection === 'personal') return;
    stopCameraTracks();
  }, [isOpen, activeSection]);

  useEffect(() => () => stopCameraTracks(), []);

  // --- Derived data ---------------------------------------------------------
  const selectedBranch = useMemo(() => (
    findBranchByName(branches, formData.branch) || (formData.branch ? { name: formData.branch } : null)
  ), [branches, formData.branch]);

  const branchOptions = useMemo(() => (
    buildUniqueOptions(branches.map((b) => b?.name), defaultBranchName, employeeToEdit?.branch, formData.branch)
      .map((name) => {
        const branch = findBranchByName(branches, name);
        return { value: name, label: branch ? formatBranchLabel(branch) : name };
      })
  ), [branches, defaultBranchName, employeeToEdit, formData.branch, formatBranchLabel]);

  const roleOptions = useMemo(() => {
    const source = roles.length > 0 ? roles.map((r) => r.name) : FALLBACK_ROLES;
    return buildUniqueOptions(source.map(designationForRole), formData.role);
  }, [roles, formData.role]);

  const departmentChoices = useMemo(
    () => buildUniqueOptions(DEFAULT_DEPARTMENTS, departmentOptions),
    [departmentOptions],
  );

  const managerChoices = useMemo(() => {
    const self = [employeeToEdit?.firstName, employeeToEdit?.lastName].map(normalizeOptionLabel).filter(Boolean).join(' ').toLowerCase();
    return buildUniqueOptions(managerOptions.filter((name) => normalizeOptionLabel(name).toLowerCase() !== self));
  }, [managerOptions, employeeToEdit]);

  const systemRoles = canProvisionLoginAccess ? roles : [];

  const issues = getSectionIssues(formData, {
    canProvisionLoginAccess,
    systemRolesLoading: rolesLoading,
    systemRolesError: canProvisionLoginAccess && roles.length === 0 ? rolesError : '',
  });
  const issueCount = (id) => Object.keys(issues[id] || {}).length;
  const showsErrors = (id) => submitAttempted || revealed.has(id);
  const errorsFor = (id) => (showsErrors(id) ? issues[id] : {});
  const firstSectionWithIssue = SECTIONS.find((s) => issueCount(s.id) > 0);

  const branchLabel = selectedBranch ? (formatBranchLabel(selectedBranch) || selectedBranch.name) : '';
  const sectionIndex = SECTIONS.findIndex((s) => s.id === activeSection);
  const currentSection = SECTIONS[sectionIndex];

  // --- Actions --------------------------------------------------------------
  const setField = (name, value) => {
    setFormError('');
    setTouched(true);
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'createLoginAccess' && !value) {
        next.loginUsername = '';
        next.temporaryPassword = '';
        next.systemRoleId = '';
      }
      if (name === 'createLoginAccess' && value && !prev.loginUsername && prev.email) {
        next.loginUsername = prev.email.trim();
      }
      return next;
    });
  };

  const goTo = (id) => {
    if (id === activeSection) return;
    if (activeSection === 'personal') releaseCamera();
    setRevealed((prev) => new Set(prev).add(activeSection));
    setVisited((prev) => new Set(prev).add(id));
    setActiveSection(id);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };

  const goNext = () => {
    if (sectionIndex < SECTIONS.length - 1) goTo(SECTIONS[sectionIndex + 1].id);
  };

  const goBack = () => {
    if (sectionIndex > 0) goTo(SECTIONS[sectionIndex - 1].id);
    else requestClose();
  };

  const requestClose = () => {
    if (submitting) return;
    if (touched && !window.confirm('Discard your changes to this employee?')) return;
    releaseCamera();
    onClose();
  };

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ formData, activeTab: activeSection, savedAt: new Date().toISOString() }));
      toast.success('Draft saved. It will be offered next time you add an employee.');
      releaseCamera();
      onClose();
    } catch {
      toast.error('Could not save the draft in this browser.');
    }
  };

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setFormData({ ...buildInitialEmployeeForm(defaultBranchName), ...pendingDraft.formData });
    const target = resolveSectionId(pendingDraft.activeTab);
    setVisited(new Set(SECTIONS.map((s) => s.id)));
    setActiveSection(target);
    setTouched(true);
    setPendingDraft(null);
    clearDraft();
  };

  const dismissDraft = () => {
    setPendingDraft(null);
    clearDraft();
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (firstSectionWithIssue) {
      const count = SECTIONS.filter((s) => issueCount(s.id) > 0).length;
      setFormError(`Some required details are missing or invalid in ${count === 1 ? firstSectionWithIssue.label : `${count} steps`}.`);
      if (activeSection !== 'review') goTo(firstSectionWithIssue.id);
      return;
    }

    setSubmitting(true);
    const payload = buildSubmission(formData, { employeeId: employeeToEdit?.id, canProvisionLoginAccess });
    try {
      const result = await onWorkflowStart(payload, avatarFile, isEdit);
      if (result?.ok) {
        if (!isEdit) clearDraft();
        releaseCamera();
        onClose();
        return;
      }
      setFormError(result?.message || 'Could not save the employee.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const extraBranchNames = branches
    .filter((b) => formData.additionalBranchIds.includes(b.id))
    .map((b) => formatBranchLabel(b) || b.name);
  const extraWarehouseNames = warehouses
    .filter((w) => formData.additionalWarehouseIds.includes(w.id))
    .map((w) => w.name);
  const systemRoleName = roles.find((r) => String(r.id) === String(formData.systemRoleId))?.name?.replace(/_/g, ' ');

  const sectionProps = { form: formData, setField, errors: errorsFor(activeSection) };

  const renderSection = () => {
    switch (activeSection) {
      case 'personal':
        return (
          <PersonalSection
            {...sectionProps}
            isEdit={isEdit}
            onRegenerateCode={() => setField('employeeCode', generateEmployeeCode())}
            photoRefs={{ videoRef, canvasRef, fileInputRef }}
            photo={{
              preview: avatarPreview,
              isCameraOpen,
              error: cameraError,
              onFile: handleAvatarFile,
              onStartCamera: startCamera,
              onCapture: capturePhoto,
              onCancelCamera: releaseCamera,
              onRemove: () => { setAvatarPreview(null); setAvatarFile(null); setTouched(true); },
            }}
          />
        );
      case 'employment':
        return (
          <EmploymentSection
            {...sectionProps}
            roleOptions={roleOptions}
            rolesLoading={rolesLoading}
            departmentOptions={departmentChoices}
            branchOptions={branchOptions}
            selectedBranch={selectedBranch}
            managerOptions={managerChoices}
          />
        );
      case 'access':
        return (
          <AccessSection
            {...sectionProps}
            canProvisionLoginAccess={canProvisionLoginAccess}
            systemRoles={systemRoles}
            systemRolesLoading={rolesLoading}
            branches={branches}
            selectedBranch={selectedBranch}
            warehouses={warehouses}
            formatBranchLabel={formatBranchLabel}
          />
        );
      case 'pay':
        return <PaySection {...sectionProps} />;
      case 'documents':
        return <DocumentsSection {...sectionProps} />;
      case 'notes':
        return <NotesSection {...sectionProps} />;
      case 'review':
        return (
          <ReviewSection
            form={formData}
            issues={issues}
            onJump={goTo}
            roleLabel={formData.role}
            branchLabel={branchLabel}
            extraBranchNames={extraBranchNames}
            extraWarehouseNames={extraWarehouseNames}
            systemRoleName={systemRoleName}
            canProvisionLoginAccess={canProvisionLoginAccess}
          />
        );
      default:
        return null;
    }
  };

  const stepState = (id) => {
    if (id === activeSection) return 'current';
    if (id === 'review') return 'todo';
    if (issueCount(id) > 0 && showsErrors(id)) return 'error';
    if (issueCount(id) === 0 && visited.has(id)) return 'done';
    return 'todo';
  };

  const fullName = [employeeToEdit?.firstName, employeeToEdit?.lastName].filter(Boolean).join(' ');
  const isLast = activeSection === 'review';
  const primaryLabel = isEdit ? 'Save changes' : 'Submit for approval';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-form-title"
    >
      <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-[#F7F7FA] shadow-2xl md:h-[96%] md:w-[96%] md:max-w-360 md:rounded-2xl">

        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3.5 md:px-6">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">HR · Employees</div>
            <h2 id="employee-form-title" className="truncate text-lg font-semibold text-slate-900">
              {isEdit ? `Edit ${fullName || 'employee'}` : 'New employee'}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isEdit && employeeToEdit.employeeCode && (
              <span className="hidden rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 sm:inline">{employeeToEdit.employeeCode}</span>
            )}
            {!isEdit && (
              <button
                type="button"
                onClick={saveDraft}
                className="hidden rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:block"
              >
                Save draft
              </button>
            )}
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">

          {/* Steps */}
          <nav aria-label="Steps" className="min-w-0 shrink-0 border-b border-slate-200 bg-white lg:w-64 lg:border-b-0 lg:border-r">
            <ol className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-3">
              {SECTIONS.map((section, idx) => {
                const state = stepState(section.id);
                const Icon = SECTION_ICONS[section.id];
                return (
                  <li key={section.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => goTo(section.id)}
                      aria-current={state === 'current' ? 'step' : undefined}
                      className={`group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                        state === 'current' ? 'bg-[#FFF8E7] ring-1 ring-[#FDE6A9]' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          state === 'current' ? 'bg-[#F5C742] text-slate-900'
                            : state === 'done' ? 'bg-emerald-100 text-emerald-700'
                              : state === 'error' ? 'bg-red-100 text-red-600'
                                : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {state === 'done' ? <Check size={14} strokeWidth={3} />
                          : state === 'error' ? <AlertCircle size={14} />
                            : state === 'current' ? <Icon size={14} />
                              : idx + 1}
                      </span>
                      <span className="min-w-0 pr-1">
                        <span className={`block whitespace-nowrap text-sm ${state === 'current' ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                          {section.label}
                        </span>
                        <span className={`hidden truncate text-[11px] lg:block ${state === 'error' ? 'text-red-600' : 'text-slate-400'}`}>
                          {state === 'error'
                            ? `${issueCount(section.id)} to fix`
                            : section.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Content */}
          <main ref={contentRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
              {pendingDraft && (
                <div className="mb-5 flex flex-col gap-3 rounded-xl border border-[#FDE6A9] bg-[#FFF8E7] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-slate-700">
                    <span className="font-semibold">You have a saved draft</span>
                    {pendingDraft.formData.firstName && ` for ${pendingDraft.formData.firstName} ${pendingDraft.formData.lastName || ''}`}
                    {pendingDraft.savedAt && (
                      <span className="text-slate-500"> · saved {new Date(pendingDraft.savedAt).toLocaleString()}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={dismissDraft} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white/60">
                      Discard draft
                    </button>
                    <button type="button" onClick={restoreDraft} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">
                      Restore
                    </button>
                  </div>
                </div>
              )}

              <div className="mb-5">
                <div className="text-xs font-medium text-slate-400">Step {sectionIndex + 1} of {SECTIONS.length}</div>
                <h3 className="mt-0.5 text-xl font-semibold text-slate-900">{currentSection.label}</h3>
                <p className="text-sm text-slate-500">{currentSection.description}</p>
              </div>

              <div key={activeSection} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
                {renderSection()}
              </div>
            </div>
          </main>

          {/* Summary */}
          <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50/60 p-4 xl:block">
            <SidePanel
              form={formData}
              avatar={avatarPreview}
              roleLabel={formData.role}
              branchLabel={branchLabel}
              employeeToEdit={employeeToEdit}
            />
          </aside>
        </div>

        {/* Footer */}
        <footer className="shrink-0 border-t border-slate-200 bg-white">
          {formError && (
            <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 md:mx-6" role="alert">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 px-5 py-3 md:px-6">
            <button
              type="button"
              onClick={goBack}
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {sectionIndex === 0 ? 'Cancel' : (<><ArrowLeft size={15} /> Back</>)}
            </button>

            <div className="flex items-center gap-2">
              {isEdit && !isLast && (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Save changes
                </button>
              )}
              {isLast ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-[#F5C742] px-5 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-[#EDB92E] disabled:cursor-wait disabled:opacity-70"
                >
                  {submitting && <Loader2 size={15} className="animate-spin" />}
                  {submitting ? 'Saving…' : primaryLabel}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={submitting}
                  className="flex items-center gap-1.5 rounded-lg bg-[#F5C742] px-5 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-[#EDB92E] disabled:opacity-50"
                >
                  <span className="hidden sm:inline">Next: {SECTIONS[sectionIndex + 1].label}</span>
                  <span className="sm:hidden">Next</span>
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default AddEmployeeModal;
