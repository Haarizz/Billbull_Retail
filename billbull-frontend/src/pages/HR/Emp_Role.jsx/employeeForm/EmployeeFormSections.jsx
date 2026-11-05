import React, { useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { validatePassword } from '../../../../utils/passwordValidation';
import {
  AutocompleteField,
  CheckCard,
  Field,
  InputWithAction,
  SectionCard,
  SelectInput,
  TextArea,
  TextInput,
  Toggle,
} from './formControls';
import {
  computeConfirmationDate,
  daysUntil,
  dobMax,
  dobMin,
  EMPLOYMENT_TYPES,
  expiryState,
  GENDER_OPTIONS,
  generatePosPin,
  LEAVE_POLICY_OPTIONS,
  NATIONALITY_OPTIONS,
  parseTags,
  PERMISSION_PROFILES,
  PRESET_TAGS,
  SALARY_TYPES,
  SECTIONS,
  SHIFT_OPTIONS,
  VISA_TYPE_OPTIONS,
  WORK_DAY_OPTIONS,
} from './employeeFormModel';
import { formatDisplayDate } from '@billbull/shared/utils/dateUtils';

const grid2 = 'grid grid-cols-1 gap-4 sm:grid-cols-2';
const grid3 = 'grid grid-cols-1 gap-4 sm:grid-cols-3';

const formatDate = (iso) => {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : formatDisplayDate(date);
};

/** {name, value, onChange} for a plain input bound to form state. */
const makeBinder = (form, setField) => (name) => ({
  name,
  value: form[name] ?? '',
  onChange: (e) => setField(name, e.target.value),
});

// ---------------------------------------------------------------------------
// Personal
// ---------------------------------------------------------------------------

const PhotoPicker = ({ photo, initials, videoRef, canvasRef, fileInputRef }) => (
  <div className="flex flex-col items-center gap-3 sm:w-36">
    <div className="relative h-28 w-28">
      {photo.isCameraOpen ? (
        <div className="h-full w-full overflow-hidden rounded-full border-2 border-[#F5C742] bg-black">
          <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
        </div>
      ) : photo.preview ? (
        <img src={photo.preview} alt="Employee" className="h-full w-full rounded-full object-cover ring-4 ring-[#FFF8E7]" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-linear-to-br from-[#FFF8E7] to-[#FDE6A9] text-2xl font-semibold text-yellow-800">
          {initials || <Camera size={28} className="text-yellow-700/60" />}
        </div>
      )}
    </div>

    <input
      ref={fileInputRef}
      type="file"
      className="hidden"
      accept="image/png, image/jpeg, image/jpg, image/svg+xml"
      onChange={photo.onFile}
    />

    {photo.isCameraOpen ? (
      <div className="flex gap-2">
        <button type="button" onClick={photo.onCapture} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
          Capture
        </button>
        <button type="button" onClick={photo.onCancelCamera} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          <Upload size={13} /> Upload
        </button>
        <button
          type="button"
          onClick={photo.onStartCamera}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          <Camera size={13} /> Camera
        </button>
        {photo.preview && (
          <button
            type="button"
            onClick={photo.onRemove}
            aria-label="Remove photo"
            className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    )}
    <p className="text-center text-[10px] text-slate-400">PNG, JPG or SVG · max 2 MB</p>
    {photo.error && <p className="max-w-[160px] text-center text-[11px] text-red-600">{photo.error}</p>}
  </div>
);

export const PersonalSection = ({ form, setField, errors, isEdit, photo, photoRefs, onRegenerateCode }) => {
  const bind = makeBinder(form, setField);
  const initials = `${form.firstName?.[0] || ''}${form.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div className="space-y-5">
      <SectionCard title="Identity" description="Name as it appears on the passport or Emirates ID.">
        <div className="flex flex-col gap-6 sm:flex-row">
          <PhotoPicker photo={photo} initials={initials} {...photoRefs} />
          <div className="flex-1 space-y-4">
            <div className={grid3}>
              <Field label="First name" required error={errors.firstName}>
                {(id) => <TextInput id={id} {...bind('firstName')} placeholder="e.g. Ahmed" error={errors.firstName} autoFocus={!isEdit} />}
              </Field>
              <Field label="Middle name" optional>
                {(id) => <TextInput id={id} {...bind('middleName')} />}
              </Field>
              <Field label="Last name" required error={errors.lastName}>
                {(id) => <TextInput id={id} {...bind('lastName')} placeholder="e.g. Al Mansoori" error={errors.lastName} />}
              </Field>
            </div>
            <div className={grid3}>
              <Field
                label="Employee code"
                required
                error={errors.employeeCode}
                hint={isEdit ? 'Fixed after creation' : undefined}
              >
                {(id) => (isEdit ? (
                  <TextInput id={id} value={form.employeeCode} readOnly />
                ) : (
                  <InputWithAction
                    id={id}
                    {...bind('employeeCode')}
                    error={errors.employeeCode}
                    actionLabel="New"
                    onAction={onRegenerateCode}
                  />
                ))}
              </Field>
              <Field label="Gender">
                {(id) => <SelectInput id={id} {...bind('gender')} options={GENDER_OPTIONS} />}
              </Field>
              <Field label="Date of birth" optional error={errors.dateOfBirth}>
                {(id) => (
                  <TextInput id={id} type="date" {...bind('dateOfBirth')} min={dobMin()} max={dobMax()} error={errors.dateOfBirth} />
                )}
              </Field>
            </div>
            <Field label="Nationality" optional>
              {(id) => (
                <AutocompleteField
                  id={id}
                  options={NATIONALITY_OPTIONS}
                  value={form.nationality}
                  onChange={(v) => setField('nationality', v)}
                  placeholder="Select or type a country"
                />
              )}
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Contact">
        <div className="space-y-4">
          <div className={grid2}>
            <Field label="Mobile phone" required error={errors.phone}>
              {(id) => <TextInput id={id} type="tel" {...bind('phone')} placeholder="+971 50 123 4567" error={errors.phone} />}
            </Field>
            <Field label="Email" required error={errors.email}>
              {(id) => <TextInput id={id} type="email" {...bind('email')} placeholder="name@company.com" error={errors.email} />}
            </Field>
          </div>
          <Field label="Current address" optional>
            {(id) => <TextArea id={id} {...bind('currentAddress')} rows={2} placeholder="Building, street, area, emirate" />}
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Emergency contact" description="Who to call if something happens at work.">
        <div className={grid3}>
          <Field label="Name">
            {(id) => <TextInput id={id} {...bind('emergencyContactName')} placeholder="Full name" />}
          </Field>
          <Field label="Relationship">
            {(id) => <TextInput id={id} {...bind('emergencyContactRelation')} placeholder="e.g. Spouse, parent" />}
          </Field>
          <Field label="Phone">
            {(id) => <TextInput id={id} type="tel" {...bind('emergencyContactPhone')} placeholder="+971 50 123 4567" />}
          </Field>
        </div>
      </SectionCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Employment
// ---------------------------------------------------------------------------

export const EmploymentSection = ({
  form,
  setField,
  errors,
  roleOptions,
  rolesLoading,
  departmentOptions,
  branchOptions,
  selectedBranch,
  managerOptions,
}) => {
  const bind = makeBinder(form, setField);
  const confirmationDate = computeConfirmationDate(form.joinDate, form.probationPeriod);

  return (
    <div className="space-y-5">
      <SectionCard title="Role" description="The designation decides which sales and POS features apply to this person.">
        <div className={grid2}>
          <Field label="Role / designation" required error={errors.role}>
            {(id) => (
              <SelectInput
                id={id}
                {...bind('role')}
                options={roleOptions}
                placeholder={rolesLoading ? 'Loading roles…' : 'Select a role'}
                disabled={rolesLoading}
                error={errors.role}
              />
            )}
          </Field>
          <Field label="Department" required error={errors.department}>
            {(id) => (
              <AutocompleteField
                id={id}
                options={departmentOptions}
                value={form.department}
                onChange={(v) => setField('department', v)}
                placeholder="Select or type a department"
                error={errors.department}
              />
            )}
          </Field>
          <Field label="Employment type" required error={errors.employmentType}>
            {(id) => <SelectInput id={id} {...bind('employmentType')} options={EMPLOYMENT_TYPES} error={errors.employmentType} />}
          </Field>
          <Field label="Reports to" optional>
            {(id) => (
              <AutocompleteField
                id={id}
                options={managerOptions}
                value={form.reportingManager}
                onChange={(v) => setField('reportingManager', v)}
                placeholder={managerOptions.length > 0 ? 'Select or type a manager' : 'Type a manager name'}
                noOptionsMessage="No managers yet"
              />
            )}
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Location">
        <div className={grid2}>
          <Field
            label="Default branch"
            required
            error={errors.branch}
            hint={selectedBranch?.defaultWarehouseName ? `Warehouse: ${selectedBranch.defaultWarehouseName}` : undefined}
          >
            {(id) => (
              <SelectInput
                id={id}
                {...bind('branch')}
                options={branchOptions}
                placeholder={branchOptions.length > 0 ? 'Select a branch' : 'No branches available'}
                error={errors.branch}
              />
            )}
          </Field>
          <Field label="Work location" optional hint="e.g. Front counter, Warehouse floor">
            {(id) => <TextInput id={id} {...bind('workLocation')} />}
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Dates & probation">
        <div className={grid3}>
          <Field label="Join date" required error={errors.joinDate}>
            {(id) => <TextInput id={id} type="date" {...bind('joinDate')} error={errors.joinDate} />}
          </Field>
          <Field label="Probation (months)" error={errors.probationPeriod} hint="0 for no probation">
            {(id) => (
              <TextInput id={id} type="number" min="0" max="24" step="1" inputMode="numeric" {...bind('probationPeriod')} error={errors.probationPeriod} />
            )}
          </Field>
          <Field label="Confirmation date" hint="Join date + probation">
            {(id) => (
              <TextInput id={id} value={confirmationDate ? formatDate(confirmationDate) : '—'} readOnly tabIndex={-1} />
            )}
          </Field>
        </div>
      </SectionCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

const PasswordRules = ({ password }) => {
  const rules = validatePassword(password).rules;
  const items = [
    [rules.length, '8+ characters'],
    [rules.uppercase, 'An uppercase letter'],
    [rules.digit, 'A number'],
    [rules.specialChar, 'A symbol'],
  ];
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
      {items.map(([ok, label]) => (
        <li key={label} className={`flex items-center gap-1 ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>
          {ok ? <CheckCircle2 size={12} /> : <span className="h-3 w-3 rounded-full border border-current" />}
          {label}
        </li>
      ))}
    </ul>
  );
};

