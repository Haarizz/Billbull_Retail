package com.billbull.backend.sales.settings;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface SalesDocumentNumberSettingRepository
        extends JpaRepository<SalesDocumentNumberSetting, SalesDocumentType> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SalesDocumentNumberSetting s WHERE s.documentType = :documentType")
    Optional<SalesDocumentNumberSetting> findLockedByDocumentType(
            @Param("documentType") SalesDocumentType documentType);
}
