import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRightIcon, EyeIcon, EyeOffIcon, InfoIcon } from "lucide-react";

import { ScrollArea } from "../../ui/scroll-area";
import { Skeleton } from "../../ui/skeleton";
import { fetchEmployeePayrollSummary } from "../../../api/entityDetailApi";
import {
  DetailSection,
  EmptyRow,
  SectionError,
  SectionForbidden,
  StatusChip,
  SummaryStat,
  initialsOf,
} from "./DetailPanelShell";

/**
 * One employee in global search: who they are, how they are tracking against target, and —
 * on request, for payroll users only — what they are paid.
 *
 * <p><b>Where each figure comes from.</b> Identity (code, designation, department, branch,
 * employment status) is the search row itself. Targets come from the existing monthly
 * Performance &amp; Targets service, for this month and last, consolidated across branches
 * because the target is company-wide. Payroll comes from the payroll lines behind
 * `hr.payroll`. `GET /api/employees/{id}` — the whole record, documents and contact details
 * included — is never read.
 *
 * <p><b>Payroll is hidden until asked for.</b> Global search is on-screen at shared counters,
 * so a payroll user still has to press "Show payroll" before a salary is fetched or drawn,
 * and selecting another row puts it away again (the modal keys this panel by row). Users
 * without `hr.payroll` see that they may not view it; the server enforces the same gate.
 *
 * <p><b>Not shown, because BillBull does not record it:</b> attendance (present/absent,
 * late arrivals, check-in), leave balances and requests, per-branch targets and daily
 * targets. The panel says so in one line each rather than drawing the design's cards with
 * invented numbers. Employment status is never relabelled as attendance.
 */

const DASH = "—";

const money = (value, currency) =>
  value == null
    ? DASH
    : `${currency} ${Number(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const percentText = (value) =>
  value == null ? DASH : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;

/** (2026, 10) → "October 2026". Built from local parts so no timezone can shift the month. */
const monthLabel = (year, month, style = "long") =>
  year && month
    ? new Date(year, month - 1, 1).toLocaleString(undefined, { month: style, year: "numeric" })
    : DASH;


const dateLabel = (iso) => {
  const [y, m, d] = String(iso ?? "").split("-").map(Number);
  return y && m && d
    ? new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null;
};

// The server's own target status decides the colour, so the bar and the HR grid agree.
const TARGET_TONE = {
  "Target Reached": { bar: "bg-emerald-600", text: "text-emerald-700" },
  "On Track": { bar: "bg-[#8A6D09]", text: "text-[#8A6D09]" },
  "Below Target": { bar: "bg-red-500", text: "text-red-600" },
};
const NEUTRAL_TONE = { bar: "bg-slate-300", text: "text-slate-400" };

// --- Header -----------------------------------------------------------------

const EmployeeHeader = ({ name, employeeCode, role, department, branch, status }) => (
  <div className="border-b border-slate-100 px-5 py-4">
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-50 text-[12px] font-semibold tracking-wide text-rose-700"
      >
        {initialsOf(name, 2)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-slate-900" title={name}>
          {name}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500" data-testid="employee-identity">
          {[employeeCode, role, department].filter(Boolean).join(" · ") || DASH}
        </p>
        {(status || branch) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {status && (
              <span title="Employment status" data-testid="employee-status">
                <StatusChip>{status}</StatusChip>
              </span>
            )}
            {branch && (
              <span className="min-w-0 max-w-full" data-testid="employee-branch">
                <StatusChip tone="neutral" className="max-w-full truncate">
                  {branch}
                </StatusChip>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);

// --- Performance targets ----------------------------------------------------

const TargetRow = ({ label, month, currency, testId }) => {
  const tone = TARGET_TONE[month?.targetStatus] ?? NEUTRAL_TONE;
  const pct = month?.achievementPercent;
  const width = pct == null ? 0 : Math.max(0, Math.min(100, Number(pct)));
  const hasTarget = month?.targetAmount != null;

  return (
    <div className="py-1.5" data-testid={testId}>
      <div className="grid grid-cols-[84px_minmax(0,1fr)_48px] items-center gap-3">
        <span className="truncate text-[12px] text-slate-700">{label}</span>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label={`${label} target achievement`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct == null ? undefined : width}
        >
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${width}%` }} />
        </div>
        <span className={`text-right text-[12px] font-semibold tabular-nums ${tone.text}`}>
          {percentText(pct)}
        </span>
      </div>
      <p className="mt-0.5 truncate pl-24 text-[10px] tabular-nums text-slate-400">
        {!month
          ? "No figures for this month"
          : hasTarget
            ? `${money(month.sales, currency)} of ${money(month.targetAmount, currency)} · ${month.bills} bill${month.bills === 1 ? "" : "s"}`
            : `No target set · ${money(month.sales, currency)} sales`}
      </p>
    </div>
  );
};

