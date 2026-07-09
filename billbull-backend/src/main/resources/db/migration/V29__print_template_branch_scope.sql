-- Adds optional branch scoping to print_templates. Existing rows (Sales/Purchases) stay
-- NULL = global/shared, unchanged behavior. Only new POS categories ("POS Invoice",
-- "POS Credit Note") populate branch_id, one default template per branch.

ALTER TABLE print_templates
    ADD COLUMN IF NOT EXISTS branch_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_print_template_category_branch
    ON print_templates (category, branch_id);
