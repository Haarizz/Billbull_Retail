-- POS stock reservations: non-batch "Reserve Stock" for layaways/holds.
-- Batch-controlled products already reserve via batch_allocation (POS_LAYAWAY source);
-- this table is the equivalent mechanism for non-batch products, scoped at the
-- warehouse level (POS checkout itself resolves branch -> default warehouse with no
-- bin selection, so reservation is scoped to match).
CREATE TABLE IF NOT EXISTS pos_stock_reservations (
    id BIGSERIAL PRIMARY KEY,
    source_document_type VARCHAR(40) NOT NULL,
    source_document_id BIGINT NOT NULL,
    source_line_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    product_code VARCHAR(80) NOT NULL,
    warehouse_id BIGINT NOT NULL,
    quantity NUMERIC(18,3) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'RESERVED',
    reserved_by VARCHAR(120),
    reserved_at TIMESTAMP NOT NULL,
    released_at TIMESTAMP,
    created_at TIMESTAMP,
    created_by VARCHAR(120),
    created_by_user_id BIGINT,
    updated_at TIMESTAMP,
    updated_by VARCHAR(120),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_pos_stock_reservation_source
    ON pos_stock_reservations (source_document_type, source_document_id, status);

CREATE INDEX IF NOT EXISTS idx_pos_stock_reservation_source_line
    ON pos_stock_reservations (source_document_type, source_line_id, status);

CREATE INDEX IF NOT EXISTS idx_pos_stock_reservation_product_warehouse
    ON pos_stock_reservations (product_id, warehouse_id, status);
