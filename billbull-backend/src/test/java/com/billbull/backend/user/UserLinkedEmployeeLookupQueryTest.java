package com.billbull.backend.user;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import com.billbull.backend.hr.employees.Employee;

import jakarta.persistence.EntityManager;

/**
 * Executes {@link UserRepository#findLinkedEmployeeIdByUsername} against the real database.
 *
 * <p>This query exists because reading {@code User.linkedEmployee} from a controller throws
 * {@code LazyInitializationException} (LAZY association, open-in-view off) — a defect that mocked
 * unit tests cannot see, found only by calling the live endpoint. This pins the replacement query's
 * JPQL and its inner-join semantics: an unlinked user yields an empty result, not an error.
 *
 * <p>Named {@code ...Test}, not {@code ...IT}: there is no failsafe plugin. Needs a datasource, like
 * {@code BillbullBackendApplicationTests}; {@code @Transactional} rolls the fixtures back.
 */
@SpringBootTest
@Transactional
class UserLinkedEmployeeLookupQueryTest {

    @Autowired private UserRepository userRepository;
    @Autowired private EntityManager entityManager;

    private User user(String username, Employee linked) {
        User u = new User();
        u.setUsername(username);
        u.setPassword("x");
        u.setLinkedEmployee(linked);
        entityManager.persist(u);
        return u;
    }

    private Employee employee(String code) {
        Employee e = new Employee();
        e.setEmployeeCode(code);
        e.setFirstName("Test");
        e.setLastName(code);
        e.setPhone("000");
        e.setEmail(code.toLowerCase() + "@example.test");
        e.setStatus("Active");
        entityManager.persist(e);
        return e;
    }

    @Test
    void returnsTheLinkedEmployeeIdForALinkedUser() {
        Employee emp = employee("T-UL-LINKED");
        user("t-ul-linked-user", emp);
        entityManager.flush();
        entityManager.clear();

        assertThat(userRepository.findLinkedEmployeeIdByUsername("t-ul-linked-user"))
                .contains(emp.getId());
    }

    @Test
    void isEmptyForAUserWithNoLinkedEmployee() {
        user("t-ul-unlinked-user", null);
        entityManager.flush();

        assertThat(userRepository.findLinkedEmployeeIdByUsername("t-ul-unlinked-user")).isEmpty();
    }

    @Test
    void isEmptyForAnUnknownUsername() {
        assertThat(userRepository.findLinkedEmployeeIdByUsername("t-ul-nobody")).isEmpty();
    }
}
