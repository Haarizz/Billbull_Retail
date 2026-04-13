package com.billbull.backend.financials.pdc;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PdcRepository extends JpaRepository<PdcEntry, Long> {
    List<PdcEntry> findByStatus(PdcStatus status);
}
