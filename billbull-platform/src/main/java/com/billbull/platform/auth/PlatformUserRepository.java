package com.billbull.platform.auth;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformUserRepository extends JpaRepository<PlatformUser, Long> {

    Optional<PlatformUser> findByEmailIgnoreCase(String email);

    long countByRoleAndActiveTrue(PlatformRole role);

    List<PlatformUser> findAllByOrderByEmailAsc();
}
