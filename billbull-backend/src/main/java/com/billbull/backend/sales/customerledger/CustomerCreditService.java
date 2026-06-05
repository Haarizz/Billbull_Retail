package com.billbull.backend.sales.customerledger;

import com.billbull.backend.financials.generalledger.postingengine.PostingErrorCode;
import com.billbull.backend.financials.generalledger.postingengine.PostingException;
import com.billbull.backend.sales.invoice.SalesInvoiceRepository;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Credit-limit guard used by the posting engine (PDF §6 / Phase 3.4).
 *
 * Throws {@link PostingErrorCode#CREDIT_LIMIT_BREACH} when the customer's open AR
 * after the new transaction would exceed their configured credit limit.
 * No-ops when:
 *  - the customer has no credit limit configured (limit = 0 or null), or
 *  - the customer is not found (defensive — new customers start clean).
 *
 * Managers may bypass via the {@code permissions.sales.override-credit-limit}
 * RBAC permission (enforcement of that permission is in the caller, not here).
 */
@Service
@Slf4j
public class CustomerCreditService {

    private final CustomerRepository customerRepo;
    private final SalesInvoiceRepository invoiceRepo;

    public CustomerCreditService(CustomerRepository customerRepo,
                                  SalesInvoiceRepository invoiceRepo) {
        this.customerRepo = customerRepo;
        this.invoiceRepo  = invoiceRepo;
    }

    /**
     * Asserts that posting {@code additionalAR} for {@code customerCode} will not
     * breach the customer's credit limit.
     *
     * @param customerCode  customer being invoiced
     * @param additionalAR  the AR amount this posting would add (may be zero)
     */
    public void assertWithinLimit(String customerCode, BigDecimal additionalAR) {
        if (customerCode == null || customerCode.isBlank()) return;
        if (additionalAR == null || additionalAR.compareTo(BigDecimal.ZERO) <= 0) return;

        Optional<Customer> customerOpt = customerRepo.findByCode(customerCode);
        if (customerOpt.isEmpty()) return;

        Customer c = customerOpt.get();
        BigDecimal limit = c.getCreditLimitAmount();
        if (limit == null || limit.compareTo(BigDecimal.ZERO) <= 0) return;

        Double outstanding = invoiceRepo.findOutstandingBalanceByCustomerCode(customerCode);
        BigDecimal currentAR = outstanding != null ? BigDecimal.valueOf(outstanding) : BigDecimal.ZERO;
        BigDecimal projected = currentAR.add(additionalAR);

        if (projected.compareTo(limit) > 0) {
            throw new PostingException(PostingErrorCode.CREDIT_LIMIT_BREACH,
                    String.format("Credit limit breach for customer '%s': outstanding %.2f + this invoice %.2f = %.2f > limit %.2f.",
                            customerCode, currentAR, additionalAR, projected, limit));
        }

        log.debug("[CreditLimit] {} — projected AR {} within limit {}", customerCode, projected, limit);
    }
}
