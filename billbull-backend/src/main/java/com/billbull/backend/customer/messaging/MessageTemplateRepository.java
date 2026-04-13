package com.billbull.backend.customer.messaging;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
// Repository for Message Templates
public interface MessageTemplateRepository extends JpaRepository<MessageTemplate, Long> {
}
