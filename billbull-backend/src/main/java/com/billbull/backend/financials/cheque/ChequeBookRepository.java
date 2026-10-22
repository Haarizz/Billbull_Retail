package com.billbull.backend.financials.cheque;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;

@Repository
public interface ChequeBookRepository extends JpaRepository<ChequeBook, Long> {

    @Query("SELECT b FROM ChequeBook b WHERE b.isActive = true ORDER BY b.bankName, b.id")
    List<ChequeBook> findAllActive();

    /** Row lock while a cheque number is taken from the book, so two drafts never share a leaf. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM ChequeBook b WHERE b.id = :id")
    Optional<ChequeBook> findByIdForUpdate(@Param("id") Long id);
}
