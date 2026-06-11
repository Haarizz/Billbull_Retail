package com.billbull.backend.financials.prepaid;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.time.LocalDate;
import java.util.List;

public interface PrepaidExpenseRepository extends JpaRepository<PrepaidExpense, Long> {

    List<PrepaidExpense> findByStatus(PrepaidExpense.PrepaidStatus status);

    @Query("SELECT pe FROM PrepaidExpense pe WHERE pe.status = 'ACTIVE' AND pe.startDate <= :runDate")
    List<PrepaidExpense> findActiveForAmortization(LocalDate runDate);
}