const SelectAllLinks = ({ onAll, onNone }) => (
  <div className="flex shrink-0 gap-3 whitespace-nowrap text-xs">
    <button type="button" onClick={onAll} className="font-medium text-slate-600 hover:text-slate-900">Select all</button>
    <button type="button" onClick={onNone} className="font-medium text-slate-400 hover:text-slate-700">Clear</button>
  </div>
);

export const AccessSection = ({
  form,
  setField,
  errors,
  canProvisionLoginAccess,
  systemRoles,
  systemRolesLoading,
  branches,
  selectedBranch,
  warehouses,
  formatBranchLabel,
}) => {
  const bind = makeBinder(form, setField);
  const [showPin, setShowPin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const otherBranches = branches.filter((b) => !selectedBranch || b.id !== selectedBranch.id);
  const toggleId = (field, id) => {
    const current = form[field];
    setField(field, current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Point of sale">
        <div className="space-y-5">
          <Toggle
            checked={form.posAccess}
            onChange={(v) => setField('posAccess', v)}
            label="Can use the POS"
            description="Turn off for staff who never ring up sales. When off, they can’t sign in to the till at all."
          />
          {form.posAccess && (
            <div className={grid2}>
              <Field label="POS PIN" optional error={errors.posPin}>
                {(id) => (
                  <>
                    <InputWithAction
                      id={id}
                      {...bind('posPin')}
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={6}
                      error={errors.posPin}
                      actionLabel="Generate"
                      onAction={() => { setField('posPin', generatePosPin()); setShowPin(true); }}
                    />
                    {!errors.posPin && (
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{form.hasExistingPin && !form.posPin ? 'A PIN is set — type a new one to change it' : '4–6 digits, used for till PIN sign-in'}</span>
                        {form.posPin && (
                          <button type="button" onClick={() => setShowPin((v) => !v)} className="flex items-center gap-1 hover:text-slate-600">
                            {showPin ? <EyeOff size={12} /> : <Eye size={12} />} {showPin ? 'Hide' : 'Show'}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </Field>
              <Field label="Permission profile">
                {(id) => <SelectInput id={id} {...bind('permissionProfile')} options={PERMISSION_PROFILES} placeholder="Not set" />}
              </Field>
            </div>
          )}
        </div>
      </SectionCard>

      {canProvisionLoginAccess && (
        <SectionCard title="BillBull login">
          <div className="space-y-5">
            <Toggle
              checked={form.createLoginAccess}
              onChange={(v) => setField('createLoginAccess', v)}
              label="Create a login for this employee"
              description="The account is created now but stays locked until the employee is approved and Active."
            />
            {form.createLoginAccess && (
              <div className={grid2}>
                <Field label="Username or email" required error={errors.loginUsername}>
                  {(id) => (
                    <TextInput id={id} {...bind('loginUsername')} placeholder={form.email || 'employee.login'} autoComplete="off" error={errors.loginUsername} />
                  )}
                </Field>
                <Field label="System role" required error={errors.systemRoleId}>
                  {(id) => (
                    <SelectInput
                      id={id}
                      {...bind('systemRoleId')}
                      options={systemRoles.map((r) => ({ value: String(r.id), label: r.name.replace(/_/g, ' ') }))}
                      placeholder={systemRolesLoading ? 'Loading…' : 'Select a role'}
                      disabled={systemRolesLoading || systemRoles.length === 0}
                      error={errors.systemRoleId}
                    />
                  )}
                </Field>
                <Field label="Temporary password" required error={errors.temporaryPassword} className="sm:col-span-2">
                  {(id) => (
                    <>
                      <div className="relative">
                        <TextInput
                          id={id}
                          {...bind('temporaryPassword')}
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          className="pr-10"
                          error={errors.temporaryPassword}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <PasswordRules password={form.temporaryPassword} />
                    </>
                  )}
                </Field>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Branch access"
        description="The default branch comes from the Employment step. Tick any extra branches this person works in."
        action={otherBranches.length > 1 && (
          <SelectAllLinks
            onAll={() => setField('additionalBranchIds', otherBranches.map((b) => b.id))}
            onNone={() => setField('additionalBranchIds', [])}
          />
        )}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {selectedBranch ? (
            <div className="flex items-center gap-3 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2.5 text-white">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{formatBranchLabel(selectedBranch) || selectedBranch.name}</span>
                {selectedBranch.defaultWarehouseName && (
                  <span className="block truncate text-[11px] text-slate-300">{selectedBranch.defaultWarehouseName}</span>
                )}
              </span>
              <span className="rounded-full bg-[#F5C742] px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-900">Default</span>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-xs text-slate-500">
              No default branch yet — pick one in Employment.
            </div>
          )}
          {otherBranches.map((b) => (
            <CheckCard
              key={b.id}
              checked={form.additionalBranchIds.includes(b.id)}
              onChange={() => toggleId('additionalBranchIds', b.id)}
              title={formatBranchLabel(b) || b.name}
              subtitle={b.defaultWarehouseName}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Warehouse access"
        description="Extra warehouses this person can see stock for."
        action={warehouses.length > 1 && (
          <SelectAllLinks
            onAll={() => setField('additionalWarehouseIds', warehouses.map((w) => w.id))}
            onNone={() => setField('additionalWarehouseIds', [])}
          />
        )}
      >
        {warehouses.length === 0 ? (
          <p className="text-xs text-slate-500">No warehouses set up.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {warehouses.map((w) => (
              <CheckCard
                key={w.id}
                checked={form.additionalWarehouseIds.includes(w.id)}
                onChange={() => toggleId('additionalWarehouseIds', w.id)}
                title={w.name}
                subtitle={w.code ? `Code ${w.code}` : undefined}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pay & schedule
// ---------------------------------------------------------------------------

export const PaySection = ({ form, setField, errors }) => {
  const bind = makeBinder(form, setField);
  const perUnit = form.salaryType === 'Hourly' ? 'per hour' : 'per month';

  return (
    <div className="space-y-5">
      <SectionCard title="Salary" description="Optional now — you can fill this in later.">
        <div className={grid2}>
          <Field label="Paid">
            {(id) => (
              <div id={id} role="radiogroup" className="grid h-10 grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
                {SALARY_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={form.salaryType === type}
                    onClick={() => setField('salaryType', type)}
                    className={`rounded-md text-xs font-medium transition-colors ${
                      form.salaryType === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label={`Basic salary (${perUnit})`} error={errors.basicSalary}>
            {(id) => (
              <TextInput id={id} type="number" min="0" step="0.01" inputMode="decimal" {...bind('basicSalary')} placeholder="0.00" error={errors.basicSalary} />
            )}
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Schedule & leave">
        <div className={grid2}>
          <Field label="Shift">
            {(id) => <SelectInput id={id} {...bind('shiftType')} options={SHIFT_OPTIONS} placeholder="Not set" />}
          </Field>
          <Field label="Work week">
            {(id) => <SelectInput id={id} {...bind('workDays')} options={WORK_DAY_OPTIONS} />}
          </Field>
          <Field label="Weekly days off" error={errors.weeklyOffDays}>
            {(id) => (
              <TextInput id={id} type="number" min="0" max="7" step="1" inputMode="numeric" {...bind('weeklyOffDays')} error={errors.weeklyOffDays} />
            )}
          </Field>
          <Field label="Leave policy">
            {(id) => <SelectInput id={id} {...bind('leavePolicy')} options={LEAVE_POLICY_OPTIONS} placeholder="Not set" />}
          </Field>
        </div>
      </SectionCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const ExpiryBadge = ({ date }) => {
  const state = expiryState(date);
  if (!state) return null;
  const days = daysUntil(date);
  const styles = {
    expired: 'bg-red-50 text-red-700 border-red-200',
    soon: 'bg-amber-50 text-amber-700 border-amber-200',
    valid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  const text = state === 'expired'
    ? `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
    : state === 'soon'
      ? (days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}`)
      : 'Valid';
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[state]}`}>{text}</span>;
};

export const DocumentsSection = ({ form, setField, errors }) => {
  const bind = makeBinder(form, setField);
  return (
    <div className="space-y-5">
      <SectionCard title="Emirates ID" action={<ExpiryBadge date={form.expiryDate} />}>
        <div className={grid2}>
          <Field label="ID number">
            {(id) => <TextInput id={id} {...bind('emiratesId')} placeholder="784-XXXX-XXXXXXX-X" />}
          </Field>
          <Field label="Expiry date">
            {(id) => <TextInput id={id} type="date" {...bind('expiryDate')} />}
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Passport" action={<ExpiryBadge date={form.passportExpiryDate} />}>
        <div className={grid3}>
          <Field label="Passport number">
            {(id) => <TextInput id={id} {...bind('passportNumber')} />}
          </Field>
          <Field label="Issue date">
            {(id) => <TextInput id={id} type="date" {...bind('passportIssueDate')} />}
          </Field>
          <Field label="Expiry date" error={errors.passportExpiryDate}>
            {(id) => <TextInput id={id} type="date" {...bind('passportExpiryDate')} error={errors.passportExpiryDate} />}
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Visa / residency" action={<ExpiryBadge date={form.visaExpiryDate} />}>
        <div className={grid3}>
          <Field label="Visa type">
            {(id) => <SelectInput id={id} {...bind('visaType')} options={VISA_TYPE_OPTIONS} placeholder="Not set" />}
          </Field>
          <Field label="Visa number">
            {(id) => <TextInput id={id} {...bind('visaNumber')} />}
          </Field>
          <Field label="Expiry date">
            {(id) => <TextInput id={id} type="date" {...bind('visaExpiryDate')} />}
          </Field>
        </div>
      </SectionCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Notes & tags
// ---------------------------------------------------------------------------

export const NotesSection = ({ form, setField }) => {
  const [draftTag, setDraftTag] = useState('');
  const tags = parseTags(form.tags);
  const allTags = [...PRESET_TAGS, ...tags.filter((t) => !PRESET_TAGS.includes(t))];

  const setTags = (next) => setField('tags', next.join(','));
  const toggle = (tag) => setTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]);
  const addCustom = () => {
    const tag = draftTag.trim().replace(/,/g, ' ');
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) setTags([...tags, tag]);
    setDraftTag('');
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Tags" description="Quick labels that show on the employee list.">
        <div className="flex flex-wrap gap-2">
          {allTags.map((tag) => {
            const on = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(tag)}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  on ? 'border-[#F5C742] bg-[#FFF8E7] text-yellow-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {on && <X size={11} />}
                {tag}
              </button>
            );
          })}
          <div className="flex items-center rounded-full border border-dashed border-slate-300 pl-3 pr-1 focus-within:border-[#F5C742]">
            <input
              value={draftTag}
              onChange={(e) => setDraftTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              placeholder="Add tag"
              aria-label="New tag"
              className="w-24 bg-transparent py-1 text-xs focus:outline-none"
            />
            <button type="button" onClick={addCustom} aria-label="Add tag" className="rounded-full p-1 text-slate-400 hover:text-slate-700">
              <Plus size={12} />
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="HR notes" description="Private — only people with HR access can read these.">
        <TextArea
          aria-label="HR notes"
          value={form.hrNotes}
          onChange={(e) => setField('hrNotes', e.target.value)}
          rows={6}
          placeholder="Interview notes, special arrangements, anything HR should know"
        />
      </SectionCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm">
    <dt className="text-slate-500">{label}</dt>
    <dd className={`text-right ${value ? 'font-medium text-slate-800' : 'text-slate-300'}`}>{value || '—'}</dd>
  </div>
);

export const ReviewSection = ({ form, issues, onJump, roleLabel, branchLabel, extraBranchNames, extraWarehouseNames, systemRoleName, canProvisionLoginAccess }) => {
  const sectionsWithIssues = SECTIONS.filter((s) => Object.keys(issues[s.id] || {}).length > 0);
  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ');
  const confirmation = computeConfirmationDate(form.joinDate, form.probationPeriod);
  const workWeek = WORK_DAY_OPTIONS.find((o) => o.value === form.workDays)?.label || form.workDays;
  const leave = LEAVE_POLICY_OPTIONS.find((o) => o.value === form.leavePolicy)?.label || form.leavePolicy;
  const visa = VISA_TYPE_OPTIONS.find((o) => o.value === form.visaType)?.label || form.visaType;

  const blocks = [
    {
      id: 'personal',
      rows: [
        ['Name', fullName], ['Employee code', form.employeeCode], ['Gender', form.gender],
        ['Date of birth', formatDate(form.dateOfBirth)], ['Nationality', form.nationality],
        ['Phone', form.phone], ['Email', form.email], ['Address', form.currentAddress],
        ['Emergency contact', [form.emergencyContactName, form.emergencyContactRelation && `(${form.emergencyContactRelation})`, form.emergencyContactPhone].filter(Boolean).join(' ')],
      ],
    },
    {
      id: 'employment',
      rows: [
        ['Role', roleLabel], ['Department', form.department], ['Employment type', form.employmentType],
        ['Reports to', form.reportingManager], ['Default branch', branchLabel], ['Work location', form.workLocation],
        ['Join date', formatDate(form.joinDate)],
        ['Probation', form.probationPeriod !== '' ? `${form.probationPeriod} month${Number(form.probationPeriod) === 1 ? '' : 's'}` : ''],
        ['Confirmation date', formatDate(confirmation)],
      ],
    },
    {
      id: 'access',
      rows: [
        ['POS access', form.posAccess ? (form.posPin ? 'Yes, new PIN' : form.hasExistingPin ? 'Yes, PIN set' : 'Yes, no PIN') : 'No'],
        ['Permission profile', form.posAccess ? form.permissionProfile : ''],
        ...(canProvisionLoginAccess
          ? [['BillBull login', form.createLoginAccess ? `${form.loginUsername || '—'} · ${systemRoleName || 'no role'}` : 'Not created']]
          : []),
        ['Extra branches', extraBranchNames.join(', ')],
        ['Extra warehouses', extraWarehouseNames.join(', ')],
      ],
    },
    {
      id: 'pay',
      rows: [
        ['Salary', form.basicSalary !== '' ? `${form.basicSalary} ${form.salaryType === 'Hourly' ? 'per hour' : 'per month'}` : ''],
        ['Shift', form.shiftType], ['Work week', workWeek],
        ['Days off per week', String(form.weeklyOffDays ?? '')], ['Leave policy', leave],
      ],
    },
    {
      id: 'documents',
      rows: [
        ['Emirates ID', [form.emiratesId, form.expiryDate && `exp. ${formatDate(form.expiryDate)}`].filter(Boolean).join(' · ')],
        ['Passport', [form.passportNumber, form.passportExpiryDate && `exp. ${formatDate(form.passportExpiryDate)}`].filter(Boolean).join(' · ')],
        ['Visa', [visa, form.visaNumber, form.visaExpiryDate && `exp. ${formatDate(form.visaExpiryDate)}`].filter(Boolean).join(' · ')],
      ],
    },
    {
      id: 'notes',
      rows: [['Tags', parseTags(form.tags).join(', ')], ['HR notes', form.hrNotes ? `${form.hrNotes.length} characters` : '']],
    },
  ];

  return (
    <div className="space-y-5">
      {sectionsWithIssues.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <AlertCircle size={16} /> Fix {sectionsWithIssues.length === 1 ? 'one step' : `${sectionsWithIssues.length} steps`} before saving
          </div>
          <ul className="mt-2 space-y-1 pl-6 text-xs text-red-700">
            {sectionsWithIssues.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onJump(s.id)} className="font-semibold underline underline-offset-2 hover:text-red-900">
                  {s.label}
                </button>
                {': '}{Object.values(issues[s.id]).join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          <CheckCircle2 size={16} /> Everything required is filled in.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {blocks.map((block) => {
          const meta = SECTIONS.find((s) => s.id === block.id);
          const hasIssue = Object.keys(issues[block.id] || {}).length > 0;
          return (
            <section key={block.id} className={`rounded-xl border bg-white shadow-sm ${hasIssue ? 'border-red-200' : 'border-slate-200'}`}>
              <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-800">{meta.label}</h3>
                <button
                  type="button"
                  onClick={() => onJump(block.id)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <Pencil size={12} /> Edit
                </button>
              </header>
              <dl className="divide-y divide-slate-50 px-4 py-1">
                {block.rows.map(([label, value]) => <Row key={label} label={label} value={value} />)}
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
};
