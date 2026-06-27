ALTER TABLE pos_sessions
    ADD COLUMN IF NOT EXISTS duration_seconds BIGINT,
    ADD COLUMN IF NOT EXISTS closing_denominations_json TEXT;

INSERT INTO roles (name, description, created_at, updated_at, is_active)
VALUES ('DELIVERY_PERSON', 'Delivery Person', NOW(), NOW(), TRUE)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE sales_invoices
    ADD COLUMN IF NOT EXISTS pos_driver_employee_id BIGINT,
    ADD COLUMN IF NOT EXISTS pos_driver_employee_code VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_driver_employee
    ON sales_invoices (pos_driver_employee_id);

DO $$
BEGIN
    IF to_regclass('public.employees') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_sales_invoice_driver_employee'
       ) THEN
        ALTER TABLE sales_invoices
            ADD CONSTRAINT fk_sales_invoice_driver_employee
            FOREIGN KEY (pos_driver_employee_id)
            REFERENCES employees(id)
            ON DELETE SET NULL;
    END IF;
END $$;
