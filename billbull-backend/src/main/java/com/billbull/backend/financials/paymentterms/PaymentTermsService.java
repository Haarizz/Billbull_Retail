package com.billbull.backend.financials.paymentterms;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentTermsService {

    private final PaymentTermsRepository repo;

    public PaymentTermsService(PaymentTermsRepository repo) {
        this.repo = repo;
    }

    public List<PaymentTerms> getAll() {
        return repo.findByIsActiveTrue();
    }

    public Optional<PaymentTerms> findById(Long id) {
        return repo.findById(id);
    }

    public Optional<PaymentTerms> findByCode(String code) {
        return repo.findByCode(code);
    }

    @Transactional
    public PaymentTerms save(PaymentTerms terms) {
        return repo.save(terms);
    }

    /** Due date = invoiceDate + netDays from the payment terms for the given id. */
    public LocalDate computeDueDate(Long paymentTermsId, LocalDate invoiceDate) {
        if (paymentTermsId == null || invoiceDate == null) return invoiceDate;
        return repo.findById(paymentTermsId)
                .map(t -> invoiceDate.plusDays(t.getNetDays()))
                .orElse(invoiceDate);
    }
}
