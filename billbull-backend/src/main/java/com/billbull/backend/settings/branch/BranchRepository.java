package com.billbull.backend.settings.branch;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface BranchRepository extends JpaRepository<Branch, Long> {

    Optional<Branch> findByIsDefaultTrue();

    boolean existsByCode(String code);

    boolean existsByCodeAndIdNot(String code, Long id);

    Optional<Branch> findByNameIgnoreCase(String name);

    Optional<Branch> findByCodeIgnoreCase(String code);
}
