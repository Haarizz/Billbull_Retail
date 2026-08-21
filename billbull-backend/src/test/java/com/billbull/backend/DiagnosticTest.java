package com.billbull.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
public class DiagnosticTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void runDiagnostics() {
        System.out.println("=== DIAGNOSTIC START ===");
        
        try {
            // 1. Total ledger entries with branch_id IS NULL
            Integer nullBranchCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ledger_entries WHERE branch_id IS NULL", Integer.class);
            System.out.println("1. Ledger entries with branch_id IS NULL: " + nullBranchCount);
            
            // 2. Ledger entries with a matching journal entry whose branch is non-null
            Integer recoverableCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ledger_entries le " +
                "JOIN journal_entries je ON le.journal_id = CAST(je.id AS VARCHAR) " +
                "WHERE le.branch_id IS NULL AND je.branch_id IS NOT NULL", Integer.class);
            System.out.println("2. Recoverable entries: " + recoverableCount);

            // 3. Ledger entries with no matching journal entry
            Integer noMatchCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ledger_entries le " +
                "LEFT JOIN journal_entries je ON le.journal_id = CAST(je.id AS VARCHAR) " +
                "WHERE le.branch_id IS NULL AND je.id IS NULL", Integer.class);
            System.out.println("3. Entries with no matching journal: " + noMatchCount);

            // 4. Ledger entries whose existing branch differs from the journal entry branch
            Integer diffBranchCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ledger_entries le " +
                "JOIN journal_entries je ON le.journal_id = CAST(je.id AS VARCHAR) " +
                "WHERE le.branch_id IS NOT NULL AND je.branch_id IS NOT NULL AND le.branch_id != je.branch_id", Integer.class);
            System.out.println("4. Entries with different branch: " + diffBranchCount);
            
            // Unrecoverable = no match + matching but journal branch is null
            Integer unrecoverableCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM ledger_entries le " +
                "LEFT JOIN journal_entries je ON le.journal_id = CAST(je.id AS VARCHAR) " +
                "WHERE le.branch_id IS NULL AND (je.id IS NULL OR je.branch_id IS NULL)", Integer.class);
            System.out.println("Unrecoverable records total: " + unrecoverableCount);

        } catch (Exception e) {
            e.printStackTrace();
        }
        
        System.out.println("=== DIAGNOSTIC END ===");
    }
}
