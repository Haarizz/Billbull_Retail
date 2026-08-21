UPDATE ledger_entries le
SET branch_id = je.branch_id
FROM journal_entries je
WHERE le.journal_id = CAST(je.id AS VARCHAR)
  AND le.branch_id IS NULL
  AND je.branch_id IS NOT NULL;
