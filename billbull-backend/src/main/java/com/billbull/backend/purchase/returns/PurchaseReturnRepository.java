package com.billbull.backend.purchase.returns;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PurchaseReturnRepository extends JpaRepository<PurchaseReturn, Long> {
    Optional<PurchaseReturn> findByDebitNoteNumber(String debitNoteNumber);
    List<PurchaseReturn> findByBranchIdOrderByReturnDateDesc(Long branchId);
    boolean existsByDebitNoteNumber(String debitNoteNumber);
}
