package com.billbull.backend.user;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsernameAndIsActiveTrue(String username);

    Optional<User> findByUsername(String username);

    /**
     * ARCHFIX §1.6: per-request liveness check for JwtFilter. The previous
     * findByUsername(...).map(isActive) loaded the whole User entity AND its EAGER roles +
     * additionalBranches join-tables on EVERY authenticated request — even though the filter only
     * needs the isActive flag (roles/branches come from the JWT claims, not the entity). This
     * boolean exists-query touches just the users row, eliminating that per-request fan-out.
     */
    boolean existsByUsernameAndIsActiveTrue(String username);

    Optional<User> findByEmailAndIsActiveTrue(String email);

    Optional<User> findByEmail(String email);

    @Query("SELECT u FROM User u LEFT JOIN FETCH u.branch LEFT JOIN FETCH u.primaryRole WHERE u.linkedEmployee.id = :employeeId")
    Optional<User> findByLinkedEmployee_Id(@Param("employeeId") Long employeeId);

    List<User> findByBranchIsNull();
}
