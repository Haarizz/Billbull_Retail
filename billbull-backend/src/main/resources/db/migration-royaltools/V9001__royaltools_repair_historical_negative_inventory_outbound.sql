-- V100__repair_historical_negative_inventory_outbound.sql
/*
 * This migration repairs historical negative inventory loss caused by the legacy Delivery Note outbound deduction bug.
 * 
 * Original affected documents:
 * 575 Delivery Notes
 * 1,199 item groups
 * Missing outbound quantity:
 * -7,049
 * 
 * The migration inserts only the missing historical inventory movements.
 */

DO $$
DECLARE
    v_candidate_count INT;
    v_candidate_sum NUMERIC;
    v_bin_violation_count INT;
    v_inserted_count INT;
    v_post_mismatched_groups INT;
    v_post_missing_qty NUMERIC;
BEGIN
    -- 0. Defensive Database Identity Guard
    IF current_database() != 'billbull_royaltools' THEN
        RAISE EXCEPTION 'MIGRATION FAILED: This repair migration is strictly isolated to the billbull_royaltools database. Current database is %', current_database();
    END IF;


    -- 1. Create a temporary table with the exact repair candidates
    CREATE TEMP TABLE tmp_repair_candidates AS
    WITH Expected AS (
        SELECT 
            dn.id AS dn_id, 
            dn.dn_number, 
            dn.dn_date, 
            dn.warehouse_id, 
            dn.branch_id, 
            dn.created_by_user_id, 
            dni.product_id, 
            MAX(dni.bin_id) AS bin_id, 
            SUM(COALESCE(dni.current_qty, 0) + COALESCE(dni.foc, 0)) * -1 AS expected_outbound
        FROM delivery_notes dn 
        JOIN delivery_note_items dni ON dni.delivery_note_id = dn.id
        WHERE dn.status = 'DELIVERED'
        GROUP BY dn.id, dn.dn_number, dn.dn_date, dn.warehouse_id, dn.branch_id, dn.created_by_user_id, dni.product_id
    ),
    Actual AS (
        SELECT 
            source_id AS dn_id, 
            product_id, 
            COALESCE(SUM(quantity), 0) AS actual_outbound
        FROM stock_movements 
        WHERE source_type = 'DELIVERY_NOTE' AND is_active = true 
        GROUP BY source_id, product_id
    )
    SELECT 
        e.dn_id, 
        e.dn_number, 
        e.product_id, 
        e.warehouse_id, 
        e.branch_id, 
        e.bin_id,
        (e.expected_outbound - COALESCE(a.actual_outbound, 0)) AS repair_quantity,
        e.dn_date AS movement_date, 
        e.created_by_user_id, 
        u.username AS created_by
    FROM Expected e 
    LEFT JOIN Actual a ON e.dn_id = a.dn_id AND e.product_id = a.product_id
    LEFT JOIN users u ON e.created_by_user_id = u.id
    WHERE e.expected_outbound != COALESCE(a.actual_outbound, 0);

    -- 2. Idempotency Check with Zero-Candidate Validation
    SELECT COUNT(*), COALESCE(SUM(repair_quantity), 0) 
    INTO v_candidate_count, v_candidate_sum 
    FROM tmp_repair_candidates;

    IF v_candidate_count = 0 THEN
        -- Strengthened zero-candidate branch: Verify historical postcondition is actually clean
        WITH Expected AS (
            SELECT dn.id AS dn_id, dni.product_id, SUM(COALESCE(dni.current_qty, 0) + COALESCE(dni.foc, 0)) * -1 AS expected_outbound
            FROM delivery_notes dn JOIN delivery_note_items dni ON dni.delivery_note_id = dn.id
            WHERE dn.status = 'DELIVERED'
            GROUP BY dn.id, dni.product_id
        ),
        Actual AS (
            SELECT source_id AS dn_id, product_id, COALESCE(SUM(quantity), 0) AS actual_outbound
            FROM stock_movements WHERE source_type = 'DELIVERY_NOTE' AND is_active = true 
            GROUP BY source_id, product_id
        ),
        RemainingMissing AS (
            SELECT (e.expected_outbound - COALESCE(a.actual_outbound, 0)) AS qty
            FROM Expected e LEFT JOIN Actual a ON e.dn_id = a.dn_id AND e.product_id = a.product_id
            WHERE e.expected_outbound != COALESCE(a.actual_outbound, 0)
        )
        SELECT COUNT(*), COALESCE(SUM(qty), 0) INTO v_post_mismatched_groups, v_post_missing_qty FROM RemainingMissing;

        IF v_post_mismatched_groups != 0 OR v_post_missing_qty != 0 THEN
            RAISE EXCEPTION 'MIGRATION FAILED: Candidate count is 0, but postcondition is not clean (mismatches: %, qty gap: %). This indicates unexpected data drift.', v_post_mismatched_groups, v_post_missing_qty;
        END IF;

        RAISE NOTICE 'Idempotency verified: 0 remaining candidates and clean postconditions. Migration already successfully applied.';
        DROP TABLE tmp_repair_candidates;
        RETURN;
    END IF;

    -- 3. Precondition Guard
    IF v_candidate_count != 1199 OR v_candidate_sum != -7049 THEN
        RAISE EXCEPTION 'MIGRATION FAILED: Candidate verification failed. Expected count 1199, got %. Expected sum -7049, got %.', v_candidate_count, v_candidate_sum;
    END IF;

    -- 4. Bin Safety Guard (NULL-safe)
    SELECT COUNT(*) INTO v_bin_violation_count
    FROM (
        SELECT delivery_note_id, product_id 
        FROM delivery_note_items 
        GROUP BY delivery_note_id, product_id 
        HAVING COUNT(DISTINCT COALESCE(bin_id::text, '__NULL__')) > 1
    ) sub;

    IF v_bin_violation_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION FAILED: Bin uniqueness violation. Found % cases where a DN product has multiple distinct bin identities.', v_bin_violation_count;
    END IF;

    -- 5. Insert Repair Movements
    INSERT INTO stock_movements (
        source_type, source_id, reference_no, product_id, warehouse_id, branch_id, bin_id,
        quantity, movement_date, created_at, updated_at, created_by, created_by_user_id, is_active, negative_override
    )
    SELECT 
        'DELIVERY_NOTE', dn_id, dn_number, product_id, warehouse_id, branch_id, bin_id,
        repair_quantity, movement_date, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, created_by, created_by_user_id, true, false
    FROM tmp_repair_candidates;
    
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    -- 6. Exact-count Post-Insert Validation
    IF v_inserted_count != 1199 THEN
        RAISE EXCEPTION 'MIGRATION FAILED: Inserted count mismatch. Expected 1199, inserted %.', v_inserted_count;
    END IF;

    -- 7. Post-Insert Reconciliation Guard
    WITH Expected AS (
        SELECT dn.id AS dn_id, dni.product_id, SUM(COALESCE(dni.current_qty, 0) + COALESCE(dni.foc, 0)) * -1 AS expected_outbound
        FROM delivery_notes dn JOIN delivery_note_items dni ON dni.delivery_note_id = dn.id
        WHERE dn.status = 'DELIVERED'
        GROUP BY dn.id, dni.product_id
    ),
    Actual AS (
        SELECT source_id AS dn_id, product_id, COALESCE(SUM(quantity), 0) AS actual_outbound
        FROM stock_movements WHERE source_type = 'DELIVERY_NOTE' AND is_active = true 
        GROUP BY source_id, product_id
    ),
    RemainingMissing AS (
        SELECT (e.expected_outbound - COALESCE(a.actual_outbound, 0)) AS qty
        FROM Expected e LEFT JOIN Actual a ON e.dn_id = a.dn_id AND e.product_id = a.product_id
        WHERE e.expected_outbound != COALESCE(a.actual_outbound, 0)
    )
    SELECT COUNT(*), COALESCE(SUM(qty), 0) INTO v_post_mismatched_groups, v_post_missing_qty FROM RemainingMissing;

    IF v_post_mismatched_groups != 0 OR v_post_missing_qty != 0 THEN
        RAISE EXCEPTION 'MIGRATION FAILED: Post-insert reconciliation failed. Remaining mismatched groups: %, remaining missing quantity: %.', v_post_mismatched_groups, v_post_missing_qty;
    END IF;

    RAISE NOTICE 'Successfully inserted % missing outbound movements. Total quantity: %. Reconciliation verified 0 remaining mismatches.', v_inserted_count, v_candidate_sum;

    DROP TABLE tmp_repair_candidates;
END $$;
