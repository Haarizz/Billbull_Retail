package com.billbull.platform.errors;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/**
 * Turns the technical facts of an error into an explanation a support person can act on: what
 * happened in plain language, what it means for the client's business (sales, stock, books), the
 * usual causes in a BillBull deployment, and who should do what.
 *
 * <p>The catalogue is an ordered list of rules; the first that matches wins, so specific rules
 * (an accounting code, a SQL state) come before broad ones (any NullPointerException, any browser
 * error). Classification is stored with each group for filtering but recomputed on every sync and
 * at startup, so improving a rule here re-labels history.
 */
public final class ErrorExplainer {

    private ErrorExplainer() {}

    public enum Category {
        APPLICATION_BUG("Software defect", "The program hit a situation it does not handle. Needs a code fix."),
        DATA_INTEGRITY("Data conflict", "The data being saved conflicts with what is already in the database."),
        DATA_VALIDATION("Invalid or incomplete data", "A value was missing, malformed or out of range."),
        BUSINESS_RULE("Business rule", "The ERP refused the action on purpose and told the user why."),
        ACCOUNTING_RULE("Accounting control", "A financial control (period lock, balancing, dimensions) refused the posting."),
        CONFIGURATION("Setup / configuration", "Something in the client's setup is missing or inconsistent."),
        CONCURRENCY("Simultaneous activity", "Two users or processes worked on the same records at the same time."),
        DATABASE_SCHEMA("Deployment mismatch", "The database structure does not match the software that is running."),
        INFRASTRUCTURE("Server / infrastructure", "The server, database connection, memory or disk failed."),
        PERFORMANCE("Slow / timed out", "Work took too long and was stopped."),
        INTEGRATION("External service", "A service outside BillBull (e-mail, WhatsApp, a remote API) failed."),
        PRINTING("Printing & documents", "A printer, PDF or label could not be produced."),
        FRONTEND("Browser / screen", "The error happened in the user's browser."),
        CONNECTIVITY("Network", "The browser or server lost its network connection.");

        public final String label;
        public final String description;

        Category(String label, String description) {
            this.label = label;
            this.description = description;
        }
    }

    public enum Severity { CRITICAL, HIGH, MEDIUM, LOW }

    /** Who is expected to act first. */
    public enum Owner {
        CLIENT_ADMIN("Client's administrator / power user"),
        SUPPORT("BillBull support"),
        DEVELOPER("BillBull development"),
        INFRA("Server / hosting operator");

        public final String label;

        Owner(String label) {
            this.label = label;
        }
    }

    record Rule(String code, Category category, Severity severity, Owner owner, String title, String what,
                List<String> causes, List<String> actions, Predicate<ErrorFacts> when) {}

