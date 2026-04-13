package com.billbull.backend.customer.inquiries;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface InquiryItemRepository extends JpaRepository<InquiryItem, Long> {
}
