package com.billbull.backend.financials.expensevoucher;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ExpenseVoucherRepository extends JpaRepository<ExpenseVoucher, Long> {

    // ARCHFIX §1.6: lines + branch are LAZY — JOIN FETCH them on the read paths that serialize the
    // voucher. DISTINCT collapses the lines-join row duplication; ordering preserved.
    @Query("SELECT DISTINCT v FROM ExpenseVoucher v LEFT JOIN FETCH v.lines LEFT JOIN FETCH v.branch "
            + "WHERE v.isActive = true ORDER BY v.date DESC, v.id DESC")
    List<ExpenseVoucher> findAllActive();

    @Query("SELECT DISTINCT v FROM ExpenseVoucher v LEFT JOIN FETCH v.lines LEFT JOIN FETCH v.branch "
            + "WHERE v.isActive = true AND v.branch.id = :branchId ORDER BY v.date DESC, v.id DESC")
    List<ExpenseVoucher> findAllActiveByBranch(Long branchId);

    @Query("SELECT v FROM ExpenseVoucher v LEFT JOIN FETCH v.lines LEFT JOIN FETCH v.branch WHERE v.id = :id")
    Optional<ExpenseVoucher> findByIdWithLines(@Param("id") Long id);
}
