import { describe, expect, it } from 'vitest';
import {
  buildFormFromEmployee,
  buildInitialEmployeeForm,
  buildSubmission,
  computeConfirmationDate,
  daysUntil,
  expiryState,
  getSectionIssues,
  resolveSectionId,
} from '../Emp_Role.jsx/employeeForm/employeeFormModel';

const validForm = () => ({
  ...buildInitialEmployeeForm('Dubai'),
  employeeCode: 'EMP0001',
  firstName: 'Ahmed',
  lastName: 'Ali',
  phone: '+971501234567',
  email: 'ahmed@example.com',
  role: 'Cashier',
  department: 'Sales',
  joinDate: '2026-01-31',
});

describe('computeConfirmationDate', () => {
  it('adds the probation months to the join date', () => {
    expect(computeConfirmationDate('2026-03-15', '3')).toBe('2026-06-15');
    expect(computeConfirmationDate('2026-11-10', 3)).toBe('2027-02-10');
  });

  it('clamps to the last day of a shorter month', () => {
    expect(computeConfirmationDate('2026-01-31', '1')).toBe('2026-02-28');
    expect(computeConfirmationDate('2027-12-31', '2')).toBe('2028-02-29');
  });

  it('treats 0 months as confirmed on the join date', () => {
    expect(computeConfirmationDate('2026-05-01', '0')).toBe('2026-05-01');
  });

  it('is blank when either input is missing or invalid', () => {
    expect(computeConfirmationDate('', '3')).toBe('');
    expect(computeConfirmationDate('2026-05-01', '')).toBe('');
    expect(computeConfirmationDate('2026-05-01', '1.5')).toBe('');
  });
});

describe('document expiry', () => {
  it('classifies expired, soon and valid dates', () => {
    expect(daysUntil('2026-11-14', '2026-11-04')).toBe(10);
    expect(expiryState('2026-11-01', '2026-11-04')).toBe('expired');
    expect(expiryState('2026-12-01', '2026-11-04')).toBe('soon');
    expect(expiryState('2027-11-01', '2026-11-04')).toBe('valid');
    expect(expiryState('', '2026-11-04')).toBeNull();
  });
});

describe('getSectionIssues', () => {
  it('has no issues for a complete form', () => {
    const issues = getSectionIssues(validForm());
    expect(Object.values(issues).every((s) => Object.keys(s).length === 0)).toBe(true);
  });

  it('names each missing required field in its section', () => {
    const issues = getSectionIssues({ ...validForm(), firstName: '', role: ' ' });
    expect(issues.personal.firstName).toMatch(/required/);
    expect(issues.employment.role).toMatch(/required/);
  });

  it('rejects a malformed email, a non-numeric PIN and an expiry before issue', () => {
    const issues = getSectionIssues({
      ...validForm(),
      email: 'not-an-email',
      posPin: '12a4',
      passportIssueDate: '2026-01-01',
      passportExpiryDate: '2025-01-01',
    });
    expect(issues.personal.email).toBeTruthy();
    expect(issues.access.posPin).toBeTruthy();
    expect(issues.documents.passportExpiryDate).toBeTruthy();
  });

  it('ignores the PIN when POS access is off', () => {
    expect(getSectionIssues({ ...validForm(), posAccess: false, posPin: 'xx' }).access.posPin).toBeUndefined();
  });

  it('requires login details only when an admin asks for a login', () => {
    const form = { ...validForm(), createLoginAccess: true };
    expect(getSectionIssues(form).access).toEqual({});
    const issues = getSectionIssues(form, { canProvisionLoginAccess: true }).access;
    expect(Object.keys(issues).sort()).toEqual(['loginUsername', 'systemRoleId', 'temporaryPassword']);
  });
});

describe('buildSubmission', () => {
  it('sends the computed confirmation date and numeric fields, and drops UI-only state', () => {
    const payload = buildSubmission({ ...validForm(), probationPeriod: '1', basicSalary: '', status: 'Active', additionalBranchIds: [2, 3] });
    expect(payload.confirmationDate).toBe('2026-02-28');
    expect(payload.probationPeriod).toBe(1);
    expect(payload.basicSalary).toBeNull();
    expect(payload.additionalBranchIds).toBe('2,3');
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('createLoginAccess');
    expect(payload).not.toHaveProperty('loginAccess');
  });

  it('adds loginAccess only for an admin creating a login', () => {
    const form = { ...validForm(), createLoginAccess: true, loginUsername: ' ahmed ', temporaryPassword: 'Secret#1x', systemRoleId: '4' };
    expect(buildSubmission(form)).not.toHaveProperty('loginAccess');
    expect(buildSubmission(form, { canProvisionLoginAccess: true }).loginAccess).toEqual({
      createAccess: true, loginUsername: 'ahmed', temporaryPassword: 'Secret#1x', roleId: 4,
    });
  });

  it('sends a PIN only when one was typed and POS access is on', () => {
    expect(buildSubmission({ ...validForm(), posAccess: false, posPin: '2580' }).posPin).toBeNull();
    expect(buildSubmission({ ...validForm(), posPin: '', hasExistingPin: true }).posPin).toBeNull();
    expect(buildSubmission({ ...validForm(), posPin: '2580' }).posPin).toBe('2580');
    expect(buildSubmission({ ...validForm(), hasExistingPin: true })).not.toHaveProperty('hasExistingPin');
  });

  it('rejects easy PINs the server would refuse', () => {
    expect(getSectionIssues({ ...validForm(), posPin: '1234' }).access.posPin).toMatch(/easy/);
    expect(getSectionIssues({ ...validForm(), posPin: '7890' }).access.posPin).toMatch(/easy/);
    expect(getSectionIssues({ ...validForm(), posPin: '2580' }).access.posPin).toBeUndefined();
  });
});

describe('edit mode', () => {
  it('maps every stored field back into the form', () => {
    const form = buildFormFromEmployee({
      firstName: 'Fatima', emiratesIdExpiry: '2027-01-01', additionalBranchIds: '2,5', probationPeriod: 6, weeklyOffDays: 0,
    });
    expect(form.firstName).toBe('Fatima');
    expect(form.expiryDate).toBe('2027-01-01');
    expect(form.additionalBranchIds).toEqual([2, 5]);
    expect(form.probationPeriod).toBe('6');
    expect(form.weeklyOffDays).toBe(0);
  });
});

describe('resolveSectionId', () => {
  it('maps drafts saved by the old 9-step form', () => {
    expect(resolveSectionId('job')).toBe('employment');
    expect(resolveSectionId('attendance')).toBe('pay');
    expect(resolveSectionId('docs')).toBe('documents');
    expect(resolveSectionId('nonsense')).toBe('personal');
  });
});
