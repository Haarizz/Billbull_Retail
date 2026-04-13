package com.billbull.backend.customer.inquiries;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CustomerInquiryRepository extends JpaRepository<CustomerInquiry, Long> {
	@Query("""
		    select i from CustomerInquiry i
		    left join fetch i.followUps
		    where i.id = :id
		""")
		Optional<CustomerInquiry> findByIdWithFollowUps(Long id);

}
