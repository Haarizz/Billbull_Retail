package com.billbull.backend.settings.whatsapp;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WhatsAppMessageLogRepository extends JpaRepository<WhatsAppMessageLog, Long> {

    Optional<WhatsAppMessageLog> findByWamid(String wamid);

    List<WhatsAppMessageLog> findTop20ByDocumentTypeAndDocumentIdOrderByIdDesc(String documentType, Long documentId);
}
