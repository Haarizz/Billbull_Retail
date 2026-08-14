-- V79 — Credit Voucher subsystem: store credit issued by a Sales Return settled as CREDIT_VOUCHER.
--
-- A voucher is a LIABILITY (GL 2061 Credit Vouchers Issued), not a promotional discount. It is
-- deliberately its own pair of tables rather than an extension of any coupon/discount structure:
-- a coupon reduces the price of a sale, a voucher pays for one, and modelling them together would
-- understate both revenue and the outstanding liability.
--
-- Additive and idempotent, per the repo convention: guarded with to_regclass so it is a no-op
-- where Hibernate's ddl-auto has already created the tables, and safe to re-run.

DO $$
BEGIN
    IF to_regclass('public.credit_vouchers') IS NULL THEN
        CREATE TABLE credit_vouchers (
            id                    bigserial PRIMARY KEY,

            -- Human/business reference (CV-2026-000184). Safe to print and quote; never authorises.
            voucher_number        varchar(40)  NOT NULL,
            -- Redemption key (7KQ4-9PXM-2W8R), from a CSPRNG so it cannot be guessed from a
            -- neighbouring voucher the way the sequential number could.
            voucher_code          varchar(40)  NOT NULL,
            -- Scannable payload; separate column so the barcode format can change later without
            -- invalidating codes already in customers' hands.
            barcode_value         varchar(80),

            -- Nullable: POS supports walk-in returns, and such a voucher is bearer credit.
            customer_code         varchar(100),
            customer_name         varchar(255),
            customer_mobile       varchar(50),
            branch_id             bigint,

            -- numeric(15,2) matches every other monetary column in the schema. Never float:
            -- binary floating point cannot represent 0.10 exactly and a liability must balance.
            original_amount       numeric(15,2) NOT NULL DEFAULT 0,
            used_amount           numeric(15,2) NOT NULL DEFAULT 0,
            remaining_amount      numeric(15,2) NOT NULL DEFAULT 0,
            currency_code         varchar(10),

            issue_date            date NOT NULL,
            -- NULL means never expires, which is a valid configured policy (and a legal
            -- requirement in some jurisdictions).
            expiry_date           date,
            status                varchar(25) NOT NULL DEFAULT 'ACTIVE',

            cancelled_reason      varchar(500),
            cancelled_by          varchar(150),
            cancelled_at          timestamp,

            source_return_id      bigint,
            source_return_number  varchar(60),
            source_invoice_number varchar(60),

            -- BaseEntity audit columns.
            created_at            timestamp,
            created_by            varchar(255),
            updated_at            timestamp,
            updated_by            varchar(255),
            is_active             boolean DEFAULT true,

            -- The balance invariant, enforced by the database rather than trusted from code:
            -- no matter which path writes the row, it can never be left inconsistent.
            CONSTRAINT chk_credit_voucher_balance
                CHECK (used_amount + remaining_amount = original_amount),
            CONSTRAINT chk_credit_voucher_non_negative
                CHECK (used_amount >= 0 AND remaining_amount >= 0 AND original_amount >= 0)
        );
    END IF;
END $$;

-- Unique constraints as indexes so re-running is safe and the names are predictable.
-- voucher_code uniqueness is the real guarantee behind collision-free generation; the
-- application's pre-check is only an optimisation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_voucher_code   ON credit_vouchers (voucher_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_voucher_number ON credit_vouchers (voucher_number);

-- One voucher per Sales Return. This is what makes issuance idempotent under retry: even if two
-- concurrent confirmations both pass the application's existence check, the second insert fails
-- here rather than issuing a duplicate voucher for one refund.
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_voucher_source_return
    ON credit_vouchers (source_return_number)
    WHERE source_return_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_voucher_barcode        ON credit_vouchers (barcode_value);
CREATE INDEX IF NOT EXISTS idx_credit_voucher_customer       ON credit_vouchers (customer_code);
CREATE INDEX IF NOT EXISTS idx_credit_voucher_status_expiry  ON credit_vouchers (status, expiry_date);
CREATE INDEX IF NOT EXISTS idx_credit_voucher_source_invoice ON credit_vouchers (source_invoice_number);
CREATE INDEX IF NOT EXISTS idx_credit_voucher_branch         ON credit_vouchers (branch_id);


-- ---------------------------------------------------------------------------
-- Voucher history ledger.
--
-- remaining_amount on the voucher is a materialised running total; this is the record of how it
-- got there. Every entry carries the balance before and after, so a voucher's whole life can be
-- replayed and any drift between ledger and materialised balance is immediately visible.
-- Rows are append-only: a correction is a new ADJUSTED entry, never an update.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.credit_voucher_transactions') IS NULL THEN
        CREATE TABLE credit_voucher_transactions (
            id               bigserial PRIMARY KEY,
            voucher_id       bigint NOT NULL REFERENCES credit_vouchers (id),

            transaction_type varchar(25) NOT NULL,
            -- Always positive; direction is carried by transaction_type, not by the sign.
            amount           numeric(15,2) NOT NULL,
            balance_before   numeric(15,2) NOT NULL,
            balance_after    numeric(15,2) NOT NULL,

            reference_type   varchar(40),
            reference_number varchar(60),
            reference_id     bigint,

            performed_by     varchar(150),
            branch_id        bigint,
            pos_terminal_id  varchar(100),
            pos_session_id   bigint,
            business_date    date,
            notes            varchar(500),

            created_at       timestamp,
            created_by       varchar(255),
            updated_at       timestamp,
            updated_by       varchar(255),
            is_active        boolean DEFAULT true,

            CONSTRAINT chk_cv_txn_amount_positive CHECK (amount > 0)
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cv_txn_voucher       ON credit_voucher_transactions (voucher_id);
CREATE INDEX IF NOT EXISTS idx_cv_txn_reference     ON credit_voucher_transactions (reference_type, reference_number);
CREATE INDEX IF NOT EXISTS idx_cv_txn_session       ON credit_voucher_transactions (pos_session_id);
CREATE INDEX IF NOT EXISTS idx_cv_txn_business_date ON credit_voucher_transactions (business_date);
