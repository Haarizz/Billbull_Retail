package com.billbull.backend.financials.expense;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ExpenseRepository extends JpaRepository<Expense, Long> {
    List<Expense> findAllByOrderByDateDesc();

    @Query("SELECT COALESCE(SUM(e.total), 0) FROM Expense e " +
           "WHERE e.date BETWEEN :from AND :to AND (e.status IS NULL OR e.status <> 'CANCELLED')")
    BigDecimal sumTotalBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("SELECT COALESCE(SUM(e.taxAmount), 0) FROM Expense e " +
           "WHERE e.date BETWEEN :from AND :to AND (e.status IS NULL OR e.status <> 'CANCELLED')")
    BigDecimal sumTaxBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("SELECT e.category, SUM(e.total) FROM Expense e " +
           "WHERE e.date BETWEEN :from AND :to AND (e.status IS NULL OR e.status <> 'CANCELLED') " +
           "GROUP BY e.category ORDER BY SUM(e.total) DESC")
    List<Object[]> findTopCategoryBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
