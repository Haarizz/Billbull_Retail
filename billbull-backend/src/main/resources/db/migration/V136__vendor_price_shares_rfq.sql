-- V136 — Vendor Price Shares (RFQ) module.
--
--   purchase_rfqs              one Request for Quotation (header, terms, status)
--   purchase_rfq_items         requested product lines (product master link required for LPO creation)
--   purchase_rfq_vendors       vendors invited to the RFQ + their quotation header (one response per vendor)
--   purchase_rfq_offers        a vendor's offer for one item (several per item allowed: original + alternatives)
--   purchase_rfq_negotiations  better-price requests sent to a vendor for one offer, with reply history (JSON)
--   purchase_rfq_activity      append-only activity timeline
--   purchase_rfq_lpos          LPOs created from the RFQ (one per vendor per creation run)
--
-- Additive and idempotent. V135 is the highest version before this.

CREATE TABLE IF NOT EXISTS purchase_rfqs (
    id                   BIGSERIAL PRIMARY KEY,
    created_at           TIMESTAMP,
    created_by           VARCHAR(255),
    created_by_user_id   BIGINT,
    updated_at           TIMESTAMP,
    updated_by           VARCHAR(255),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    rfq_number           VARCHAR(40) NOT NULL,
    title                VARCHAR(255) NOT NULL,
    reference            VARCHAR(120),
    status               VARCHAR(30) NOT NULL,
    deadline             DATE,
    expected_delivery    DATE,
    delivery_location    VARCHAR(255),
    warehouse_id         BIGINT,
    warehouse_name       VARCHAR(255),
    currency             VARCHAR(10),
    tax_pref             VARCHAR(40),
    payment_terms        VARCHAR(120),
    delivery_terms       VARCHAR(120),
    quotation_validity   VARCHAR(60),
    shipping_reqs        TEXT,
    notes                TEXT,
    vendor_instructions  TEXT,
    branch_id            BIGINT,
    branch_name          VARCHAR(255),
    sent_at              TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_rfqs_number ON purchase_rfqs (rfq_number);
CREATE INDEX IF NOT EXISTS ix_purchase_rfqs_status ON purchase_rfqs (status);

CREATE TABLE IF NOT EXISTS purchase_rfq_items (
    id                   BIGSERIAL PRIMARY KEY,
    created_at           TIMESTAMP,
    created_by           VARCHAR(255),
    created_by_user_id   BIGINT,
    updated_at           TIMESTAMP,
    updated_by           VARCHAR(255),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    rfq_id               BIGINT NOT NULL REFERENCES purchase_rfqs (id) ON DELETE CASCADE,
    line_no              INTEGER,
    product_id           BIGINT NOT NULL,
    item_code            VARCHAR(120),
    item_name            VARCHAR(255) NOT NULL,
    description          TEXT,
    category             VARCHAR(255),
    brand                VARCHAR(255),
    model                VARCHAR(255),
    unit                 VARCHAR(40),
    qty_needed           INTEGER NOT NULL,
    qty_ordered          INTEGER NOT NULL DEFAULT 0,
    min_spec             TEXT,
    alt_brand_allowed    BOOLEAN NOT NULL DEFAULT TRUE,
    partial_allowed      BOOLEAN NOT NULL DEFAULT TRUE,
    expected_delivery    DATE,
    warranty_required    VARCHAR(120),
    awarded_offer_id     BIGINT
);
CREATE INDEX IF NOT EXISTS ix_purchase_rfq_items_rfq ON purchase_rfq_items (rfq_id);
CREATE INDEX IF NOT EXISTS ix_purchase_rfq_items_product ON purchase_rfq_items (product_id);

CREATE TABLE IF NOT EXISTS purchase_rfq_vendors (
    id                   BIGSERIAL PRIMARY KEY,
    created_at           TIMESTAMP,
    created_by           VARCHAR(255),
    created_by_user_id   BIGINT,
    updated_at           TIMESTAMP,
    updated_by           VARCHAR(255),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    rfq_id               BIGINT NOT NULL REFERENCES purchase_rfqs (id) ON DELETE CASCADE,
    vendor_id            BIGINT NOT NULL,
    vendor_name          VARCHAR(255),
    vendor_code          VARCHAR(120),
    email                VARCHAR(255),
    phone                VARCHAR(80),
    response_status      VARCHAR(30) NOT NULL,
    submitted_at         TIMESTAMP,
    payment_terms        VARCHAR(120),
    delivery_terms       VARCHAR(120),
    validity             DATE,
    version              INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_purchase_rfq_vendors_rfq ON purchase_rfq_vendors (rfq_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_rfq_vendors_rfq_vendor ON purchase_rfq_vendors (rfq_id, vendor_id);

CREATE TABLE IF NOT EXISTS purchase_rfq_offers (
    id                   BIGSERIAL PRIMARY KEY,
    created_at           TIMESTAMP,
    created_by           VARCHAR(255),
    created_by_user_id   BIGINT,
    updated_at           TIMESTAMP,
    updated_by           VARCHAR(255),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    rfq_vendor_id        BIGINT NOT NULL REFERENCES purchase_rfq_vendors (id) ON DELETE CASCADE,
    rfq_item_id          BIGINT NOT NULL,
    brand                VARCHAR(255),
    model                VARCHAR(255),
    sku                  VARCHAR(255),
    description          TEXT,
    unit_price           NUMERIC(19, 4) NOT NULL DEFAULT 0,
    quoted_qty           INTEGER NOT NULL DEFAULT 0,
    available_stock      INTEGER,
    availability         VARCHAR(20),
    dispatch_date        DATE,
    delivery_date        DATE,
    warranty             VARCHAR(120),
    country_of_origin    VARCHAR(120),
    tax_percent          NUMERIC(7, 2),
    discount_percent     NUMERIC(7, 2),
    shipping_cost        NUMERIC(19, 4),
    additional_cost      NUMERIC(19, 4),
    valid_until          DATE,
    notes                TEXT,
    alternative          BOOLEAN NOT NULL DEFAULT FALSE,
    alternative_reason   TEXT,
    bulk_tiers_json      TEXT,
    version              INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_purchase_rfq_offers_vendor ON purchase_rfq_offers (rfq_vendor_id);
CREATE INDEX IF NOT EXISTS ix_purchase_rfq_offers_item ON purchase_rfq_offers (rfq_item_id);

CREATE TABLE IF NOT EXISTS purchase_rfq_negotiations (
    id                   BIGSERIAL PRIMARY KEY,
    created_at           TIMESTAMP,
    created_by           VARCHAR(255),
    created_by_user_id   BIGINT,
    updated_at           TIMESTAMP,
    updated_by           VARCHAR(255),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    rfq_id               BIGINT NOT NULL REFERENCES purchase_rfqs (id) ON DELETE CASCADE,
    rfq_item_id          BIGINT NOT NULL,
    vendor_id            BIGINT NOT NULL,
    offer_id             BIGINT NOT NULL,
    status               VARCHAR(20) NOT NULL,
    target_price         NUMERIC(19, 4),
    target_qty           INTEGER,
    message              TEXT,
    deadline             DATE,
    requested_at         TIMESTAMP,
    responded_at         TIMESTAMP,
    response_message     TEXT,
    previous_price       NUMERIC(19, 4),
    revised_price        NUMERIC(19, 4),
    history_json         TEXT
);
CREATE INDEX IF NOT EXISTS ix_purchase_rfq_negotiations_rfq ON purchase_rfq_negotiations (rfq_id);

CREATE TABLE IF NOT EXISTS purchase_rfq_activity (
    id                   BIGSERIAL PRIMARY KEY,
    created_at           TIMESTAMP,
    created_by           VARCHAR(255),
    created_by_user_id   BIGINT,
    updated_at           TIMESTAMP,
    updated_by           VARCHAR(255),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    rfq_id               BIGINT NOT NULL REFERENCES purchase_rfqs (id) ON DELETE CASCADE,
    type                 VARCHAR(40) NOT NULL,
    description          TEXT,
    actor                VARCHAR(255),
    actor_type           VARCHAR(20),
    occurred_at          TIMESTAMP NOT NULL,
    ref                  VARCHAR(120),
    old_value            VARCHAR(255),
    new_value            VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS ix_purchase_rfq_activity_rfq ON purchase_rfq_activity (rfq_id);

CREATE TABLE IF NOT EXISTS purchase_rfq_lpos (
    rfq_id               BIGINT NOT NULL REFERENCES purchase_rfqs (id) ON DELETE CASCADE,
    lpo_id               BIGINT,
    lpo_number           VARCHAR(80) NOT NULL,
    vendor_id            BIGINT,
    vendor_name          VARCHAR(255),
    created_on           TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_purchase_rfq_lpos_rfq ON purchase_rfq_lpos (rfq_id);
