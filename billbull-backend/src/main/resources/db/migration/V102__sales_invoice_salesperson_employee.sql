-- Salesperson attribution on a sales invoice: WHO the sale belongs to for performance and
-- commission, as distinct from WHO rang it up.
--
-- The POS operator (cashier) is already recoverable from pos_session_id / created_by_user_id.
-- These columns carry a different fact: Cashier 1 may be logged in while the sale belongs to
-- Manager 1. Shaped exactly like the existing pos_driver_employee_id / _code / pos_driver_name
-- trio — a real employee id plus a denormalised code and name snapshot, so reports never need to
-- join employees just to render a row.
--
-- The legacy sales_invoices.salesperson varchar is deliberately NOT touched, NOT renamed and NOT
-- backfilled. It carries mixed semantics (SalesInvoiceService defaults it to the JWT username when
-- blank, while the back-office invoice screen writes an employee display name) and several existing
-- reports group by it. The two concepts stay separate; reconciling them is a later cleanup.
--
-- Historical invoices keep NULL here on purpose: there is no reliable way to resolve the legacy
-- string back to an employee, and a guess would become a commission base. NULL aggregates into the
-- "Unassigned" bucket.
--
-- Additive and idempotent — no existing data is touched.
DO $$
BEGIN
    IF to_regclass('public.sales_invoices') IS NULL THEN
        RETURN;
    END IF;

    ALTER TABLE public.sales_invoices
        ADD COLUMN IF NOT EXISTS salesperson_employee_id   bigint;
    ALTER TABLE public.sales_invoices
        ADD COLUMN IF NOT EXISTS salesperson_employee_code varchar(100);
    ALTER TABLE public.sales_invoices
        ADD COLUMN IF NOT EXISTS salesperson_name          varchar(200);

    -- The whole access path of the employee-performance aggregate:
    --   WHERE salesperson_employee_id IS NOT NULL AND invoice_date BETWEEN ? AND ?
    --   GROUP BY salesperson_employee_id
    IF to_regclass('public.idx_sales_invoice_salesperson_date') IS NULL THEN
        CREATE INDEX idx_sales_invoice_salesperson_date
            ON public.sales_invoices (salesperson_employee_id, invoice_date);
    END IF;
END $$;
