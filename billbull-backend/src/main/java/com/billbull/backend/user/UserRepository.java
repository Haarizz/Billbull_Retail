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

    /**
     * The id of the employee linked to a username, read as a scalar.
     *
     * <p>{@code User.linkedEmployee} is a LAZY association and {@code spring.jpa.open-in-view} is
     * off, so reading it through {@code findByUsername(...).getLinkedEmployee()} from a controller
     * hands back an uninitialised proxy whose session has already closed — touching any field then
     * throws {@code LazyInitializationException}. Selecting just the id keeps the proxy inside the
     * query. Empty when the user does not exist or has no linked employee (the implicit join is an
     * inner join).
     */
    @Query("SELECT u.linkedEmployee.id FROM User u WHERE u.username = :username")
    Optional<Long> findLinkedEmployeeIdByUsername(@Param("username") String username);

    List<User> findByBranchIsNull();
}
