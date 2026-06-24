package com.billbull.backend.purchase.returns;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PurchaseReturnRepository extends JpaRepository<PurchaseReturn, Long> {
    Optional<PurchaseReturn> findByDebitNoteNumber(String debitNoteNumber);
    List<PurchaseReturn> findByBranchIdOrderByReturnDateDesc(Long branchId);
    boolean existsByDebitNoteNumber(String debitNoteNumber);

    // ARCHFIX §1.6: items + branch are LAZY — JOIN FETCH them for the read paths that serialize the
    // return (list / by-branch / by-id). DISTINCT collapses the items-join row duplication.
    @Query("SELECT DISTINCT r FROM PurchaseReturn r LEFT JOIN FETCH r.items LEFT JOIN FETCH r.branch")
    List<PurchaseReturn> findAllWithItems();

    @Query("SELECT DISTINCT r FROM PurchaseReturn r LEFT JOIN FETCH r.items LEFT JOIN FETCH r.branch "
            + "WHERE r.branch.id = :branchId ORDER BY r.returnDate DESC")
    List<PurchaseReturn> findByBranchWithItems(@Param("branchId") Long branchId);

    @Query("SELECT r FROM PurchaseReturn r LEFT JOIN FETCH r.items LEFT JOIN FETCH r.branch WHERE r.id = :id")
    Optional<PurchaseReturn> findByIdWithItems(@Param("id") Long id);
}
