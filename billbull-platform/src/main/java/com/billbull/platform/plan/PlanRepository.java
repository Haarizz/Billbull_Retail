package com.billbull.platform.plan;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PlanRepository extends JpaRepository<Plan, Long> {

    Optional<Plan> findByCodeIgnoreCase(String code);

    List<Plan> findAllByOrderByIdAsc();
}
