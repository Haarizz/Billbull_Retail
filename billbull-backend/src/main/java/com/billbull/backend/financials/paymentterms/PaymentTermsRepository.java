package com.billbull.backend.financials.paymentterms;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentTermsRepository extends JpaRepository<PaymentTerms, Long> {

    Optional<PaymentTerms> findByCode(String code);

    List<PaymentTerms> findByIsActiveTrue();

    boolean existsByCode(String code);
}
