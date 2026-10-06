import React from "react";
import { ArrowUpRightIcon } from "lucide-react";

import { ScrollArea } from "../../ui/scroll-area";
import { DetailHeader, DetailSection } from "./DetailPanelShell";

/**
 * Read-only identity card for one employee. Identity, and nothing else.
 *
 * <p>This panel is the shortest one in the set, and that is the point rather than a
 * stage it has not grown out of. Global search is reachable by keyboard from every
 * screen and is frequently on-screen in shared and counter contexts, which makes it the
 * worst possible surface for pay data: the cost of a shoulder-surf here is a personnel
 * incident, not a wrong number. So the panel shows who someone is and where they work,
 * and stops.
 *
 * <p><b>Deliberately absent, not pending:</b> basic salary, allowances, deductions, net
 * pay, salary YTD, payslips, performance, attendance and leave. None of these can be
 * reached from this panel, and none is one prop away — the panel renders from the search
 * row alone and issues no request, so the payload that carries salary columns
 * (`GET /api/employees/{id}`) is never fetched in the first place. Attendance and leave
 * have no module behind them at all.
 *
 * <p>`hr.employee` already gates the search that produced this row, so the panel needs no
 * permission of its own and no payroll permission is involved. Anyone who needs the rest
 * of the record goes to the HR page through the link below, where each field sits behind
 * its own gate.
 */

const DASH = "—";

const Field = ({ label, value, testId }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-slate-50 py-1.5 last:border-b-0">
    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400">
      {label}
    </span>
    <span data-testid={testId} className="min-w-0 truncate text-[12px] text-slate-700">
      {value || DASH}
    </span>
  </div>
);

const EmployeeDetailPanel = ({ detail, onOpen }) => {
  if (!detail) return null;

  const { name, employeeCode, role, department, branch, status } = detail;

  return (
    <ScrollArea className="h-full" fitWidth>
      <div className="pb-4" data-testid="employee-detail-panel">
        <DetailHeader
          title={name}
          subtitle={[employeeCode, role, department].filter(Boolean).join(" • ")}
          badge={status || undefined}
          chips={[branch || null]}
        />

        <DetailSection title="Employee">
          <Field label="Employee ID" value={employeeCode} testId="employee-code" />
          <Field label="Designation" value={role} testId="employee-role" />
          <Field label="Department" value={department} testId="employee-department" />
          <Field label="Branch" value={branch} testId="employee-branch" />
          <Field label="Status" value={status} testId="employee-status" />
        </DetailSection>

        {onOpen && (
          <div className="px-5">
            <button
              type="button"
              onClick={onOpen}
              data-testid="employee-open-record"
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Open employee record
              <ArrowUpRightIcon className="size-3" aria-hidden="true" />
            </button>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-400">
              Payroll, attendance and leave are not shown in search. Open the record to
              view what your permissions allow.
            </p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default EmployeeDetailPanel;
