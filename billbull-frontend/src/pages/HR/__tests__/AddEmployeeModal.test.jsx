import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../api/usersApi', () => ({
  usersApi: { getAllRoles: vi.fn(() => Promise.resolve([{ id: 7, name: 'CASHIER' }])) },
}));
vi.mock('../../../api/warehouseApi', () => ({ getWarehouses: vi.fn(() => Promise.resolve([])) }));
vi.mock('@billbull/shared/api/auth', () => ({ hasRole: () => false }));
vi.mock('@billbull/shared/context/BranchContext', () => ({
  useBranch: () => ({ branches: [{ id: 1, name: 'Dubai' }], defaultBranchName: 'Dubai' }),
}));

import AddEmployeeModal from '../Emp_Role.jsx/employeeForm/AddEmployeeModal';

const renderModal = (props = {}) => {
  const onWorkflowStart = vi.fn(() => Promise.resolve({ ok: true }));
  const onClose = vi.fn();
  render(
    <AddEmployeeModal
      isOpen
      onClose={onClose}
      onWorkflowStart={onWorkflowStart}
      employeeToEdit={null}
      managerOptions={[]}
      departmentOptions={[]}
      {...props}
    />,
  );
  return { onWorkflowStart, onClose };
};

const type = (label, value) => fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } });
const next = () => fireEvent.click(screen.getByRole('button', { name: /^Next/ }));

describe('AddEmployeeModal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows required-field errors only after the user leaves the step', () => {
    renderModal();
    expect(screen.queryByText('First name is required')).toBeNull();

    next();
    fireEvent.click(screen.getByRole('button', { name: /Personal/ }));
    expect(screen.getByText('First name is required')).toBeInTheDocument();
  });

  it('submits a complete new employee for approval', async () => {
    const { onWorkflowStart, onClose } = renderModal();

    type('First name', 'Ahmed');
    type('Last name', 'Ali');
    type('Mobile phone', '+971501234567');
    type('Email', 'ahmed@example.com');
    next();

    await waitFor(() => expect(screen.getByRole('option', { name: 'CASHIER' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Role / designation', { exact: false }), { target: { value: 'CASHIER' } });
    type('Department', 'Sales');
    type('Probation (months)', '1');
    type('Join date', '2026-01-31');

    fireEvent.click(screen.getByRole('button', { name: /Review/ }));
    expect(screen.getByText('Everything required is filled in.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));

    await waitFor(() => expect(onWorkflowStart).toHaveBeenCalledTimes(1));
    const [payload, avatar, isEdit] = onWorkflowStart.mock.calls[0];
    expect(payload).toMatchObject({
      firstName: 'Ahmed',
      lastName: 'Ali',
      role: 'CASHIER',
      department: 'Sales',
      branch: 'Dubai',
      confirmationDate: '2026-02-28',
    });
    expect(payload).not.toHaveProperty('status');
    expect(avatar).toBeNull();
    expect(isEdit).toBe(false);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('blocks an incomplete submit and links each problem back to its step', async () => {
    const { onWorkflowStart } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Review/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));

    expect(onWorkflowStart).not.toHaveBeenCalled();
    expect(screen.getByText(/Some required details are missing/)).toBeInTheDocument();

    // The review list links straight to the step that needs fixing, which now shows inline errors.
    fireEvent.click(screen.getByRole('button', { name: 'Personal', exact: true }));
    expect(screen.getByRole('heading', { name: 'Personal' })).toBeInTheDocument();
    expect(screen.getByText('First name is required')).toBeInTheDocument();
  });

  it('lets an edit be saved from any step', async () => {
    const { onWorkflowStart } = renderModal({
      employeeToEdit: {
        id: 9, employeeCode: 'EMP0009', firstName: 'Fatima', lastName: 'Hassan', phone: '050', email: 'f@example.com',
        role: 'Legacy Role', department: 'HR', branch: 'Dubai', employmentType: 'Full Time', joinDate: '2025-02-01',
        status: 'Active', workflowStage: 'Completed',
      },
    });

    expect(screen.getByLabelText('Employee code', { exact: false })).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onWorkflowStart).toHaveBeenCalledTimes(1));
    const [payload, , isEdit] = onWorkflowStart.mock.calls[0];
    expect(isEdit).toBe(true);
    expect(payload).toMatchObject({ id: 9, firstName: 'Fatima', role: 'Legacy Role' });
  });

  it('offers to restore a saved draft, including one from the old form', () => {
    localStorage.setItem('employee_form_draft', JSON.stringify({
      formData: { firstName: 'Draft', lastName: 'Person', status: 'Active' },
      activeTab: 'job',
    }));
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(screen.getByRole('heading', { name: 'Employment' })).toBeInTheDocument();
    expect(localStorage.getItem('employee_form_draft')).toBeNull();
  });
});