const TargetsSection = ({ detail, currency }) => {
  const { targets, targetsForbidden, targetsFailed } = detail;
  return (
    <DetailSection title="Performance targets">
      {targetsForbidden ? (
        <SectionForbidden>You don&apos;t have permission to view targets.</SectionForbidden>
      ) : targetsFailed ? (
        <SectionError>Could not load targets.</SectionError>
      ) : !targets ? (
        <EmptyRow>No target figures for this employee.</EmptyRow>
      ) : (
        <div data-testid="employee-targets">
          <TargetRow
            label="This month"
            month={targets.currentMonth}
            currency={currency}
            testId="employee-target-current"
          />
          <TargetRow
            label="Last month"
            month={targets.previousMonth}
            currency={currency}
            testId="employee-target-previous"
          />
        </div>
      )}
    </DetailSection>
  );
};

// --- Payroll ----------------------------------------------------------------

const Line = ({ label, value, sub, testId }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
    <span className="shrink-0 text-[12px] text-slate-600">{label}</span>
    <span className="min-w-0 truncate text-right text-[12px] font-medium tabular-nums text-slate-800" data-testid={testId}>
      {value}
      {sub && <span className="ml-1.5 font-normal text-slate-400">{sub}</span>}
    </span>
  </div>
);

const PayrollSection = ({ employeeCode, canViewPayroll, currency }) => {
  const [state, setState] = useState({ status: "hidden", data: null });
  const controllerRef = useRef(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const reveal = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading", data: null });
    fetchEmployeePayrollSummary(employeeCode, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: "shown", data });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ status: error?.forbidden ? "forbidden" : "error", data: null });
      });
  };

  const hide = () => {
    controllerRef.current?.abort();
    setState({ status: "hidden", data: null });
  };

  const current = state.data?.currentMonth;
  const now = new Date();
  const title = current
    ? `Payroll breakdown — ${monthLabel(current.year, current.month, "short")}`
    : "Payroll breakdown — current month";

  const action =
    state.status === "shown" ? (
      <span className="flex shrink-0 items-center gap-2">
        {current?.status && (
          <span title="Payroll status">
            <StatusChip>{current.status}</StatusChip>
          </span>
        )}
        <button
          type="button"
          onClick={hide}
          data-testid="employee-payroll-hide"
          className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-700"
        >
          <EyeOffIcon className="size-3" aria-hidden="true" />
          Hide
        </button>
      </span>
    ) : null;

  let body;
  if (!canViewPayroll) {
    body = <SectionForbidden>You don&apos;t have permission to view payroll.</SectionForbidden>;
  } else if (!employeeCode) {
    body = <EmptyRow>No employee code, so no payroll line can be matched.</EmptyRow>;
  } else if (state.status === "hidden") {
    body = (
      <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-slate-200 px-3 py-2.5">
        <span className="text-[11px] text-slate-500">Payroll is hidden in search.</span>
        <button
          type="button"
          onClick={reveal}
          data-testid="employee-payroll-reveal"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          <EyeIcon className="size-3" aria-hidden="true" />
          Show payroll
        </button>
      </div>
    );
  } else if (state.status === "loading") {
    body = (
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="employee-payroll-loading">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  } else if (state.status === "forbidden") {
    body = <SectionForbidden>You don&apos;t have permission to view payroll.</SectionForbidden>;
  } else if (state.status === "error") {
    body = <SectionError>Could not load payroll.</SectionError>;
  } else {
    const { salaryYtd, ytdYear, latestPayslip } = state.data;
    const paidOn = latestPayslip ? dateLabel(latestPayslip.paymentDate) : null;
    body = (
      <div data-testid="employee-payroll">
        {current ? (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <SummaryStat label="Basic salary" value={money(current.baseSalary, currency)} testId="employee-payroll-basic" />
            <SummaryStat label="Allowances" value={money(current.allowances, currency)} tone="positive" testId="employee-payroll-allowances" />
            <SummaryStat label="Deductions" value={money(current.deductions, currency)} tone="negative" testId="employee-payroll-deductions" />
            <SummaryStat label="Net pay" value={money(current.netPayable, currency)} testId="employee-payroll-net" />
          </div>
        ) : (
          <EmptyRow>No payroll line for {monthLabel(now.getFullYear(), now.getMonth() + 1)} yet.</EmptyRow>
        )}
        <div className="mt-2">
          <Line
            label={`Salary YTD${ytdYear ? ` (${ytdYear}, paid)` : ""}`}
            value={money(salaryYtd, currency)}
            testId="employee-payroll-ytd"
          />
          <Line
            label="Latest payslip"
            value={latestPayslip ? monthLabel(latestPayslip.year, latestPayslip.month, "short") : "None paid"}
            sub={paidOn ? `paid ${paidOn}` : null}
            testId="employee-payroll-latest"
          />
        </div>
      </div>
    );
  }

  return (
    <DetailSection title={title} action={action}>
      {body}
    </DetailSection>
  );
};

