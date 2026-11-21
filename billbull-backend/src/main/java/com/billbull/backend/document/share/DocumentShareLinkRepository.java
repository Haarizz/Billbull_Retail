package com.billbull.backend.document.share;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface DocumentShareLinkRepository extends JpaRepository<DocumentShareLink, Long> {

    Optional<DocumentShareLink> findByTokenHash(String tokenHash);

    List<DocumentShareLink> findTop10ByDocumentTypeAndDocumentIdAndIsActiveTrueOrderByIdDesc(String documentType, Long documentId);

    /** Atomic counter bump, so concurrent opens of one link never lose a view. */
    @Modifying
    @Transactional
    @Query("update DocumentShareLink l set l.viewCount = l.viewCount + 1, l.lastViewedAt = :now where l.id = :id")
    int recordView(@Param("id") Long id, @Param("now") LocalDateTime now);

    @Modifying
    @Transactional
    @Query("update DocumentShareLink l set l.pdf = :pdf where l.id = :id and l.pdf is null")
    int storePdf(@Param("id") Long id, @Param("pdf") byte[] pdf);
}
