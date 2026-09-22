-- Employee monthly sales targets + commission rates.
--
-- One row per (employee, month). target_month is always normalised to the FIRST day of the
-- month by EmployeeSalesTargetService, so 2026-09-01 means "September 2026" — the column stays
-- a plain date rather than a (year, month) pair so a future weekly/quarterly period type can be
-- added as a period_type discriminator beside it without re-typing this column.
--
-- Deliberately NO branch_id: an employee sells across branches (employees.additional_branch_ids,
-- and a POS sale's branch comes from the terminal, not the employee), so the target is GLOBAL per
-- employee per month. Branch only ever filters the SALES side of the comparison.
--
-- Additive and idempotent — no existing data is touched, nothing is backfilled.
DO $$
BEGIN
    IF to_regclass('public.employee_sales_targets') IS NOT NULL THEN
        RETURN;
    END IF;

    CREATE TABLE public.employee_sales_targets (
        id                 bigserial     PRIMARY KEY,
        employee_id        bigint        NOT NULL,
        target_month       date          NOT NULL,
        target_amount      numeric(15,2) NOT NULL DEFAULT 0,
        commission_rate    numeric(5,2)  NOT NULL DEFAULT 0,
        status             varchar(20),
        created_at         timestamp,
        created_by         varchar(255),
        created_by_user_id bigint,
        updated_at         timestamp,
        updated_by         varchar(255),
        is_active          boolean       NOT NULL DEFAULT true
    );

    -- One target per employee per month — the upsert key used by PUT /api/hr/targets.
    CREATE UNIQUE INDEX uq_employee_sales_target_month
        ON public.employee_sales_targets (employee_id, target_month);

    -- The admin grid loads one month at a time for every employee.
    CREATE INDEX idx_employee_sales_target_month
        ON public.employee_sales_targets (target_month);
END $$;