// --- Not recorded -------------------------------------------------------------

const NOT_RECORDED = [
  ["Attendance", "no attendance or check-in records are kept"],
  ["Leave & time off", "no leave balances or requests are kept"],
  ["Sales by branch", "targets are set per employee company-wide, not per branch"],
  ["Daily target", "targets are monthly"],
];

const NotRecorded = () => (
  <DetailSection title="Not recorded in BillBull">
    <ul
      className="space-y-1 rounded-md border border-dashed border-slate-200 px-3 py-2.5"
      data-testid="employee-not-recorded"
    >
      {NOT_RECORDED.map(([what, why]) => (
        <li key={what} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-500">
          <InfoIcon className="mt-0.5 size-3 shrink-0 text-slate-300" aria-hidden="true" />
          <span className="min-w-0">
            <span className="font-medium text-slate-600">{what}</span> — {why}.
          </span>
        </li>
      ))}
    </ul>
  </DetailSection>
);

// --- Panel ------------------------------------------------------------------

const EmployeeDetailPanel = ({ detail, onOpen, currency = "AED", canView }) => {
  if (!detail) return null;

  // Fails closed: a caller that does not pass canView gets no payroll.
  const canViewPayroll = typeof canView === "function" && canView("hr.payroll") === true;

  return (
    <ScrollArea className="h-full" fitWidth>
      <div className="pb-4" data-testid="employee-detail-panel">
        <EmployeeHeader {...detail} />

        <TargetsSection detail={detail} currency={currency} />

        <PayrollSection
          employeeCode={detail.employeeCode}
          canViewPayroll={canViewPayroll}
          currency={currency}
        />

        <NotRecorded />

        {onOpen && (
          <div className="px-5 pt-1">
            <button
              type="button"
              onClick={onOpen}
              data-testid="employee-open-record"
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Open employee record
              <ArrowUpRightIcon className="size-3" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default EmployeeDetailPanel;
