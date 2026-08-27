-- Retires customers.billing_address. The customer's address is now held solely by
-- default_shipping_address (denormalised from the default entry of the Shipping
-- Address tab by CustomerService), and the billingAddress field has been removed
-- from the Customer entity and CustomerDTO.
--
-- Historically both columns were written together (CustomerImportService set the
-- same value into each), but customers created from the quick-create forms in
-- POS / CustomerSelector / the credit-payment modal got an address in
-- billing_address ONLY. Dropping the mapping without this backfill would make
-- their address vanish from every printed document and the POS receipt.
--
-- Idempotent: only fills rows where default_shipping_address is empty, and skips
-- entirely once billing_address no longer exists (see the drop note at the end).

DO $$
BEGIN
    IF to_regclass('public.customers') IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'customers'
          AND column_name = 'billing_address'
    ) THEN
        RETURN;
    END IF;

    UPDATE customers
       SET default_shipping_address = billing_address
     WHERE (default_shipping_address IS NULL OR btrim(default_shipping_address) = '')
       AND billing_address IS NOT NULL
       AND btrim(billing_address) <> '';
END $$;

-- The billing_address column itself is intentionally NOT dropped here. Nothing
-- reads or writes it any more (Hibernate ignores unmapped columns, including
-- under ddl-auto=validate), so it is inert, and leaving it keeps the pre-backfill
-- values recoverable across all tenant databases. Once every tenant has run this
-- migration and the addresses have been verified in the UI, it can be retired for
-- good with a follow-up migration containing:
--     ALTER TABLE customers DROP COLUMN IF EXISTS billing_address;
