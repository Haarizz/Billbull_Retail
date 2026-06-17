package com.billbull.backend.financials.expensevoucher;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

@Repository
public interface ExpenseVoucherRepository extends JpaRepository<ExpenseVoucher, Long> {

    @Query("SELECT v FROM ExpenseVoucher v WHERE v.isActive = true ORDER BY v.date DESC, v.id DESC")
    List<ExpenseVoucher> findAllActive();

    @Query("SELECT v FROM ExpenseVoucher v WHERE v.isActive = true AND v.branch.id = :branchId ORDER BY v.date DESC, v.id DESC")
    List<ExpenseVoucher> findAllActiveByBranch(Long branchId);
}
