-- Track reprint activity per invoice so the POS "Reprint Previous Invoices"
-- screen can show a real Reprint Count / Last Reprinted By / Last Reprinted Time
-- instead of always displaying zero/blank.
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS reprint_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS last_reprinted_by VARCHAR(255);
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS last_reprinted_at TIMESTAMP;
