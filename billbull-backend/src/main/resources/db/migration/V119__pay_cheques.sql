-- V119 — Pay Cheques: outgoing cheque books, the cheques drawn on them, and the link from each
-- cheque back to the payments it settles.
--
-- Additive and idempotent, like every script in this directory (CREATE ... IF NOT EXISTS,
-- to_regclass-guarded constraints), because Flyway runs before Hibernate on every boot and
-- ddl-auto is still `update` on tenants that have not been baselined.
--
-- V118 is the highest applied version, so this takes V119. Nothing is renumbered: with
-- spring.flyway.out-of-order unset, moving a script into a retired gap (V2/V4/V5/V98) fails the
-- migration on every tenant that already ran a higher version.
--
-- Accounting: no GL is posted from these tables. The payment a cheque settles (a CHEQUE-mode
-- payment voucher, or a Cheque-mode expense) already posted Dr AP / Dr Expense, Cr Bank when it
-- was posted or paid; a cheque is the instrument for that payment, so posting again here would
-- double-count the bank credit.

-- ---------------------------------------------------------------------------
-- 1. Cheque books — one per bank GL account the company writes cheques on
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cheque_books (
    id                  BIGSERIAL PRIMARY KEY,
    gl_account_id       VARCHAR(64),
    gl_account_code     VARCHAR(50),
    gl_account_name     VARCHAR(255),
    bank_name           VARCHAR(150)  NOT NULL,
    bank_branch         VARCHAR(150),
    account_name        VARCHAR(255),
    account_number      VARCHAR(64),
    iban                VARCHAR(64),
    currency            VARCHAR(10)   NOT NULL DEFAULT 'AED',
    next_cheque_number  VARCHAR(30)   NOT NULL,
    template_id         BIGINT,
    created_at          TIMESTAMP,
    created_by          VARCHAR(255),
    created_by_user_id  BIGINT,
    updated_at          TIMESTAMP,
    updated_by          VARCHAR(255),
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------------
-- 2. Pay cheques
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pay_cheques (
    id                  BIGSERIAL PRIMARY KEY,
    cheque_number       VARCHAR(30)   NOT NULL,
    cheque_book_id      BIGINT        NOT NULL,
    branch_id           BIGINT,
    payment_type        VARCHAR(20)   NOT NULL,
    payee_name          VARCHAR(255)  NOT NULL,
    vendor_id           VARCHAR(100),
    cheque_date         DATE          NOT NULL,
    amount              NUMERIC(15,2) NOT NULL,
    memo                VARCHAR(500),
    status              VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
    approved_by         VARCHAR(255),
    approved_at         TIMESTAMP,
    printed_by          VARCHAR(255),
    printed_at          TIMESTAMP,
    print_count         INTEGER       NOT NULL DEFAULT 0,
    issued_by           VARCHAR(255),
    issued_at           TIMESTAMP,
    paid_by             VARCHAR(255),
    paid_date           DATE,
    reconciled_by       VARCHAR(255),
    reconciled_date     DATE,
    cancelled_by        VARCHAR(255),
    cancelled_at        TIMESTAMP,
    cancel_reason       VARCHAR(500),
    created_at          TIMESTAMP,
    created_by          VARCHAR(255),
    created_by_user_id  BIGINT,
    updated_at          TIMESTAMP,
    updated_by          VARCHAR(255),
    is_active           BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_pay_cheque_status ON pay_cheques (status);
CREATE INDEX IF NOT EXISTS idx_pay_cheque_branch ON pay_cheques (branch_id);

-- A cheque number is used once per book. A cancelled cheque that never left the office frees
-- its number, so the rule only covers live cheques.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pay_cheque_book_number_live
    ON pay_cheques (cheque_book_id, cheque_number)
    WHERE status <> 'CANCELLED' AND is_active;

DO $$
BEGIN
    IF to_regclass('public.pay_cheques') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pay_cheque_status') THEN
        ALTER TABLE pay_cheques ADD CONSTRAINT ck_pay_cheque_status
            CHECK (status IN ('DRAFT', 'APPROVED', 'PRINTED', 'ISSUED', 'PAID', 'RECONCILED', 'CANCELLED'));
    END IF;
    IF to_regclass('public.pay_cheques') IS NOT NULL
       AND to_regclass('public.cheque_books') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pay_cheque_book') THEN
        ALTER TABLE pay_cheques ADD CONSTRAINT fk_pay_cheque_book
            FOREIGN KEY (cheque_book_id) REFERENCES cheque_books (id);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Allocations — which payment voucher / expense rows a cheque pays
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pay_cheque_allocations (
    id              BIGSERIAL PRIMARY KEY,
    pay_cheque_id   BIGINT        NOT NULL,
    source_type     VARCHAR(30)   NOT NULL,
    source_id       BIGINT        NOT NULL,
    source_number   VARCHAR(100),
    reference       VARCHAR(255),
    amount          NUMERIC(15,2) NOT NULL,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_pca_cheque ON pay_cheque_allocations (pay_cheque_id);

-- A payment can sit on only one live cheque. Cancelling a cheque deactivates its allocations,
-- which puts the payment back in the vendor's cheque due.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pca_source_live
    ON pay_cheque_allocations (source_type, source_id)
    WHERE is_active;

DO $$
BEGIN
    IF to_regclass('public.pay_cheque_allocations') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pca_cheque') THEN
        ALTER TABLE pay_cheque_allocations ADD CONSTRAINT fk_pca_cheque
            FOREIGN KEY (pay_cheque_id) REFERENCES pay_cheques (id);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Activity log — append-only timeline shown on the cheque detail screen
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pay_cheque_events (
    id              BIGSERIAL PRIMARY KEY,
    pay_cheque_id   BIGINT        NOT NULL,
    action          VARCHAR(50)   NOT NULL,
    note            VARCHAR(500),
    username        VARCHAR(255),
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pce_cheque ON pay_cheque_events (pay_cheque_id);