    public record Explanation(String ruleCode, String title, Category category, Severity severity, Owner owner,
                              ErpModule module, String whatHappened, String businessImpact, List<String> likelyCauses,
                              List<String> recommendedActions, String technicalSummary) {

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ruleCode", ruleCode);
            m.put("title", title);
            m.put("category", category.name());
            m.put("categoryLabel", category.label);
            m.put("categoryDescription", category.description);
            m.put("severity", severity.name());
            m.put("owner", owner.name());
            m.put("ownerLabel", owner.label);
            m.put("module", module.name());
            m.put("moduleLabel", module.label());
            m.put("whatHappened", whatHappened);
            m.put("businessImpact", businessImpact);
            m.put("likelyCauses", likelyCauses);
            m.put("recommendedActions", recommendedActions);
            m.put("technicalSummary", technicalSummary);
            return m;
        }
    }

    // ===================================================================================== catalogue

    private static final List<Rule> RULES = new ArrayList<>();

    private static void rule(String code, Category c, Severity s, Owner o, String title, String what,
                             List<String> causes, List<String> actions, Predicate<ErrorFacts> when) {
        RULES.add(new Rule(code, c, s, o, title, what, causes, actions, when));
    }

    private static boolean code(ErrorFacts f, String c) {
        return f.errorCode() != null && f.errorCode().startsWith(c);
    }

    /** RuntimeException / IllegalArgumentException / IllegalStateException thrown on purpose with a message. */
    private static boolean businessRefusal(ErrorFacts f) {
        String ex = f.exceptionClass();
        boolean plain = "java.lang.RuntimeException".equals(ex) || "java.lang.IllegalArgumentException".equals(ex)
                || "java.lang.IllegalStateException".equals(ex);
        return plain && f.rootCauseClass() == null && f.message() != null && !f.message().isBlank()
                && f.httpStatus() != null && f.httpStatus() >= 400 && f.httpStatus() < 500;
    }

    private static boolean client(ErrorFacts f) {
        return f.source() == ErrorFacts.Source.CLIENT;
    }

    static {
        // ---------------------------------------------------------------- accounting controls (posting engine codes)
        rule("ACC_PERIOD_LOCKED", Category.ACCOUNTING_RULE, Severity.LOW, Owner.CLIENT_ADMIN,
                "Posting refused: the accounting period is closed",
                "Someone tried to post a transaction dated inside an accounting period that has been closed. BillBull "
                        + "refuses it — both in the posting engine and with a database trigger — so closed books never change.",
                List.of("The document date is in a month that finance has already closed (a back-dated entry).",
                        "The period was closed earlier than the team expected, while documents were still being entered.",
                        "The device's date or time zone is wrong, so 'today' falls in an old period."),
                List.of("Post with a date in an open period, or ask the finance controller to reopen the period briefly "
                                + "(Financials › Fiscal years & periods), post, and close it again.",
                        "If many users hit this just after month end, confirm the close date with the client's accountant."),
                f -> code(f, "PERIOD_LOCKED") || f.textHas("period_locked", "falls in a closed accounting period"));

        rule("ACC_UNBALANCED", Category.ACCOUNTING_RULE, Severity.HIGH, Owner.DEVELOPER,
                "Journal does not balance (debits ≠ credits)",
                "The posting engine built a journal whose debits and credits differ by more than the rounding "
                        + "tolerance, and refused to post it. Nothing was written to the ledger.",
                List.of("For a manual journal voucher: the user's lines simply don't add up.",
                        "For an automatic posting (invoice, GRN, POS sale, payment): a posting rule maps a line to no "
                                + "account, or VAT / discount / rounding is calculated differently on the two sides.",
                        "Multi-currency documents where the exchange-rate conversion rounds each side differently."),
                List.of("Find the source document from the request ID and path.",
                        "If it came from an automatic posting, check Financials › Posting rules for that transaction "
                                + "type and the VAT rounding settings, then escalate to development with the request ID.",
                        "If it is a manual voucher, the user corrects the lines."),
                f -> code(f, "UNBALANCED_ENTRY"));

        rule("ACC_MISSING_DIMENSION", Category.ACCOUNTING_RULE, Severity.MEDIUM, Owner.CLIENT_ADMIN,
                "Posting refused: branch or cost centre missing",
                "A ledger line needed a dimension (branch, outlet or cost centre) that the transaction did not carry, "
                        + "so the posting was refused.",
                List.of("The branch is not linked to a cost centre.",
                        "The user was working in an 'All branches' context instead of a specific branch.",
                        "A posting rule requires a dimension that this kind of document does not provide."),
                List.of("Map the branch to its cost centre (Financials › Cost centres).",
                        "Ask the user to pick a specific branch and retry."),
                f -> code(f, "MISSING_DIMENSION"));

        rule("ACC_ACCOUNT_INACTIVE", Category.CONFIGURATION, Severity.MEDIUM, Owner.CLIENT_ADMIN,
                "Posting refused: a GL account is deactivated",
                "The transaction would post to a general-ledger account that has been deactivated in the chart of accounts.",
                List.of("An account used by a posting rule, payment method, tax code or bank was deactivated.",
                        "A chart-of-accounts clean-up removed an account that is still referenced."),
                List.of("Reactivate the account, or point the posting rule / payment method / tax setting at the new account."),
                f -> code(f, "ACCOUNT_INACTIVE"));

        rule("ACC_FX_RATE", Category.CONFIGURATION, Severity.MEDIUM, Owner.CLIENT_ADMIN,
                "No exchange rate for the document's currency and date",
                "A foreign-currency document could not be converted to the base currency because there is no usable "
                        + "exchange rate for its date.",
                List.of("Rates were not entered for that date or currency.", "The document is back-dated before the first rate."),
                List.of("Add the rate in Financials › Currencies & exchange rates and retry."),
                f -> code(f, "INVALID_FX_RATE"));

        rule("ACC_CREDIT_LIMIT", Category.BUSINESS_RULE, Severity.LOW, Owner.CLIENT_ADMIN,
                "Customer is over their credit limit",
                "The sale would push the customer's outstanding balance past their approved credit limit, so it was refused.",
                List.of("Unpaid invoices have built up.", "The credit limit is set too low for this customer."),
                List.of("Collect a payment, sell on cash, or have an authorised person raise the limit."),
                f -> code(f, "CREDIT_LIMIT_BREACH") || (businessRefusal(f) && f.textHas("credit limit")));

        rule("POS_RECONCILIATION", Category.BUSINESS_RULE, Severity.MEDIUM, Owner.CLIENT_ADMIN,
                "Till / day-close reconciliation did not balance",
                "Closing a POS session or business day was refused because the counted totals did not reconcile with "
                        + "what the system expected (cash, card, credit, returns or rounding).",
                List.of("Cash count differs from expected cash (miscount, unrecorded pay-in/pay-out).",
                        "Card settlements or online payments not matched.",
                        "Returns or voids not linked to the session."),
                List.of("Open the day-close breakdown on the till to see which bucket is off; recount.",
                        "Record missing cash movements, or get supervisor approval for the variance."),
                f -> code(f, "RECONCILIATION_FAILED"));

        // ---------------------------------------------------------------- deployment / infrastructure
        rule("DB_SCHEMA_MISMATCH", Category.DATABASE_SCHEMA, Severity.CRITICAL, Owner.DEVELOPER,
                "Database structure does not match the running software",
                "The software asked the database for a table, column or function that does not exist in this client's "
                        + "database. Every action that touches it will fail until the schema is fixed.",
                List.of("A Flyway migration did not run or failed during the last deployment.",
                        "A build was deployed against the wrong database or Spring profile.",
                        "The database was restored from an older backup after a newer build was deployed."),
                List.of("Open this client's Health tab: check the Flyway version and any failed or pending migrations.",
                        "Check the deployment log for the migration error and redeploy; never hand-create the column.",
                        "Compare the deployed build (Dashboard › Deployed builds) with the other clients."),
                f -> f.sql("42P01", "42703", "42883", "42P10") || f.has("SchemaManagementException", "FlywayException",
                        "FlywayValidateException")
                        || (f.textHas("does not exist") && f.textHas("relation \"", "column \"", "function ")));

        rule("DB_POOL_EXHAUSTED", Category.INFRASTRUCTURE, Severity.CRITICAL, Owner.INFRA,
                "Database connection pool exhausted",
                "Every database connection was busy and the request gave up waiting. Users see the system as frozen "
                        + "or very slow, across all modules.",
                List.of("Long-running reports or exports holding connections.",
                        "A transaction left open ('idle in transaction') by a stuck request.",
                        "A traffic spike (many tills syncing at once) beyond the pool size."),
                List.of("On the database, look at pg_stat_activity for long-running or idle-in-transaction sessions.",
                        "Check the Health tab for heap pressure; restart the backend only as a last resort.",
                        "Escalate to development with the time window if it recurs."),
                f -> f.textHas("connection is not available, request timed out"));

        rule("DB_UNREACHABLE", Category.INFRASTRUCTURE, Severity.CRITICAL, Owner.INFRA,
                "Database unreachable",
                "The backend could not open or keep a connection to its PostgreSQL database, so nothing could be read or saved.",
                List.of("PostgreSQL is stopped, restarting or out of disk space.",
                        "Network or firewall problem between the backend and the database.",
                        "Database credentials changed."),
                List.of("Check the PostgreSQL service and disk on the server.", "Check the Health tab — the database check will be failing too."),
                f -> f.sql("08", "57P01", "57P02", "57P03", "53300")
                        || f.has("CannotCreateTransactionException", "CannotGetJdbcConnectionException", "JDBCConnectionException")
                        || f.textHas("connection refused", "terminating connection due to administrator command"));

        rule("OUT_OF_MEMORY", Category.INFRASTRUCTURE, Severity.CRITICAL, Owner.INFRA,
                "Server ran out of memory",
                "The Java process ran out of heap memory. Requests in flight failed and the server may become unstable.",
                List.of("A very large report, export or PDF batch.", "Too many documents rendered at the same time.",
                        "The heap (-Xmx) is too small for this client's data volume."),
                List.of("Check the Health tab heap figures; restart the service if it is unstable.",
                        "Identify the report or export running at that time; raise -Xmx on the service if needed."),
                f -> f.has("OutOfMemoryError") || f.textHas("java heap space", "gc overhead limit exceeded"));

        rule("DISK_FULL", Category.INFRASTRUCTURE, Severity.CRITICAL, Owner.INFRA,
                "Server disk is full",
                "A write failed because there is no space left on the server's disk (database, uploads or logs).",
                List.of("Log or backup files have filled the disk.", "Uploads (images, attachments) growth."),
                List.of("Free space on the server (old backups, archived logs) and check the Health tab's disk figure."),
                f -> f.sql("53100") || f.textHas("no space left on device", "could not extend file"));

        // ---------------------------------------------------------------- concurrency / performance
        rule("DB_DEADLOCK", Category.CONCURRENCY, Severity.MEDIUM, Owner.DEVELOPER,
                "Two transactions blocked each other (deadlock)",
                "Two operations were each waiting for records the other had locked; the database cancelled one of them. "
                        + "The cancelled action was not saved and can simply be retried.",
                List.of("Two tills or users updating the same stock items or documents at the same moment.",
                        "A background job (balance rebuild, sweep) running over records users are editing."),
                List.of("Ask the user to retry.", "If it recurs for the same screen, escalate to development with the request IDs."),
                f -> f.sql("40P01", "40001") || f.has("DeadlockLoserDataAccessException", "CannotAcquireLockException")
                        || f.textHas("deadlock detected"));

        rule("DB_TIMEOUT", Category.PERFORMANCE, Severity.MEDIUM, Owner.DEVELOPER,
                "Database query took too long and was cancelled",
                "A query or lock wait exceeded its time limit and was stopped. The screen or report failed; nothing was saved.",
                List.of("A report over a very large date range.", "A missing index on a growing table.",
                        "Waiting on a lock held by a long transaction."),
                List.of("Ask the user to narrow the date range or filters.",
                        "If it recurs on the same path, escalate to development with the path and time."),
                f -> f.sql("57014", "55P03") || f.has("QueryTimeoutException", "PessimisticLockingFailureException")
                        || f.textHas("canceling statement due to statement timeout", "lock timeout"));

        rule("OPTIMISTIC_LOCK", Category.CONCURRENCY, Severity.LOW, Owner.CLIENT_ADMIN,
                "Record was changed by someone else in the meantime",
                "The user saved a record that another user (or another tab) had already changed after it was opened. "
                        + "BillBull refused to overwrite the newer version.",
                List.of("Two people editing the same document or product.", "The same record open in two browser tabs."),
                List.of("Refresh the screen and apply the change again."),
                f -> f.has("ObjectOptimisticLockingFailureException", "OptimisticLockException", "StaleObjectStateException",
                        "OptimisticLockingFailureException"));

        // ---------------------------------------------------------------- data integrity (SQL states)
        rule("DB_DUPLICATE_DOC_NUMBER", Category.DATA_INTEGRITY, Severity.HIGH, Owner.DEVELOPER,
                "Document number already used (numbering out of step)",
                "The system generated a document or voucher number that already exists, so the save was refused. "
                        + "Until the numbering is corrected, every new document of this type may fail the same way.",
                List.of("The number sequence was reset (database restore, data import) and now lags behind existing documents.",
                        "Two terminals issued numbers from the same range (for example after offline selling).",
                        "A number was typed manually that the sequence later produced."),
                List.of("Compare the next number in the document's numbering settings with the highest existing number "
                                + "and move the sequence past it.",
                        "Escalate to development with the constraint name from the technical details."),
                f -> (f.sql("23505") || f.textHas("duplicate key")) && f.textHas("number", "_no\"", "_no)", "voucher", "sequence"));

        rule("DB_DUPLICATE", Category.DATA_INTEGRITY, Severity.MEDIUM, Owner.CLIENT_ADMIN,
                "Record already exists (duplicate code or name)",
                "The save was refused because a record with the same unique code, name or barcode already exists.",
                List.of("The code or name is in use — possibly by a previously deleted record (deleted records are "
                                + "deactivated, not removed, and still hold their code).",
                        "The save button was pressed twice.", "An import file contained the same row twice."),
                List.of("Search including inactive records; reactivate the old record or choose a different code."),
                f -> f.sql("23505") || f.textHas("duplicate key"));

        rule("DB_IN_USE", Category.BUSINESS_RULE, Severity.LOW, Owner.CLIENT_ADMIN,
                "Cannot delete: the record is still used",
                "The record could not be removed because other documents still refer to it (for example a product on "
                        + "invoices, or a customer with transactions).",
                List.of("Trying to delete master data that has history."),
                List.of("Deactivate the record instead of deleting it."),
                f -> f.sql("23503") && (f.textHas("update or delete") || "DELETE".equalsIgnoreCase(f.httpMethod())));

        rule("DB_MISSING_REFERENCE", Category.DATA_INTEGRITY, Severity.MEDIUM, Owner.SUPPORT,
                "Refers to a record that doesn't exist",
                "The data being saved points to another record (product, customer, warehouse, account…) that does not exist.",
                List.of("The other record was deleted while this screen was open.",
                        "A stale or cached screen sent an old ID.", "Data imported with IDs from another system."),
                List.of("Refresh and re-select the related record.", "If it persists, check the referenced record in the database."),
                f -> f.sql("23503"));

        rule("DB_REQUIRED_VALUE", Category.DATA_VALIDATION, Severity.MEDIUM, Owner.DEVELOPER,
                "A required value was missing when saving",
                "The database refused to save because a mandatory field was empty. The column is named in the technical message.",
                List.of("The screen allowed saving without a required field (a missing validation).",
                        "Master data is incomplete, e.g. a product without a unit, a branch without a warehouse."),
                List.of("Fill in the named field and retry.",
                        "If the screen let the user save without it, report to development so it validates first."),
                f -> f.sql("23502") || f.textHas("violates not-null constraint"));

        rule("DB_CHECK_CONSTRAINT", Category.DATA_VALIDATION, Severity.MEDIUM, Owner.SUPPORT,
                "A value is outside what is allowed",
                "A database rule rejected a value (for example a negative quantity, an unknown status or an invalid range).",
                List.of("Unusual input such as a negative quantity or price.", "A status value the database does not know (older schema)."),
                List.of("Check the values entered; the constraint name in the technical details says which rule failed."),
                f -> f.sql("23514") || f.textHas("violates check constraint"));

        rule("DB_LEDGER_PROTECTED", Category.DATA_INTEGRITY, Severity.HIGH, Owner.DEVELOPER,
                "Attempt to change a protected, append-only ledger",
                "Something tried to update or delete a row in a ledger that may only be appended to (audit trail, "
                        + "access-audit ledger). The database blocked it — the ledger is intact.",
                List.of("A code path that edits history instead of posting a correcting entry.",
                        "A manual SQL change attempted on the server."),
                List.of("Escalate to development with the request ID; check who ran manual SQL at that time."),
                f -> f.textHas("is append-only"));

        rule("DB_VALUE_TOO_LONG", Category.DATA_VALIDATION, Severity.LOW, Owner.DEVELOPER,
                "Text is too long for the field",
                "A value (name, description, note, reference) was longer than the database column allows.",
                List.of("Long text pasted into a field the screen doesn't limit.", "An import with long descriptions."),
                List.of("Shorten the text.", "Development should add a length limit on the screen."),
                f -> f.sql("22001") || f.textHas("value too long for type"));

        rule("DB_BAD_VALUE", Category.DATA_VALIDATION, Severity.LOW, Owner.SUPPORT,
                "Number or date out of range or badly formatted",
                "The database could not store a value: a number too large, or text where a number or date was expected.",
                List.of("A typo with too many digits in a quantity or price.", "An import column with the wrong format."),
                List.of("Correct the value and retry."),
                f -> f.sql("22003", "22P02", "22007", "22008"));

        // ---------------------------------------------------------------- request format
        rule("UNREADABLE_REQUEST", Category.FRONTEND, Severity.LOW, Owner.DEVELOPER,
                "Screen sent data the server could not read",
                "The browser sent a request the server could not understand (wrong JSON shape, date or number format).",
                List.of("The browser is running an older copy of the app after a deployment.",
                        "A field sends a value in an unexpected format."),
                List.of("Ask the user to hard-refresh (Ctrl+F5).",
                        "If it continues, the frontend and backend builds may not match — check the deployment."),
                f -> f.has("HttpMessageNotReadableException", "HttpMessageConversionException", "JsonParseException",
                        "MismatchedInputException"));

        rule("BAD_PARAMETER", Category.DATA_VALIDATION, Severity.LOW, Owner.DEVELOPER,
                "Request missing or invalid parameter",
                "A request reached the server without a required parameter, or with one of the wrong type.",
                List.of("A screen calling an endpoint incorrectly (often after an update).", "A hand-edited URL."),
                List.of("Hard-refresh; if it persists, report the path to development."),
                f -> f.has("MethodArgumentTypeMismatchException", "MissingServletRequestParameterException",
                        "MissingPathVariableException", "MethodArgumentNotValidException", "BindException",
                        "MissingServletRequestPartException", "HandlerMethodValidationException"));

        rule("UPLOAD_TOO_LARGE", Category.DATA_VALIDATION, Severity.LOW, Owner.CLIENT_ADMIN,
                "Uploaded file is too large",
                "A file upload (image, attachment, import) exceeded the size limit.",
                List.of("High-resolution photos or large spreadsheets."),
                List.of("Compress or split the file and retry."),
                f -> f.has("MaxUploadSizeExceededException", "SizeLimitExceededException", "FileSizeLimitExceededException"));

        // ---------------------------------------------------------------- ORM / application defects
        rule("DUPLICATE_MASTER_DATA", Category.DATA_INTEGRITY, Severity.HIGH, Owner.SUPPORT,
                "Duplicate master data: one record expected, several found",
                "A lookup that should find exactly one record found several — for example an item code or barcode "
                        + "shared by more than one active product. Nothing was saved, and the same lookup will keep failing.",
                List.of("The same item code or barcode is used by two active products (e.g. in different branches).",
                        "Two open POS sessions exist for the same terminal.",
                        "An import created duplicates."),
                List.of("Find the duplicated code (Inventory › Products, search by code including all branches) and "
                                + "deactivate or recode the extra one.",
                        "Escalate to development with the top frame if the lookup should be branch-specific."),
                f -> f.has("IncorrectResultSizeDataAccessException", "NonUniqueResultException")
                        || f.textHas("query did not return a unique result"));

        rule("RECORD_NOT_FOUND", Category.DATA_INTEGRITY, Severity.MEDIUM, Owner.SUPPORT,
                "Referenced record not found",
                "The action needed a record (document, product, customer, session…) that no longer exists or isn't visible.",
                List.of("The record was deleted or deactivated while the user had it open.",
                        "The user is working in a different branch from the record.",
                        "A link or bookmark with an old ID."),
                List.of("Refresh, check the branch selector and re-open the record from its list."),
                f -> f.has("EntityNotFoundException", "JpaObjectRetrievalFailureException", "ObjectNotFoundException",
                        "EmptyResultDataAccessException"));

        rule("LAZY_LOADING", Category.APPLICATION_BUG, Severity.HIGH, Owner.DEVELOPER,
                "Program read data outside its database session",
                "The code tried to load related data (lines, items, children) after its database session had closed. "
                        + "This is a software defect and will fail every time for this path.",
                List.of("A response or background task touches a related collection that wasn't loaded up front."),
                List.of("Escalate to development with the top frame and path."),
                f -> f.has("LazyInitializationException"));

        rule("SILENT_ROLLBACK", Category.APPLICATION_BUG, Severity.HIGH, Owner.DEVELOPER,
                "Transaction was rolled back unexpectedly",
                "An inner step failed and marked the whole transaction for rollback, so nothing in the action was saved "
                        + "even though some code tried to continue.",
                List.of("An error was caught and ignored inside a transactional service."),
                List.of("Escalate to development; look for the earlier error from the same request ID."),
                f -> f.has("UnexpectedRollbackException"));

        rule("ENTITY_VALIDATION", Category.DATA_VALIDATION, Severity.MEDIUM, Owner.DEVELOPER,
                "Data failed validation on save",
                "A record failed the application's field validation when it was saved.",
                List.of("A required or formatted field missing from the screen's request."),
                List.of("Check the field named in the message; development should validate it on the screen."),
                f -> f.has("ConstraintViolationException") && !f.sql("23") || f.has("TransactionSystemException"));

        rule("NULL_VALUE", Category.APPLICATION_BUG, Severity.HIGH, Owner.DEVELOPER,
                "Unexpected missing value in the program",
                "The program needed a value that was empty (null) and stopped. In an ERP this is usually incomplete "
                        + "master data meeting code that didn't check for it.",
                List.of("Incomplete master data: product without unit/price/tax code, customer without account, branch "
                                + "without warehouse, a missing settings row.",
                        "A document line referencing something that has since been removed.",
                        "A code path that doesn't validate before using a value."),
                List.of("Look at the message and top frame (Java names the empty value) and check that record for blank fields.",
                        "Fixing the data usually unblocks the user; development should add a proper validation message."),
                f -> f.has("NullPointerException"));

        rule("DIVIDE_BY_ZERO", Category.APPLICATION_BUG, Severity.HIGH, Owner.SUPPORT,
                "Division by zero in a calculation",
                "A price, cost, VAT or unit-conversion calculation divided by zero.",
                List.of("A unit conversion factor of 0.", "A zero exchange rate.", "Average cost on zero stock.",
                        "A zero quantity where the screen doesn't block it."),
                List.of("Check the unit conversions, exchange rates and quantities on the record involved.",
                        "Development should guard the calculation."),
                f -> f.has("ArithmeticException") && f.textHas("by zero", "division undefined", "division by zero"));

        rule("UNROUNDED_DIVISION", Category.APPLICATION_BUG, Severity.MEDIUM, Owner.DEVELOPER,
                "Money calculation without rounding",
                "A decimal division produced an endless fraction (e.g. 10 ÷ 3) without a rounding rule.",
                List.of("A pricing, discount or allocation calculation missing its scale/rounding."),
                List.of("Escalate to development with the top frame."),
                f -> f.has("ArithmeticException") && f.textHas("non-terminating decimal"));

        rule("BAD_NUMBER_OR_DATE", Category.DATA_VALIDATION, Severity.LOW, Owner.SUPPORT,
                "Text where a number or date was expected",
                "The program could not read a number or date — typically from an import file, barcode or free-text field.",
                List.of("An import column in the wrong format.", "A scanned barcode with unexpected characters.",
                        "A date in a different regional format."),
                List.of("Correct the source value or file and retry."),
                f -> f.has("NumberFormatException", "DateTimeParseException", "DateTimeException", "InvalidFormatException"));

        rule("PROGRAM_DEFECT", Category.APPLICATION_BUG, Severity.HIGH, Owner.DEVELOPER,
                "Program defect",
                "The program hit an internal inconsistency (wrong type, missing list element, a collection changed "
                        + "while being read, or runaway recursion). This is a software defect.",
                List.of("An edge case the code does not handle — often an empty list or an unusual document."),
                List.of("Escalate to development with the stack trace and request ID."),
                f -> f.has("ClassCastException", "IndexOutOfBoundsException", "ArrayIndexOutOfBoundsException",
                        "StringIndexOutOfBoundsException", "ConcurrentModificationException", "StackOverflowError",
                        "UnsupportedOperationException", "NoSuchElementException", "NoSuchMethodError", "NoClassDefFoundError"));

        // ---------------------------------------------------------------- printing & integrations
        rule("PDF_RENDER", Category.PRINTING, Severity.HIGH, Owner.INFRA,
                "PDF could not be generated",
                "Rendering a document to PDF with the server's headless Chromium failed, so the print/download/e-mail "
                        + "attachment was not produced.",
                List.of("Chromium (Playwright browsers) missing or broken on the server after a deployment or OS update.",
                        "The server is short of memory while rendering.",
                        "A template produced HTML that fails to render or takes too long."),
                List.of("Try printing any document for this client; if all fail, reinstall the Playwright browsers on the server.",
                        "Check the Health tab for memory pressure."),
                f -> f.stackHas("playwright") || f.stackHas("HtmlPdfService"));

        rule("PRINT_POLICY", Category.PRINTING, Severity.LOW, Owner.SUPPORT,
                "Printer command blocked by safety policy",
                "A print job contained a printer command that BillBull refuses to send (for example power-off or "
                        + "firmware writes). Nothing was sent to the printer.",
                List.of("A receipt template or label containing raw control codes.", "A wrongly configured printer protocol."),
                List.of("Check the printer's protocol (ESC/POS vs ZPL) and the template."),
                f -> f.has("PrintCommandRejectedException"));

        rule("NETWORK_PRINTER", Category.PRINTING, Severity.MEDIUM, Owner.CLIENT_ADMIN,
                "Network printer did not respond",
                "The server tried to send a job to a network (IP) printer and could not reach it. The sale or document "
                        + "itself is saved; only the printout is missing and can be reprinted.",
                List.of("Printer off, out of paper, or its IP address changed (DHCP).",
                        "The BillBull server cannot reach the shop's local network — a cloud server cannot reach a "
                                + "192.168.x printer without a VPN or the local print agent."),
                List.of("Check the printer is on and its IP matches POS › Devices.",
                        "For a cloud-hosted client, use the local print agent (USB/Windows printer) instead of a LAN IP."),
                f -> (f.pathHas("print") || f.stackHas(".printer.")) && f.has("ConnectException", "SocketTimeoutException",
                        "NoRouteToHostException", "SocketException"));

        rule("EMAIL_FAILED", Category.INTEGRATION, Severity.MEDIUM, Owner.CLIENT_ADMIN,
                "E-mail could not be sent",
                "Sending an e-mail (document, statement, notification) failed at the mail server. The document itself is saved.",
                List.of("Wrong SMTP username/password (or an app password that expired).",
                        "The mail provider blocked the sender or the attachment size."),
                List.of("Run the test in Settings › Email and fix the credentials; then resend."),
                f -> f.has("MailException", "MailSendException", "MailAuthenticationException", "MessagingException",
                        "AuthenticationFailedException", "SMTPSendFailedException") || f.stackHas("jakarta.mail"));

        rule("WHATSAPP_FAILED", Category.INTEGRATION, Severity.MEDIUM, Owner.CLIENT_ADMIN,
                "WhatsApp message could not be sent",
                "Sending through the WhatsApp integration failed. The document itself is saved.",
                List.of("Expired or wrong WhatsApp API credentials.", "Recipient number not on WhatsApp or badly formatted."),
                List.of("Check Settings › WhatsApp and retry."),
                f -> f.pathHas("/whatsapp") || f.stackHas("whatsapp"));

        rule("EXTERNAL_UNREACHABLE", Category.INTEGRATION, Severity.MEDIUM, Owner.INFRA,
                "An external service did not respond",
                "The server could not reach another service over the network (a remote API, a device, a mail or file server).",
                List.of("The other service is down.", "DNS or firewall problem on the server.", "A slow network causing a timeout."),
                List.of("Check which host is named in the message, and the server's outbound connectivity."),
                f -> f.has("ConnectException", "SocketTimeoutException", "UnknownHostException", "HttpTimeoutException",
                        "ResourceAccessException", "NoRouteToHostException", "HttpConnectTimeoutException"));

        rule("FILE_MISSING", Category.INFRASTRUCTURE, Severity.MEDIUM, Owner.INFRA,
                "File missing or not accessible on the server",
                "A file the action needed (logo, attachment, template, upload) is missing or the service can't read/write it.",
                List.of("The uploads folder was not carried over in a server move or restore.",
                        "File permissions changed on the server."),
                List.of("Check the uploads folder and its permissions on the server."),
                f -> f.has("NoSuchFileException", "FileNotFoundException", "java.nio.file.AccessDeniedException"));

        // ---------------------------------------------------------------- browser errors
        rule("CLIENT_STALE_BUNDLE", Category.FRONTEND, Severity.LOW, Owner.CLIENT_ADMIN,
                "Screen failed to load after an update",
                "The browser asked for a part of the app that no longer exists, because the app was updated while it was open.",
                List.of("A deployment happened while the user had BillBull open."),
                List.of("Ask the user to refresh the page (Ctrl+F5). It resolves itself after the reload."),
                f -> client(f) && f.textHas("dynamically imported module", "loading chunk", "chunkloaderror",
                        "importing a module script failed", "failed to fetch dynamically"));

        rule("CLIENT_NETWORK", Category.CONNECTIVITY, Severity.MEDIUM, Owner.CLIENT_ADMIN,
                "Browser lost its connection to the server",
                "A screen could not reach the BillBull server. Whatever the user was doing may not have been saved.",
                List.of("Shop internet outage or Wi-Fi drop.", "The server was restarting (deployment).",
                        "A proxy or firewall blocking the request."),
                List.of("Check the shop's connection; ask the user to confirm whether the last document was saved before retrying.",
                        "Many users at once points to a server outage — check the Health tab."),
                f -> client(f) && f.textHas("network error", "failed to fetch", "err_network", "networkerror",
                        "load failed", "timeout of", "err_internet_disconnected", "err_connection"));

        rule("CLIENT_STORAGE", Category.FRONTEND, Severity.MEDIUM, Owner.CLIENT_ADMIN,
                "Browser storage full or unavailable",
                "The browser could not use its local storage. The POS offline cache and some saved preferences depend on it.",
                List.of("Private/incognito window.", "Disk almost full on the device.", "Browser storage cleared or blocked by policy."),
                List.of("Use a normal (not private) window and free disk space on the device."),
                f -> client(f) && f.textHas("quotaexceeded", "quota exceeded", "indexeddb", "the quota has been exceeded"));

        rule("CLIENT_BENIGN", Category.FRONTEND, Severity.LOW, Owner.DEVELOPER,
                "Harmless browser warning",
                "A browser notice that does not affect the user (layout resize loop, a script error from a browser extension).",
                List.of("Browser behaviour or extensions."),
                List.of("No action needed unless users report a visible problem."),
                f -> client(f) && f.textHas("resizeobserver loop", "script error."));

        rule("CLIENT_SERVER_ERROR", Category.FRONTEND, Severity.MEDIUM, Owner.SUPPORT,
                "Screen received an error from the server",
                "A screen reported that the server returned an error. The matching server-side error (same time and user) "
                        + "usually explains the cause.",
                List.of("See the server error logged at the same time for this client."),
                List.of("Filter this client's errors to the same time window and open the server-side entry."),
                f -> client(f) && f.textHas("request failed with status code"));

        rule("CLIENT_CRASH", Category.FRONTEND, Severity.HIGH, Owner.DEVELOPER,
                "A screen crashed in the browser",
                "The page's code failed while displaying or processing data, so the user saw a broken or blank screen.",
                List.of("Data the screen didn't expect (an empty list, a missing field on an older record).",
                        "A defect introduced in a recent frontend release."),
                List.of("Note the screen and the user; escalate to development with the stack and component stack.",
                        "As a workaround the user can reload; if it is tied to one record, check that record's data."),
                f -> client(f) && (f.has("TypeError", "ReferenceError", "RangeError", "SyntaxError")
                        || f.stackHas("component stack")));

        rule("CLIENT_OTHER", Category.FRONTEND, Severity.MEDIUM, Owner.DEVELOPER,
                "Browser-side error",
                "The user's browser reported an error while using BillBull.",
                List.of("See the message and stack."),
                List.of("Escalate to development if it recurs or users report a visible problem."),
                ErrorExplainer::client);

        // ---------------------------------------------------------------- business refusals (shown to the user)
        rule("BIZ_STOCK_SHORT", Category.BUSINESS_RULE, Severity.LOW, Owner.CLIENT_ADMIN,
                "Not enough stock for the transaction",
                "The transaction was refused because the item doesn't have enough available stock in the selected "
                        + "branch / warehouse / bin.",
                List.of("Goods physically arrived but the GRN has not been posted yet.",
                        "Stock sits in another warehouse or bin than the one selected.",
                        "A stock take adjusted the quantity down.", "The client does not allow negative stock."),
                List.of("Check the item's stock by warehouse (Inventory › Reports); post the pending GRN or transfer stock.",
                        "Review the negative-stock setting with the client if the business really sells ahead of receiving."),
                f -> businessRefusal(f) && f.textHas("stock") && f.textHas("insufficient", "not enough", "negative",
                        "available", "exceed", "short"));

        rule("BIZ_SESSION", Category.BUSINESS_RULE, Severity.LOW, Owner.CLIENT_ADMIN,
                "Till session or business day is not open",
                "A POS action needs an open till session (and business day), and there wasn't one.",
                List.of("The session was closed on another device or by a supervisor.", "Day close already ran for today."),
                List.of("Open a session on the till (or start the business day) and retry."),
                f -> businessRefusal(f) && f.textHas("session", "business day")
                        && f.textHas("closed", "not open", "no open", "expired", "already open"));

        rule("BIZ_ALREADY_PROCESSED", Category.BUSINESS_RULE, Severity.LOW, Owner.CLIENT_ADMIN,
                "Document already processed",
                "The action was refused because the document is already posted, closed, cancelled, converted or returned.",
                List.of("Two users acting on the same document.", "A double click.", "Trying to edit a posted document."),
                List.of("Refresh the document; use a return, credit note or reversal instead of editing a posted one."),
                f -> businessRefusal(f) && f.textHas("already") && f.textHas("posted", "closed", "cancel", "converted",
                        "invoiced", "returned", "approved", "paid", "received"));

        rule("BIZ_PLAN_LIMIT", Category.CONFIGURATION, Severity.LOW, Owner.SUPPORT,
                "Plan limit reached",
                "The client reached a limit of their BillBull plan (users, branches or terminals).",
                List.of("The client is growing beyond their plan."),
                List.of("Review the client's plan and limits in this control center (Plan & modules tab)."),
                f -> businessRefusal(f) && f.textHas("limit") && f.textHas("user", "branch", "terminal", "plan"));

        rule("BIZ_APPROVAL", Category.BUSINESS_RULE, Severity.LOW, Owner.CLIENT_ADMIN,
                "Action needs approval",
                "The action requires approval by another user (maker-checker) before it can go ahead.",
                List.of("Amount above the approval threshold (e.g. large journal vouchers)."),
                List.of("Have an authorised approver approve it."),
                f -> businessRefusal(f) && f.textHas("approv"));

        rule("BIZ_RULE", Category.BUSINESS_RULE, Severity.LOW, Owner.CLIENT_ADMIN,
                "Action refused by a business rule",
                "BillBull refused the action on purpose and showed the user the reason (the message below). Nothing was saved.",
                List.of("Missing or inconsistent input for this kind of document.", "A setup or permission prerequisite not met."),
                List.of("Read the message — it is what the user saw. Frequent occurrences point to a training or setup issue."),
                ErrorExplainer::businessRefusal);

        // ---------------------------------------------------------------- background work and fall-backs
        rule("JOB_FAILED", Category.APPLICATION_BUG, Severity.MEDIUM, Owner.DEVELOPER,
                "A background job failed",
                "A scheduled or background task logged an error. Users didn't see it directly, but the work it does was not done this run.",
                List.of("See the logger and message: the job name says what it was doing."),
                List.of("Check whether the next run succeeds (the occurrence count keeps rising if not); escalate if it keeps failing."),
                f -> f.source() == ErrorFacts.Source.JOB);

        rule("LOGGED_ERROR", Category.APPLICATION_BUG, Severity.LOW, Owner.DEVELOPER,
                "An error was logged while a request was handled",
                "Code reported an error but the request itself completed — something on the side (a notification, "
                        + "a print, an audit entry) did not happen.",
                List.of("See the logger and message for the side task that failed."),
                List.of("Review whether the side effect matters for the user; escalate if it recurs."),
                f -> f.source() == ErrorFacts.Source.LOG);

        rule("HTTP_5XX", Category.INFRASTRUCTURE, Severity.MEDIUM, Owner.SUPPORT,
                "Server returned an error without details",
                "The server answered with an error status but no exception was captured (for example a gateway or "
                        + "upstream error).",
                List.of("An upstream service failed.", "A request was rejected by a server component before reaching BillBull's code."),
                List.of("Check the server logs for the request ID."),
                f -> f.exceptionClass() == null || f.has("ResponseStatusException"));

        rule("UNCLASSIFIED", Category.APPLICATION_BUG, Severity.MEDIUM, Owner.DEVELOPER,
                "Unexpected error",
                "An error occurred that isn't in the BillBull error catalogue yet.",
                List.of("See the technical details."),
                List.of("Escalate to development with the request ID and stack trace; add a catalogue rule once understood."),
                f -> true);
    }

    // ===================================================================================== explain

    /** Paths whose failure stops trading or sign-in: a defect there is always critical. */
    private static boolean criticalFlow(ErrorFacts f) {
        return f.pathHas("/checkout") || f.pathHas("/day-close") || f.pathHas("/dayclose")
                || f.pathHas("/api/auth/login") || f.pathHas("/sessions/open") || f.pathHas("/sessions/{id}/close");
    }

    public static Explanation explain(ErrorFacts f) {
        Rule r = RULES.stream().filter(x -> safeTest(x, f)).findFirst().orElse(RULES.get(RULES.size() - 1));
        ErpModule module = ErpModule.of(f);
        Severity severity = r.severity();
        boolean fault = r.category() == Category.APPLICATION_BUG || r.category() == Category.INFRASTRUCTURE
                || r.category() == Category.DATABASE_SCHEMA || r.category() == Category.PERFORMANCE;
        if (fault && f.source() == ErrorFacts.Source.SERVER && criticalFlow(f)) severity = Severity.CRITICAL;
        String title = r.title();
        if ("PROGRAM_DEFECT".equals(r.code()) || "UNCLASSIFIED".equals(r.code())) {
            String name = ErrorFacts.simple(f.rootCauseClass() != null ? f.rootCauseClass() : f.exceptionClass());
            if (!name.isEmpty()) title = title + " (" + name + ")";
        }
        return new Explanation(r.code(), title, r.category(), severity, r.owner(), module, r.what(),
                impact(r, f, module), r.causes(), r.actions(), technical(f));
    }

    private static boolean safeTest(Rule r, ErrorFacts f) {
        try {
            return r.when().test(f);
        } catch (RuntimeException e) {
            return false;
        }
    }

    static String impact(Rule r, ErrorFacts f, ErpModule module) {
        switch (r.category()) {
            case BUSINESS_RULE, ACCOUNTING_RULE:
                return "Nothing was saved. The user saw the reason on screen and can correct and retry. Repeated "
                        + "occurrences usually point to a training, setup or master-data issue rather than a software fault.";
            case PRINTING:
                return module == ErpModule.POS
                        ? "The sale itself is complete — only the receipt or label is missing. Reprint it from Recent sales once the printer is fixed."
                        : "The business transaction was already saved; only the printout, PDF or label failed and can be produced again once fixed.";
            case INTEGRATION:
                return "The document or transaction is saved; only the outgoing message or external call failed and can be retried.";
            case FRONTEND, CONNECTIVITY:
                return "This happened in the user's browser on the " + module.label() + " screens. "
                        + "If they were saving something, check whether it reached the server before they repeat it.";
            case INFRASTRUCTURE:
                if (r.severity() == Severity.CRITICAL) {
                    return "Affects every user of this client while it lasts — sales, stock and accounting can't be saved. "
                            + "Work started during the outage was not saved.";
                }
                break;
            case DATABASE_SCHEMA:
                return "Every action that touches the affected table fails for every user until the schema is fixed. "
                        + (f.isWrite() ? module.writeImpact() : "");
            default:
                break;
        }
        if (f.source() == ErrorFacts.Source.JOB) return jobImpact(f, module);
        if (f.source() == ErrorFacts.Source.LOG) {
            return "The user's request completed, but a side task in " + module.label() + " did not.";
        }
        if (f.isWrite()) return module.writeImpact();
        if (f.httpMethod() == null) return "See the details: the context of this error was not a user request.";
        return "A " + module.label() + " screen or report failed to load. Nothing was changed.";
    }

    private static String jobImpact(ErrorFacts f, ErpModule module) {
        String l = ErrorFacts.nz(f.logger());
        if (l.contains("GlBalanceRebuild")) {
            return "GL running balances may be stale until the next successful rebuild — trial balance and balance "
                    + "sheet may differ from the ledger detail in the meantime.";
        }
        if (l.contains("PrintJob")) return "Stuck print jobs may not be marked failed; tills can show prints as pending.";
        if (l.contains("PosSession") || l.contains("Terminal") || l.contains("Counter")) {
            return "Automatic POS session/terminal housekeeping did not run; sessions may stay open longer than configured.";
        }
        if (l.contains("Retention")) return "Old audit records were not pruned this run; no business data is affected.";
        if (l.contains("DeviceHealth")) return "POS device online/offline status may be out of date.";
        return "A background task in " + module.label() + " did not complete this run. Users weren't interrupted, but "
                + "whatever the task maintains may be out of date until it succeeds.";
    }

    static String technical(ErrorFacts f) {
        StringBuilder sb = new StringBuilder();
        String ex = ErrorFacts.simple(f.exceptionClass());
        sb.append(ex.isEmpty() ? "Error" : ex);
        if (f.rootCauseClass() != null) sb.append(" caused by ").append(ErrorFacts.simple(f.rootCauseClass()));
        if (f.sqlState() != null) sb.append(" [SQL ").append(f.sqlState()).append(']');
        if (f.errorCode() != null) sb.append(" [").append(f.errorCode()).append(']');
        if (f.topFrame() != null) sb.append(" at ").append(f.topFrame());
        if (f.httpMethod() != null || f.pathTemplate() != null) {
            sb.append(" — ").append((ErrorFacts.nz(f.httpMethod()) + " " + ErrorFacts.nz(f.pathTemplate())).trim());
            if (f.httpStatus() != null) sb.append(" → ").append(f.httpStatus());
        }
        return sb.toString().trim();
    }

    /** The whole catalogue, for the "Error guide" page. */
    public static List<Map<String, Object>> catalogue() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Rule r : RULES) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code", r.code());
            m.put("title", r.title());
            m.put("category", r.category().name());
            m.put("categoryLabel", r.category().label);
            m.put("severity", r.severity().name());
            m.put("owner", r.owner().name());
            m.put("ownerLabel", r.owner().label);
            m.put("whatHappened", r.what());
            m.put("likelyCauses", r.causes());
            m.put("recommendedActions", r.actions());
            out.add(m);
        }
        return out;
    }

    public static List<Map<String, String>> categories() {
        List<Map<String, String>> out = new ArrayList<>();
        for (Category c : Category.values()) out.add(Map.of("code", c.name(), "label", c.label, "description", c.description));
        return out;
    }

    public static List<Map<String, String>> modules() {
        List<Map<String, String>> out = new ArrayList<>();
        for (ErpModule m : ErpModule.values()) out.add(Map.of("code", m.name(), "label", m.label()));
        return out;
    }
}
