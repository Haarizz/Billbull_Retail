package com.billbull.backend.purchase.settings;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface PurchaseDocumentNumberSettingRepository
        extends JpaRepository<PurchaseDocumentNumberSetting, PurchaseDocumentType> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM PurchaseDocumentNumberSetting s WHERE s.documentType = :documentType")
    Optional<PurchaseDocumentNumberSetting> findLockedByDocumentType(
            @Param("documentType") PurchaseDocumentType documentType);
}
